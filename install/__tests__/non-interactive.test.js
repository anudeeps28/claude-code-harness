'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const INSTALL_JS = path.resolve(__dirname, '..', 'install.js');
const INSTALL_SH = path.resolve(__dirname, '..', 'install.sh');

const ENTERPRISE_ONLY_AGENTS = [
  'story-understand-agent.md',
  'story-plan-agent.md',
  'story-executor-agent.md',
  'story-pr-agent.md',
  'sprint-plan-gap-analyzer.md',
  'sprint-plan-docs-reader.md',
  'sprint-plan-tracker-reader.md',
];

function makeTempProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-test-'));
  fs.mkdirSync(path.join(dir, '.git'), { recursive: true });
  return dir;
}

function runInstallJs(extraArgs, opts = {}) {
  return execFileSync('node', [INSTALL_JS, ...extraArgs], {
    timeout: 15_000,
    stdio: ['pipe', 'pipe', 'pipe'],
    input: '',
    ...opts,
  });
}

function runInstallSh(extraArgs, opts = {}) {
  return execFileSync('bash', [INSTALL_SH, ...extraArgs], {
    timeout: 15_000,
    stdio: ['pipe', 'pipe', 'pipe'],
    input: '',
    ...opts,
  });
}

// ── install.js ──────────────────────────────────────────────────────────────

test('install.js --yes without --global or --project exits with error', () => {
  assert.throws(
    () => runInstallJs(['--yes']),
    (err) => {
      assert.strictEqual(err.status, 1);
      assert.ok(err.stderr.toString().includes('--yes requires --global or --project'));
      return true;
    },
  );
});

test('install.js --yes --global --dry-run completes without hanging', () => {
  const out = runInstallJs(['--yes', '--global', '--dry-run']).toString();
  assert.ok(out.includes('DRY RUN'), 'should print dry run summary');
  assert.ok(out.includes('solo'), 'should default to solo pack');
});

