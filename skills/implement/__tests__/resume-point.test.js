// Tests for skills/implement/bin/resume-point.js (#25): `/implement --resume <id>` reads the saved
// state and the plan, and says where to re-enter, which tasks are finished, and which half-done
// tasks must have their files restored first.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCRIPT = path.join(__dirname, '..', 'bin', 'resume-point.js');

const PLAN = `# Plan

<tasks story="7">
  <task id="1" parallel_group="1" type="auto">
    <name>One</name>
    <files>src/a.js</files>
  </task>
  <task id="2" parallel_group="1" type="auto">
    <name>Two</name>
    <files>src/b.js</files>
  </task>
  <task id="3" parallel_group="2" type="auto">
    <name>Three</name>
    <files>src/c.js</files>
  </task>
  <task id="4" parallel_group="3" type="auto">
    <name>Four</name>
    <read_first>src/c.js</read_first>
    <files>src/d.js, src/e.js</files>
  </task>
  <task id="5" parallel_group="3" type="auto">
    <name>Five</name>
    <files>src/f.js</files>
  </task>
  <task id="6" parallel_group="4" type="test" must_fail="true">
    <name>Six</name>
    <files>test/g.test.js</files>
  </task>
</tasks>
`;

function state({ runMode = 'interactive', next = 'wave-3', statuses }) {
  const rows = statuses.map((s, i) => `| ${i + 1} | "t${i + 1}" | 1 | 1 | ${s} | x |`).join('\n');
  return `# Executor state — story 7

run-mode: ${runMode}
step: wave-2
next: ${next}
updated: 2026-10-05T12:00:00Z

## Progress

| Task | Name | Wave | Attempts | Status | Summary |
|---|---|---|---|---|---|
${rows}
`;
}

function withStory({ plan = PLAN, stateText }, fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'resume-point-'));
  const dir = path.join(root, 'tasks', 'stories', '7');
  fs.mkdirSync(dir, { recursive: true });
  if (plan !== null) fs.writeFileSync(path.join(dir, 'plan.md'), plan);
  if (stateText !== null) fs.writeFileSync(path.join(dir, 'executor-state.md'), stateText);
  try { return fn(root); } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

function run(root, id = '7') {
  const r = spawnSync(process.execPath, [SCRIPT, '--root', root, id], { encoding: 'utf8' });
  const fields = {};
  for (const line of r.stdout.split('\n')) {
    const m = line.match(/^([a-z-]+): ?(.*)$/);
    if (m) fields[m[1]] = m[2];
  }
  return { code: r.status, out: r.stdout, err: r.stderr, fields };
}

test('Resume_StoppedAfterTask3Of6_ReentersAtTask4AndSkipsTasks1To3', () => {
  const stateText = state({ statuses: ['verified', 'verified', 'verified', 'pending', 'pending', 'pending'] });
  withStory({ stateText }, (root) => {
    const r = run(root);
    assert.equal(r.code, 0, r.err);
    assert.equal(r.fields.next, 'wave-3');
    assert.equal(r.fields.finished, '1, 2, 3');
    assert.equal(r.fields['to-run'], '4, 5, 6');
    assert.equal(r.fields.restore, 'none');
  });
});

test('Resume_TaskHalfwayThrough_ListsItsDeclaredFilesToRestore', () => {
  const stateText = state({ statuses: ['done', 'done', 'verified', 'running', 'pending', 'pending'] });
  withStory({ stateText }, (root) => {
    const r = run(root);
    assert.equal(r.code, 0, r.err);
    assert.equal(r.fields.next, 'wave-3');
    assert.equal(r.fields.restore, 'task 4: src/d.js, src/e.js');
  });
});

test('Resume_FailedTask_IsRestoredAndRerun', () => {
  const stateText = state({ statuses: ['verified', 'verified', 'failed', 'pending', 'pending', 'pending'] });
  withStory({ stateText }, (root) => {
    const r = run(root);
    assert.equal(r.fields.next, 'wave-2');
    assert.equal(r.fields.restore, 'task 3: src/c.js');
    assert.equal(r.fields['to-run'], '3, 4, 5, 6');
  });
});

test('Resume_HalfDoneMustFailTask_IsNeverRestored', () => {
  const stateText = state({ statuses: ['verified', 'verified', 'verified', 'verified', 'verified', 'running'] });
  withStory({ stateText }, (root) => {
    const r = run(root);
    assert.equal(r.fields.next, 'wave-4');
    assert.equal(r.fields.restore, 'none');
    assert.equal(r.fields['keep-as-is'], 'task 6 (must_fail: its test file is the evidence)');
  });
});

test('Resume_AutonomousRun_StaysAutonomous', () => {
  const stateText = state({ runMode: 'autonomous', statuses: ['verified', 'pending', 'pending', 'pending', 'pending', 'pending'] });
  withStory({ stateText }, (root) => {
    assert.equal(run(root).fields['run-mode'], 'autonomous');
  });
});

test('Resume_EveryTaskVerified_ReentersAtTheSavedNextStep', () => {
  const stateText = state({ next: 'review', statuses: Array(6).fill('verified') });
  withStory({ stateText }, (root) => {
    const r = run(root);
    assert.equal(r.fields.next, 'review');
    assert.equal(r.fields['to-run'], 'none');
  });
});

test('Resume_NoSavedState_SaysSoAndExitsNonZero', () => {
  withStory({ stateText: null }, (root) => {
    const r = run(root);
    assert.equal(r.code, 1);
    assert.match(r.out + r.err, /no saved state for story 7/);
  });
});

test('Resume_StateButNoPlan_SaysSoAndExitsNonZero', () => {
  withStory({ plan: null, stateText: state({ statuses: ['verified'] }) }, (root) => {
    const r = run(root);
    assert.equal(r.code, 1);
    assert.match(r.out + r.err, /no plan/);
  });
});

test('Resume_StoryIdWithPathCharacters_IsRefused', () => {
  withStory({ stateText: state({ statuses: ['verified'] }) }, (root) => {
    assert.equal(run(root, '../7').code, 1);
  });
});
