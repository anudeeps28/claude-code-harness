'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { verifyInstall } = require('../lib/updater.js');

const INSTALL_JS = path.resolve(__dirname, '..', 'install.js');
const INSTALL_SH = path.resolve(__dirname, '..', 'install.sh');
// Install with the "local" update channel pointed at this repo so post-install
// --check/--update/--switch-tracker read the real source tree offline (no network fetch).
const REPO = path.resolve(__dirname, '..', '..');
const LOCAL = ['--local', REPO];

const ENTERPRISE_ONLY_AGENTS = [
  'story-plan-agent.md',
  'sprint-plan-gap-analyzer.md',
  'sprint-plan-docs-reader.md',
  'sprint-plan-tracker-reader.md',
];

const ENTERPRISE_ONLY_SKILLS = ['story', 'sprint-plan'];

// Agents that solo-pack skills (/implement, /run-tasks) spawn by name. Skipping
// any of these in the solo pack leaves those skills pointing at agents that were
// never installed — the roster drift this list guards against.
const SOLO_REQUIRED_AGENTS = [
  'implement-planner-agent.md',
  'story-understand-agent.md',
  'story-executor-agent.md',
  'story-pr-agent.md',
];

const REMOVED_ROLE_AGENTS = ['navigator.md', 'shipwright.md', 'lookout.md', 'warden.md', 'harbormaster.md'];
const ROSTER_MODEL = 'claude-opus-5[1m]';
const PHASE_IDS = ['planning', 'coding', 'testing', 'reviewing', 'shipping'];

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

// The pack→install-args mapping used by every test that installs both packs.
function installArgsFor(pack, dir) {
  return pack === 'solo'
    ? ['--yes', '--project', dir, ...LOCAL]
    : ['--yes', '--project', dir, '--pack', pack, ...LOCAL];
}