test('install.js --yes --project installs without enterprise agents', () => {
  const dir = makeTempProject();
  try {
    runInstallJs(['--yes', '--project', dir]);
    const agents = fs.readdirSync(path.join(dir, '.claude', 'agents'));
    for (const enterprise of ENTERPRISE_ONLY_AGENTS) {
      assert.ok(
        !agents.includes(enterprise),
        `enterprise agent ${enterprise} should not be installed in solo mode`,
      );
    }
    assert.ok(agents.length > 0, 'should install some agents');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('install.js --yes --project writes a valid .harness-manifest.json', () => {
  const dir = makeTempProject();
  try {
    runInstallJs(['--yes', '--project', dir]);
    const manifestPath = path.join(dir, '.claude', '.harness-manifest.json');
    assert.ok(fs.existsSync(manifestPath), 'manifest must exist after install');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.equal(manifest.schemaVersion, 1);
    assert.ok(manifest.harnessVersion, 'harnessVersion must be set');
    assert.equal(manifest.installMode, 'project');
    assert.equal(manifest.workflowPack, 'solo');
    assert.ok(Array.isArray(manifest.installedFiles), 'installedFiles must be an array');
    assert.ok(manifest.installedFiles.length > 0, 'installedFiles must not be empty');
    assert.ok(manifest.installedAt, 'installedAt must be set');
    assert.ok(manifest.updatedAt, 'updatedAt must be set');
    // Verify installedFiles contains expected entries
    assert.ok(manifest.installedFiles.some(f => f.startsWith('skills/')), 'must include skills');
    assert.ok(manifest.installedFiles.some(f => f.startsWith('hooks/')), 'must include hooks');
    assert.ok(manifest.installedFiles.some(f => f.startsWith('agents/')), 'must include agents');
    assert.ok(manifest.installedFiles.some(f => f.startsWith('rules/')), 'must include rules');
    assert.ok(manifest.installedFiles.includes('settings.json'), 'must include settings.json');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('install.js --check --project after install prints valid JSON', () => {
  const dir = makeTempProject();
  try {
    runInstallJs(['--yes', '--project', dir]);
    const out = runInstallJs(['--check', '--project', dir]).toString();
    const result = JSON.parse(out);
    assert.ok(!result.error, 'no error after valid install');
    assert.ok(result.currentVersion, 'currentVersion present');
    assert.ok(result.latestVersion, 'latestVersion present');
    assert.ok(typeof result.behind === 'number', 'behind is a number');
    assert.ok(Array.isArray(result.orphans), 'orphans is an array');
    assert.ok(Array.isArray(result.drifted), 'drifted is an array');
    assert.equal(result.drifted.length, 0, 'no drift right after install');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('install.js --check detects drifted files when installed copy differs from source', () => {
  const dir = makeTempProject();
  try {
    runInstallJs(['--yes', '--project', dir]);
    const claudeDir = path.join(dir, '.claude');
    const manifest = JSON.parse(fs.readFileSync(path.join(claudeDir, '.harness-manifest.json'), 'utf8'));
    const firstSkill = manifest.installedFiles.find(f => f.startsWith('skills/') && f.endsWith('.md'));
    assert.ok(firstSkill, 'should have at least one skill file');

    // Mutate the installed copy so it differs from source
    const installedPath = path.join(claudeDir, firstSkill);
    fs.appendFileSync(installedPath, '\n<!-- local edit -->');

    const out = runInstallJs(['--check', '--project', dir]).toString();
    const result = JSON.parse(out);
    assert.ok(Array.isArray(result.drifted), 'drifted is an array');
    assert.ok(result.drifted.includes(firstSkill), `drifted should include ${firstSkill}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('install.js --check without manifest returns no-manifest error', () => {
  const dir = makeTempProject();
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true });
  try {
    const out = runInstallJs(['--check', '--project', dir]).toString();
    const result = JSON.parse(out);
    assert.equal(result.error, 'no-manifest');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('install.js --update --project after install succeeds and bumps manifest', () => {
  const dir = makeTempProject();
  try {
    runInstallJs(['--yes', '--project', dir]);
    const manifestPath = path.join(dir, '.claude', '.harness-manifest.json');
    const before = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    runInstallJs(['--update', '--skip-pull', '--project', dir]);
    const after = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    assert.ok(after.updatedAt >= before.updatedAt, 'updatedAt should be bumped');
    assert.ok(after.installedFiles.length > 0, 'installedFiles should be populated');
    assert.ok(fs.existsSync(path.join(dir, '.claude', 'settings.json.bak')), 'settings.json.bak should exist');
    // Snapshot directory should exist
    const backupsDir = path.join(os.homedir(), '.claude', '.harness-backups');
    assert.ok(fs.existsSync(backupsDir), 'backups directory should exist');
    const snapshots = fs.readdirSync(backupsDir);
    assert.ok(snapshots.length > 0, 'at least one snapshot should exist');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('install.js --switch-tracker todoist updates manifest and copies scripts', () => {
  const dir = makeTempProject();
  try {
    runInstallJs(['--yes', '--project', dir]);
    const manifestPath = path.join(dir, '.claude', '.harness-manifest.json');
    const before = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.equal(before.tracker, 'local', 'default tracker should be local (D2)');

    runInstallJs(['--switch-tracker', 'todoist', '--project', dir]);
    const after = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.equal(after.tracker, 'todoist', 'tracker should be todoist after switch');

    // Verify adapter scripts contain Todoist markers
    const activeDir = path.join(dir, '.claude', 'trackers', 'active');
    const scripts = fs.readdirSync(activeDir).filter(f => f.endsWith('.sh'));
    assert.ok(scripts.length > 0, 'adapter scripts should exist');
    const getIssue = fs.readFileSync(path.join(activeDir, 'get-issue.sh'), 'utf8');
    assert.ok(
      getIssue.includes('TODOIST_CLI') || getIssue.includes('check_auth_todoist') || getIssue.includes('td '),
      'get-issue.sh should contain Todoist markers'
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── Non-interactive personalization flags ───────────────────────────────────

test('install.js --yes --name/--project-name fills personalization (no sed needed)', () => {
  const dir = makeTempProject();
  try {
    runInstallJs(['--yes', '--project', dir, '--name', 'Anudeep', '--project-name', 'my-app']);
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, '.claude', '.harness-manifest.json'), 'utf8'));
    assert.equal(manifest.answers.userName, 'Anudeep', 'userName should come from --name');
    assert.equal(manifest.answers.projectName, 'my-app', 'projectName should come from --project-name');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('install.js --yes --pack enterprise installs enterprise agents', () => {
  const dir = makeTempProject();
  try {
    runInstallJs(['--yes', '--project', dir, '--pack', 'enterprise']);
    const agents = fs.readdirSync(path.join(dir, '.claude', 'agents'));
    assert.ok(agents.includes('story-executor-agent.md'), 'enterprise agents should be installed');
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, '.claude', '.harness-manifest.json'), 'utf8'));
    assert.equal(manifest.workflowPack, 'enterprise');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('install.js --yes --prd-mode is honored in the manifest', () => {
  const dir = makeTempProject();
  try {
    runInstallJs(['--yes', '--project', dir, '--prd-mode', 'both-file-canonical']);
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, '.claude', '.harness-manifest.json'), 'utf8'));
    assert.equal(manifest.prdMode, 'both-file-canonical');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('install.js value flag without a value exits with error', () => {
  assert.throws(
    () => runInstallJs(['--yes', '--project', '/tmp', '--name']),
    (err) => {
      assert.strictEqual(err.status, 1);
      assert.ok(err.stderr.toString().includes('--name requires a value'));
      return true;
    },
  );
});

test('install.js rejects an invalid enum flag value', () => {
  assert.throws(
    () => runInstallJs(['--yes', '--project', '/tmp', '--pack', 'bogus']),
    (err) => {
      assert.strictEqual(err.status, 1);
      assert.ok(err.stderr.toString().includes('--pack must be one of'));
      return true;
    },
  );
});

test('install.js prints an actionable re-run command when values are left as placeholders', () => {
  const dir = makeTempProject();
  try {
    const out = runInstallJs(['--yes', '--project', dir]).toString();
    assert.ok(out.includes('re-running with:'), 'should offer a re-run command');
    assert.ok(out.includes('--name'), 'should name the flag that fills YOUR_NAME');
    assert.ok(out.includes('--project-name'), 'should name the flag that fills YOUR_PROJECT_NAME');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── install.sh is a thin forwarder ──────────────────────────────────────────

test('install.sh contains no independent copy/substitute/settings logic', () => {
  const shContent = fs.readFileSync(INSTALL_SH, 'utf8');
  // Must forward to install.js via exec
  assert.ok(shContent.includes('exec node'), 'install.sh must exec node');
  assert.ok(shContent.includes('install.js'), 'install.sh must reference install.js');
  // Must NOT contain any copy/sed/settings generation logic
  assert.ok(!shContent.includes('cp -r'), 'install.sh must not copy files itself');
  assert.ok(!shContent.includes('sed -i'), 'install.sh must not run sed substitutions');
  assert.ok(!shContent.includes('settings.json'), 'install.sh must not generate settings.json');
  assert.ok(!shContent.includes('cat >'), 'install.sh must not write files with heredoc');
});

test('install.sh --yes without --global or --project exits with error', () => {
  assert.throws(
    () => runInstallSh(['--yes']),
    (err) => {
      assert.strictEqual(err.status, 1);
      assert.ok(err.stderr.toString().includes('--yes requires --global or --project'));
      return true;
    },
  );
});

test('install.sh --yes --global --dry-run completes without hanging', () => {
  const out = runInstallSh(['--yes', '--global', '--dry-run']).toString();
  assert.ok(out.includes('DRY RUN'), 'should print dry run summary');
  assert.ok(out.includes('solo'), 'should default to solo pack');
});

test('install.sh --yes --project installs without enterprise agents', () => {
  const dir = makeTempProject();
  try {
    runInstallSh(['--yes', '--project', dir]);
    const agents = fs.readdirSync(path.join(dir, '.claude', 'agents'));
    for (const enterprise of ENTERPRISE_ONLY_AGENTS) {
      assert.ok(
        !agents.includes(enterprise),
        `enterprise agent ${enterprise} should not be installed in solo mode`,
      );
    }
    assert.ok(agents.length > 0, 'should install some agents');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── WS3: Mode, gitignore, local tracker ─────────────────────────────────────

test('install.js --yes defaults to tracker=local with all 13 local scripts in active/', () => {
  const dir = makeTempProject();
  try {
    runInstallJs(['--yes', '--project', dir]);
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, '.claude', '.harness-manifest.json'), 'utf8'));
    assert.equal(manifest.tracker, 'local', 'D2: --yes defaults to local');
    assert.strictEqual(manifest.trackerMirror, undefined, 'no mirror in local mode');

    // All 13 contract scripts present (8 core + 5 wayfinding, contract v3.1)
    const activeDir = path.join(dir, '.claude', 'trackers', 'active');
    const scripts = fs.readdirSync(activeDir).filter(f => f.endsWith('.sh')).sort();
    const expected = [
      'add-blocker.sh', 'add-label.sh', 'assign-issue.sh', 'close-issue.sh',
      'comment-issue.sh', 'create-issue.sh', 'create-sub-issue.sh', 'get-blockers.sh',
      'get-issue-children.sh', 'get-issue.sh', 'get-sprint-issues.sh',
      'list-issues.sh', 'remove-label.sh',
    ];
    assert.deepStrictEqual(scripts, expected, 'all 13 local scripts must be in active/');

    // tasks/issues/ directory created
    assert.ok(fs.existsSync(path.join(dir, 'tasks', 'issues')), 'tasks/issues/ must exist');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('install.js --yes writes managed gitignore block, idempotent on re-install', () => {
  const dir = makeTempProject();
  try {
    runInstallJs(['--yes', '--project', dir]);
    const gitignorePath = path.join(dir, '.gitignore');
    assert.ok(fs.existsSync(gitignorePath), '.gitignore must be created');
    const content = fs.readFileSync(gitignorePath, 'utf8');
    assert.ok(content.includes('claude-code-harness managed'), 'sentinel must be present');
    assert.ok(content.includes('tasks/issues/'), 'tasks/issues/ must be in block');
    assert.ok(content.includes('tasks/todo.md'), 'tasks/todo.md must be in block');
    assert.ok(content.includes('_prototype/'), '_prototype/ (throwaway scratch) must be in block');

    // Re-run: block should appear exactly once
    runInstallJs(['--yes', '--project', dir]);
    const content2 = fs.readFileSync(gitignorePath, 'utf8');
    const count = content2.split('claude-code-harness managed').length - 1;
    assert.equal(count, 2, 'exactly 2 sentinel lines (start+end) after re-install');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('install.js --tracker github --yes installs github adapter', () => {
  const dir = makeTempProject();
  try {
    runInstallJs(['--yes', '--project', dir, '--tracker', 'github']);
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, '.claude', '.harness-manifest.json'), 'utf8'));
    assert.equal(manifest.tracker, 'github');
    const activeDir = path.join(dir, '.claude', 'trackers', 'active');
    const getIssue = fs.readFileSync(path.join(activeDir, 'get-issue.sh'), 'utf8');
    assert.ok(getIssue.includes('gh ') || getIssue.includes('check_auth_github'), 'should be github adapter');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('install.js --update crossing: old manifest gains trackerMirror, archives todo.md', () => {
  const dir = makeTempProject();
  try {
    // Simulate pre-modes manifest by installing then stripping the new field
    runInstallJs(['--yes', '--project', dir, '--tracker', 'github']);
    const manifestPath = path.join(dir, '.claude', '.harness-manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    delete manifest.trackerMirror;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

    // Create a hand-written todo.md
    const todoPath = path.join(dir, 'tasks', 'todo.md');
    fs.mkdirSync(path.join(dir, 'tasks'), { recursive: true });
    fs.writeFileSync(todoPath, '# My manual board\n- [ ] Task 1\n', 'utf8');

    // Run update
    runInstallJs(['--update', '--project', dir, '--skip-pull']);
    const afterManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.strictEqual(afterManifest.trackerMirror, true, 'crossing defaults to trackerMirror=true');

    // Old todo.md should be archived
    const backupPath = path.join(dir, 'tasks', 'todo-manual-backup.md');
    assert.ok(fs.existsSync(backupPath), 'old todo.md must be archived');
    const backupContent = fs.readFileSync(backupPath, 'utf8');
    assert.ok(backupContent.includes('Task 1'), 'backup must preserve original content');

    // Second update: should NOT re-ask (sticky)
    runInstallJs(['--update', '--project', dir, '--skip-pull']);
    const afterManifest2 = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.strictEqual(afterManifest2.trackerMirror, true, 'field is sticky on subsequent updates');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('install.js --update crossing: no todo.md present → no archive, no error', () => {
  const dir = makeTempProject();
  try {
    runInstallJs(['--yes', '--project', dir, '--tracker', 'github']);
    const manifestPath = path.join(dir, '.claude', '.harness-manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    delete manifest.trackerMirror;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

    // Ensure no todo.md
    const todoPath = path.join(dir, 'tasks', 'todo.md');
    if (fs.existsSync(todoPath)) fs.rmSync(todoPath);

    // Should not throw
    runInstallJs(['--update', '--project', dir, '--skip-pull']);
    const afterManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.strictEqual(afterManifest.trackerMirror, true);
    assert.ok(!fs.existsSync(path.join(dir, 'tasks', 'todo-manual-backup.md')));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('install.js --switch-tracker local creates tasks/issues/ and sets trackerMirror=false', () => {
  const dir = makeTempProject();
  try {
    runInstallJs(['--yes', '--project', dir, '--tracker', 'github']);
    runInstallJs(['--switch-tracker', 'local', '--project', dir]);
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, '.claude', '.harness-manifest.json'), 'utf8'));
    assert.equal(manifest.tracker, 'local');
    assert.strictEqual(manifest.trackerMirror, false, 'local mode clears mirror');
    assert.ok(fs.existsSync(path.join(dir, 'tasks', 'issues')), 'tasks/issues/ must be created');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
