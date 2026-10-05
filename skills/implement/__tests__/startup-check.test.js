// Tests for skills/implement/bin/startup-check.js (#22): before Phase 1, /implement checks that
// every agent, skill and adapter script it names is installed, and stops naming what is missing.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCRIPT = path.join(__dirname, '..', 'bin', 'startup-check.js');
const { readRequired } = require(SCRIPT);

const KIND_PATH = {
  agent: (n) => path.join('agents', `${n}.md`),
  skill: (n) => path.join('skills', n, 'SKILL.md'),
  'tracker-script': (n) => path.join('trackers', 'active', n),
  'code-platform-script': (n) => path.join('code-platform', 'active', n),
};

function makeClaudeDir(required, omit = () => false) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'startup-check-'));
  for (const r of required) {
    if (omit(r)) continue;
    const p = path.join(dir, KIND_PATH[r.kind](r.name));
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, `# ${r.name}\n`);
  }
  return dir;
}

function run(args) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

const REQUIRED = readRequired();

test('readRequired_ListsTheAgentsSkillsAndScriptsImplementNames', () => {
  const names = REQUIRED.map((r) => `${r.kind}:${r.name}`);
  for (const expected of [
    'agent:story-understand-agent', 'agent:implement-planner-agent', 'agent:story-executor-agent',
    'agent:evaluator-agent', 'agent:story-pr-agent', 'skill:local-test', 'skill:debug',
    'tracker-script:get-issue.sh',
  ]) {
    assert.ok(names.includes(expected), `expected ${expected} in the Required tools list, got ${names.join(', ')}`);
  }
  for (const r of REQUIRED) assert.ok(r.phase, `${r.kind} ${r.name} must name the phase that needs it`);
});

test('StartupCheck_EverythingInstalled_ExitsZeroAndPrintsNothing', () => {
  const dir = makeClaudeDir(REQUIRED);
  try {
    const r = run(['--claude-dir', dir]);
    assert.equal(r.code, 0, r.out + r.err);
    assert.equal(r.out, '');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('StartupCheck_AgentMissing_StopsAndNamesAgentAndPhase', () => {
  const dir = makeClaudeDir(REQUIRED, (r) => r.name === 'evaluator-agent');
  try {
    const r = run(['--claude-dir', dir]);
    assert.equal(r.code, 1, r.out + r.err);
    assert.match(r.out, /^missing agent: evaluator-agent \(needed by Phase 3[^)]*\)$/m);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('StartupCheck_FoundInSecondDir_CountsAsInstalled', () => {
  // A project install (first dir) can rely on a global install (second dir) for some tools.
  const agents = REQUIRED.filter((r) => r.kind === 'agent');
  const rest = REQUIRED.filter((r) => r.kind !== 'agent');
  const projectDir = makeClaudeDir(rest);
  const globalDir = makeClaudeDir(agents);
  try {
    const r = run(['--claude-dir', projectDir, '--claude-dir', globalDir]);
    assert.equal(r.code, 0, r.out + r.err);
  } finally {
    fs.rmSync(projectDir, { recursive: true, force: true });
    fs.rmSync(globalDir, { recursive: true, force: true });
  }
});

test('StartupCheck_ReworkOnlyScriptMissing_IgnoredUnlessReworkRequested', () => {
  const reworkOnly = REQUIRED.filter((r) => r.only === 'rework');
  assert.ok(reworkOnly.length > 0, 'the code-platform scripts are needed only by --rework');
  const dir = makeClaudeDir(REQUIRED, (r) => r.only === 'rework');
  try {
    assert.equal(run(['--claude-dir', dir]).code, 0, 'a normal build does not need the rework scripts');
    const r = run(['--claude-dir', dir, '--with', 'rework']);
    assert.equal(r.code, 1, r.out + r.err);
    assert.match(r.out, /^missing code-platform-script: get-pr-review-threads\.sh \(needed by Rework mode/m);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('StartupCheck_ReworkRun_DoesNotRequireBuildOnlyTools', () => {
  // A rework run never plans, so it must not stop because the planner is missing.
  const dir = makeClaudeDir(REQUIRED, (r) => r.only === 'build');
  try {
    assert.equal(run(['--claude-dir', dir, '--with', 'rework']).code, 0);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
