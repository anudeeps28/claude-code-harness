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
    assert.equal(before.tracker, 'github', 'default tracker should be github');

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