// The dirs verifyInstall scans for unresolved placeholders — mirrors runUpdate's sedDirs.
function sedDirsFor(claudeDir) {
  return ['skills', 'agents', 'hooks', 'rules', 'trackers', 'code-platform']
    .map((d) => path.join(claudeDir, d))
    .filter((d) => fs.existsSync(d));
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
    runInstallJs(['--yes', '--project', dir, ...LOCAL]);
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

test('install.js solo install ships every agent its skills spawn by name', () => {
  const dir = makeTempProject();
  try {
    runInstallJs(['--yes', '--project', dir, ...LOCAL]);
    const agents = fs.readdirSync(path.join(dir, '.claude', 'agents'));
    for (const required of SOLO_REQUIRED_AGENTS) {
      assert.ok(
        agents.includes(required),
        `${required} is spawned by a solo-pack skill and must be installed in solo mode`,
      );
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('install.js solo install omits enterprise-only skills', () => {
  const dir = makeTempProject();
  try {
    runInstallJs(['--yes', '--project', dir, ...LOCAL]);
    const skills = fs.readdirSync(path.join(dir, '.claude', 'skills'));
    for (const skill of ENTERPRISE_ONLY_SKILLS) {
      assert.ok(
        !skills.includes(skill),
        `enterprise skill /${skill} should not be installed in solo mode`,
      );
    }
    assert.ok(skills.includes('implement'), 'solo pack must ship /implement');
    assert.ok(skills.includes('run-tasks'), 'solo pack must ship /run-tasks');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('install.js enterprise install ships enterprise skills and agents', () => {
  const dir = makeTempProject();
  try {
    runInstallJs(['--yes', '--project', dir, '--pack', 'enterprise', ...LOCAL]);
    const skills = fs.readdirSync(path.join(dir, '.claude', 'skills'));
    const agents = fs.readdirSync(path.join(dir, '.claude', 'agents'));
    for (const skill of ENTERPRISE_ONLY_SKILLS) {
      assert.ok(skills.includes(skill), `enterprise pack must ship /${skill}`);
    }
    for (const agent of [...ENTERPRISE_ONLY_AGENTS, ...SOLO_REQUIRED_AGENTS]) {
      assert.ok(agents.includes(agent), `enterprise pack must ship ${agent}`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('every agent spawned by an installed solo skill exists in the solo install', () => {
  const dir = makeTempProject();
  try {
    runInstallJs(['--yes', '--project', dir, ...LOCAL]);
    const claudeDir = path.join(dir, '.claude');
    const agents = new Set(
      fs.readdirSync(path.join(claudeDir, 'agents')).map((f) => f.replace(/\.md$/, '')),
    );
    const skillsDir = path.join(claudeDir, 'skills');
    const missing = [];
    for (const skill of fs.readdirSync(skillsDir)) {
      const skillFile = path.join(skillsDir, skill, 'SKILL.md');
      if (!fs.existsSync(skillFile)) continue;
      const text = fs.readFileSync(skillFile, 'utf8');
      // Matches the skills' own convention for naming an agent to spawn:
      // "Spawn a **`story-pr-agent`**" / "spawn a `story-executor-agent`".
      for (const m of text.matchAll(/spawn(?:ing)?\s+(?:each\s+as\s+)?an?\s+\*{0,2}`([a-z0-9-]+-agent)`/gi)) {
        if (!agents.has(m[1])) missing.push(`skills/${skill} spawns ${m[1]}`);
      }
    }
    assert.deepStrictEqual(missing, [], `solo install has skills spawning uninstalled agents:\n${missing.join('\n')}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── Roster v2 conformance ────────────────────────────────────────────────────

test('installed roster is schemaVersion 2 with the builder/reviewer pipeline', () => {
  for (const pack of ['solo', 'enterprise']) {
    const dir = makeTempProject();
    try {
      const args = installArgsFor(pack, dir);
      runInstallJs(args);
      const roster = JSON.parse(fs.readFileSync(path.join(dir, '.claude', 'harness-roles.json'), 'utf8'));

      assert.strictEqual(roster.schemaVersion, 2, `${pack}: schemaVersion must be 2`);
      assert.deepStrictEqual(roster.pipeline, ['builder', 'reviewer'], `${pack}: pipeline must be builder/reviewer`);
      assert.deepStrictEqual(
        Object.keys(roster.roles).sort(),
        ['builder', 'reviewer'],
        `${pack}: roles must be exactly builder/reviewer`,
      );

      const allPhaseIds = [];
      for (const roleName of ['builder', 'reviewer']) {
        const role = roster.roles[roleName];
        for (const field of ['displayName', 'agent', 'model']) {
          assert.ok(typeof role[field] === 'string' && role[field].length > 0, `${pack} ${roleName}: ${field} must be a non-empty string`);
        }
        assert.strictEqual(role.model, ROSTER_MODEL, `${pack} ${roleName}: model must be ${ROSTER_MODEL}`);
        assert.strictEqual(role.stages, undefined, `${pack} ${roleName}: stages must be absent (removed from the roster shape)`);
        for (const field of ['skills', 'producesArtifacts', 'phases']) {
          assert.ok(Array.isArray(role[field]) && role[field].length > 0, `${pack} ${roleName}: ${field} must be a non-empty array`);
        }
        for (const p of role.phases) {
          assert.ok(typeof p === 'object' && p !== null, `${pack} ${roleName}: phases entries must be objects`);
          assert.ok(typeof p.id === 'string' && p.id.length > 0, `${pack} ${roleName}: phases[].id must be a non-empty string`);
          assert.ok(typeof p.displayName === 'string' && p.displayName.length > 0, `${pack} ${roleName}: phases[].displayName must be a non-empty string`);
          assert.ok(PHASE_IDS.includes(p.id), `${pack} ${roleName}: phases[].id ${p.id} must be one of ${PHASE_IDS.join(',')}`);
          allPhaseIds.push(p.id);
        }
      }
      assert.strictEqual(roster.roles.builder.effort, 'medium', `${pack}: builder effort must be medium`);
      assert.strictEqual(roster.roles.reviewer.effort, 'high', `${pack}: reviewer effort must be high`);

      assert.deepStrictEqual(
        [...new Set(allPhaseIds)].sort(),
        [...PHASE_IDS].sort(),
        `${pack}: union of roles' phases must cover all five phase ids`,
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

test('every roster role agent is installed and the old role agents are gone', () => {
  for (const pack of ['solo', 'enterprise']) {
    const dir = makeTempProject();
    try {
      const args = installArgsFor(pack, dir);
      runInstallJs(args);
      const claudeDir = path.join(dir, '.claude');
      const roster = JSON.parse(fs.readFileSync(path.join(claudeDir, 'harness-roles.json'), 'utf8'));
      const agents = fs.readdirSync(path.join(claudeDir, 'agents'));

      for (const roleName of Object.keys(roster.roles)) {
        const agentFile = `${roster.roles[roleName].agent}.md`;
        assert.ok(agents.includes(agentFile), `${pack}: ${agentFile} (roster role ${roleName}) must be installed`);
      }
      assert.ok(agents.includes('builder.md'), `${pack}: builder.md must be installed`);
      assert.ok(agents.includes('reviewer.md'), `${pack}: reviewer.md must be installed`);
      for (const removed of REMOVED_ROLE_AGENTS) {
        assert.ok(!agents.includes(removed), `${pack}: ${removed} must not be installed`);
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  for (const removed of REMOVED_ROLE_AGENTS) {
    assert.ok(!fs.existsSync(path.join(REPO, 'agents', removed)), `${removed} must not exist in the repo source`);
  }
});

test('roster skills are installed in their pack', () => {
  for (const pack of ['solo', 'enterprise']) {
    const dir = makeTempProject();
    try {
      const args = installArgsFor(pack, dir);
      runInstallJs(args);
      const claudeDir = path.join(dir, '.claude');
      const roster = JSON.parse(fs.readFileSync(path.join(claudeDir, 'harness-roles.json'), 'utf8'));

      for (const roleName of ['builder', 'reviewer']) {
        for (const skill of roster.roles[roleName].skills) {
          const skillDir = path.join(claudeDir, 'skills', skill);
          assert.ok(
            fs.existsSync(skillDir) && fs.statSync(skillDir).isDirectory(),
            `${pack}: roster skill ${skill} (role ${roleName}) must be an installed skill directory`,
          );
        }
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

// Required phase-marker keys per rules/phase-markers.md. Verifies the skill names
// ALL of them (not just a substring of the top-of-file section) — a skill that lost
// every concrete per-boundary write instruction but kept the intro paragraph would
// still fail this, because the "six plain key: value lines" list has to name each key.
const MARKER_KEYS = ['schemaVersion', 'phase', 'role', 'updated', 'skill', 'detail'];

function assertMarkerKeysNamed(text, label) {
  const normalized = text.replace(/\s+/g, ' ');
  const m = normalized.match(/six plain `key: value` lines[^(]*\(([^)]*)\)/i);
  assert.ok(m, `${label}: must name the six phase-marker keys in a "six plain key: value lines (...)" list`);
  const listed = m[1];
  for (const key of MARKER_KEYS) {
    assert.ok(
      new RegExp('`' + key + '(:|`)').test(listed),
      `${label}: marker key list must name \`${key}\` (got: ${listed})`,
    );
  }
}

test('phase-marker rule ships and the build skills reference it', () => {
  const soloDir = makeTempProject();
  try {
    runInstallJs(['--yes', '--project', soloDir, ...LOCAL]);
    const soloClaudeDir = path.join(soloDir, '.claude');
    assert.ok(fs.existsSync(path.join(soloClaudeDir, 'rules', 'phase-markers.md')), 'solo: rules/phase-markers.md must be installed');
    for (const skill of ['implement', 'run-tasks']) {
      const skillFile = path.join(soloClaudeDir, 'skills', skill, 'SKILL.md');
      const text = fs.readFileSync(skillFile, 'utf8');
      assert.ok(text.includes('rules/phase-markers.md'), `solo: skills/${skill}/SKILL.md must reference rules/phase-markers.md`);
      assert.ok(text.includes('phase.md'), `solo: skills/${skill}/SKILL.md must mention phase.md`);
      assertMarkerKeysNamed(text, `solo: skills/${skill}/SKILL.md`);
    }
    for (const id of PHASE_IDS) {
      const implementText = fs.readFileSync(path.join(soloClaudeDir, 'skills', 'implement', 'SKILL.md'), 'utf8');
      assert.ok(
        new RegExp('`phase: ' + id + '`').test(implementText),
        `solo: skills/implement/SKILL.md must write \`phase: ${id}\` — must cover all five phase ids`,
      );
    }
    const evaluateText = fs.readFileSync(path.join(soloClaudeDir, 'skills', 'evaluate', 'SKILL.md'), 'utf8');
    assert.ok(evaluateText.includes('`role: reviewer`'), 'solo: skills/evaluate/SKILL.md must carry a `role: reviewer` marker instruction');

    for (const skill of fs.readdirSync(path.join(soloClaudeDir, 'skills'))) {
      const skillFile = path.join(soloClaudeDir, 'skills', skill, 'SKILL.md');
      if (!fs.existsSync(skillFile)) continue;
      assert.ok(!fs.readFileSync(skillFile, 'utf8').includes('persona:'), `solo: skills/${skill}/SKILL.md must not use \`persona:\` as a marker key (removed from the contract)`);
    }
  } finally {
    fs.rmSync(soloDir, { recursive: true, force: true });
  }

  const entDir = makeTempProject();
  try {
    runInstallJs(['--yes', '--project', entDir, '--pack', 'enterprise', ...LOCAL]);
    const entClaudeDir = path.join(entDir, '.claude');
    assert.ok(fs.existsSync(path.join(entClaudeDir, 'rules', 'phase-markers.md')), 'enterprise: rules/phase-markers.md must be installed');
    for (const skill of ['implement', 'run-tasks', 'story']) {
      const skillFile = path.join(entClaudeDir, 'skills', skill, 'SKILL.md');
      const text = fs.readFileSync(skillFile, 'utf8');
      assert.ok(text.includes('rules/phase-markers.md'), `enterprise: skills/${skill}/SKILL.md must reference rules/phase-markers.md`);
      assert.ok(text.includes('phase.md'), `enterprise: skills/${skill}/SKILL.md must mention phase.md`);
      assertMarkerKeysNamed(text, `enterprise: skills/${skill}/SKILL.md`);
    }
    for (const id of PHASE_IDS) {
      const implementText = fs.readFileSync(path.join(entClaudeDir, 'skills', 'implement', 'SKILL.md'), 'utf8');
      assert.ok(
        new RegExp('`phase: ' + id + '`').test(implementText),
        `enterprise: skills/implement/SKILL.md must write \`phase: ${id}\` — must cover all five phase ids`,
      );
    }
    const evaluateText = fs.readFileSync(path.join(entClaudeDir, 'skills', 'evaluate', 'SKILL.md'), 'utf8');
    assert.ok(evaluateText.includes('`role: reviewer`'), 'enterprise: skills/evaluate/SKILL.md must carry a `role: reviewer` marker instruction');

    for (const skill of fs.readdirSync(path.join(entClaudeDir, 'skills'))) {
      const skillFile = path.join(entClaudeDir, 'skills', skill, 'SKILL.md');
      if (!fs.existsSync(skillFile)) continue;
      assert.ok(!fs.readFileSync(skillFile, 'utf8').includes('persona:'), `enterprise: skills/${skill}/SKILL.md must not use \`persona:\` as a marker key (removed from the contract)`);
    }
  } finally {
    fs.rmSync(entDir, { recursive: true, force: true });
  }
});

test('update migrates a pre-pack-filter solo install: prunes enterprise skills, restores story agents', () => {
  const dir = makeTempProject();
  try {
    runInstallJs(['--yes', '--project', dir, ...LOCAL]);
    const claudeDir = path.join(dir, '.claude');

    // Regress to the pre-fix shape: enterprise skills present, story agents absent.
    for (const skill of ENTERPRISE_ONLY_SKILLS) {
      fs.cpSync(path.join(REPO, 'skills', skill), path.join(claudeDir, 'skills', skill), { recursive: true });
    }
    const dropped = ['story-understand-agent.md', 'story-executor-agent.md', 'story-pr-agent.md'];
    for (const agent of dropped) fs.rmSync(path.join(claudeDir, 'agents', agent), { force: true });

    const manifestPath = path.join(claudeDir, '.harness-manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.installedFiles = [
      ...manifest.installedFiles.filter((f) => !dropped.some((d) => f === `agents/${d}`)),
      ...ENTERPRISE_ONLY_SKILLS.map((s) => `skills/${s}/SKILL.md`),
    ];
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

    runInstallJs(['--update', '--project', dir, ...LOCAL]);

    const skills = fs.readdirSync(path.join(claudeDir, 'skills'));
    for (const skill of ENTERPRISE_ONLY_SKILLS) {
      assert.ok(!skills.includes(skill), `update should prune enterprise skill /${skill} from a solo install`);
    }
    const agents = fs.readdirSync(path.join(claudeDir, 'agents'));
    for (const agent of dropped) {
      assert.ok(agents.includes(agent), `update should restore ${agent} to a solo install`);
    }
    assert.equal(
      JSON.parse(fs.readFileSync(manifestPath, 'utf8')).workflowPack, 'solo',
      'pack must stay solo across the migration',
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('update migrates a pre-roster-v2 solo install: v1 5-role roster becomes v2 builder/reviewer, old role agents pruned', () => {
  const dir = makeTempProject();
  try {
    runInstallJs(['--yes', '--project', dir, ...LOCAL]);
    const claudeDir = path.join(dir, '.claude');

    // Regress to the pre-change v1 shape: a 5-role roster (navigator/shipwright/
    // lookout/warden/harbormaster) plus their agent files, all tracked by the manifest.
    const oldRoleNames = ['navigator', 'shipwright', 'lookout', 'warden', 'harbormaster'];
    for (const name of oldRoleNames) {
      fs.writeFileSync(path.join(claudeDir, 'agents', `${name}.md`), `# ${name} (v1 role agent)\n`, 'utf8');
    }
    const v1Roster = {
      schemaVersion: 1,
      pipeline: oldRoleNames,
      roles: Object.fromEntries(oldRoleNames.map((name) => [
        name,
        {
          displayName: name,
          agent: name,
          stages: ['understand'],
          skills: ['implement'],
          model: ROSTER_MODEL,
          effort: 'medium',
          producesArtifacts: [],
        },
      ])),
    };
    fs.writeFileSync(path.join(claudeDir, 'harness-roles.json'), JSON.stringify(v1Roster, null, 2), 'utf8');

    const manifestPath = path.join(claudeDir, '.harness-manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.installedFiles = [
      ...manifest.installedFiles,
      ...oldRoleNames.map((name) => `agents/${name}.md`),
    ];
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

    runInstallJs(['--update', '--project', dir, ...LOCAL]);

    const roster = JSON.parse(fs.readFileSync(path.join(claudeDir, 'harness-roles.json'), 'utf8'));
    assert.strictEqual(roster.schemaVersion, 2, 'update should migrate the roster to schemaVersion 2');
    assert.deepStrictEqual(roster.pipeline, ['builder', 'reviewer'], 'update should replace the pipeline with builder/reviewer');
    assert.deepStrictEqual(Object.keys(roster.roles).sort(), ['builder', 'reviewer'], 'update should replace the roles with builder/reviewer');

    const agents = fs.readdirSync(path.join(claudeDir, 'agents'));
    for (const name of oldRoleNames) {
      assert.ok(!agents.includes(`${name}.md`), `update should prune the old v1 role agent ${name}.md`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('verifyInstall is a real gate: passes on a good install, fails on each corruption', () => {
  const goodDir = makeTempProject();
  try {
    runInstallJs(['--yes', '--project', goodDir, ...LOCAL]);
    const claudeDir = path.join(goodDir, '.claude');
    assert.strictEqual(
      verifyInstall(claudeDir, sedDirsFor(claudeDir), 'solo'), 0,
      'a fresh, uncorrupted install must pass verifyInstall with 0 failures',
    );
  } finally {
    fs.rmSync(goodDir, { recursive: true, force: true });
  }

  // (i) truncate a required agent file to zero bytes.
  const truncDir = makeTempProject();
  try {
    runInstallJs(['--yes', '--project', truncDir, ...LOCAL]);
    const claudeDir = path.join(truncDir, '.claude');
    fs.writeFileSync(path.join(claudeDir, 'agents', 'builder.md'), '', 'utf8');
    assert.ok(
      verifyInstall(claudeDir, sedDirsFor(claudeDir), 'solo') > 0,
      'a zero-byte required agent file (agents/builder.md) must fail verifyInstall',
    );
  } finally {
    fs.rmSync(truncDir, { recursive: true, force: true });
  }

  // (ii) corrupt the installed roster's schemaVersion.
  const schemaDir = makeTempProject();
  try {
    runInstallJs(['--yes', '--project', schemaDir, ...LOCAL]);
    const claudeDir = path.join(schemaDir, '.claude');
    const rosterPath = path.join(claudeDir, 'harness-roles.json');
    const roster = JSON.parse(fs.readFileSync(rosterPath, 'utf8'));
    roster.schemaVersion = 1;
    fs.writeFileSync(rosterPath, JSON.stringify(roster, null, 2), 'utf8');
    assert.ok(
      verifyInstall(claudeDir, sedDirsFor(claudeDir), 'solo') > 0,
      'a roster with schemaVersion 1 must fail verifyInstall',
    );
  } finally {
    fs.rmSync(schemaDir, { recursive: true, force: true });
  }

  // (iii) roster drift: roles.reviewer.agent renamed to a name with no matching agent file.
  // This is the case a hardcoded required-file list cannot catch — verifyInstall must
  // derive the required agent from the roster itself.
  const driftDir = makeTempProject();
  try {
    runInstallJs(['--yes', '--project', driftDir, ...LOCAL]);
    const claudeDir = path.join(driftDir, '.claude');
    const rosterPath = path.join(claudeDir, 'harness-roles.json');
    const roster = JSON.parse(fs.readFileSync(rosterPath, 'utf8'));
    roster.roles.reviewer.agent = 'nonexistent-reviewer-agent';
    fs.writeFileSync(rosterPath, JSON.stringify(roster, null, 2), 'utf8');
    assert.ok(
      verifyInstall(claudeDir, sedDirsFor(claudeDir), 'solo') > 0,
      'a roster whose roles.reviewer.agent has no matching agent file must fail verifyInstall',
    );
  } finally {
    fs.rmSync(driftDir, { recursive: true, force: true });
  }
});

test('install.js --yes --project writes a valid .harness-manifest.json', () => {
  const dir = makeTempProject();
  try {
    runInstallJs(['--yes', '--project', dir, ...LOCAL]);
    const manifestPath = path.join(dir, '.claude', '.harness-manifest.json');
    assert.ok(fs.existsSync(manifestPath), 'manifest must exist after install');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.equal(manifest.schemaVersion, 2);
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
    runInstallJs(['--yes', '--project', dir, ...LOCAL]);
    const out = runInstallJs(['--check', '--project', dir]).toString();
    const result = JSON.parse(out);
    assert.ok(!result.error, 'no error after valid install');
    assert.ok(result.currentVersion, 'currentVersion present');
    assert.ok(result.latestVersion, 'latestVersion present');
    assert.equal(typeof result.updateAvailable, 'boolean', 'updateAvailable is a boolean');
    assert.equal(result.channel, 'local', 'channel reflects the local update config');
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
    runInstallJs(['--yes', '--project', dir, ...LOCAL]);
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
    runInstallJs(['--yes', '--project', dir, ...LOCAL]);
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

test('install.js --update --pin re-points channel to pinned and persists it', () => {
  const dir = makeTempProject();
  try {
    runInstallJs(['--yes', '--project', dir, ...LOCAL]);
    // Switch to a pinned channel during update; --source keeps it offline.
    runInstallJs(['--update', '--project', dir, '--pin', '3.1.0', '--source', REPO]);
    const m = JSON.parse(fs.readFileSync(path.join(dir, '.claude', '.harness-manifest.json'), 'utf8'));
    assert.equal(m.update.channel, 'pinned', 'channel switched to pinned');
    assert.equal(m.update.pinnedVersion, '3.1.0', 'pinned version persisted');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('install.js --switch-tracker todoist updates manifest and copies scripts', () => {
  const dir = makeTempProject();
  try {
    runInstallJs(['--yes', '--project', dir, ...LOCAL]);
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
    const out = runInstallJs(['--yes', '--project', dir, ...LOCAL]).toString();
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
    runInstallJs(['--yes', '--project', dir, ...LOCAL]);
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
    runInstallJs(['--yes', '--project', dir, ...LOCAL]);
    const gitignorePath = path.join(dir, '.gitignore');
    assert.ok(fs.existsSync(gitignorePath), '.gitignore must be created');
    const content = fs.readFileSync(gitignorePath, 'utf8');
    assert.ok(content.includes('claude-code-harness managed'), 'sentinel must be present');
    assert.ok(content.includes('tasks/issues/'), 'tasks/issues/ must be in block');
    assert.ok(content.includes('tasks/todo.md'), 'tasks/todo.md must be in block');
    assert.ok(content.includes('_prototype/'), '_prototype/ (throwaway scratch) must be in block');
    assert.ok(content.includes('grill-summary.md'), 'grill-summary.md (transient handoff) must be in block');
    assert.ok(content.includes('operator-state.md'), 'operator-state.md (chief-operator state) must be in block');

    // Re-run: block should appear exactly once
    runInstallJs(['--yes', '--project', dir, ...LOCAL]);
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
    runInstallJs(['--yes', '--project', dir, '--tracker', 'github', ...LOCAL]);
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
    runInstallJs(['--yes', '--project', dir, '--tracker', 'github', ...LOCAL]);
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
    runInstallJs(['--yes', '--project', dir, '--tracker', 'github', ...LOCAL]);
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
    runInstallJs(['--yes', '--project', dir, '--tracker', 'github', ...LOCAL]);
    runInstallJs(['--switch-tracker', 'local', '--project', dir]);
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, '.claude', '.harness-manifest.json'), 'utf8'));
    assert.equal(manifest.tracker, 'local');
    assert.strictEqual(manifest.trackerMirror, false, 'local mode clears mirror');
    assert.ok(fs.existsSync(path.join(dir, 'tasks', 'issues')), 'tasks/issues/ must be created');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
