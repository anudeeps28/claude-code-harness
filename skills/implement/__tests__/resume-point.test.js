// Tests for skills/implement/bin/resume-point.js (#25, rewritten for F73 #83): `/implement --resume <id>`
// reads the saved state of a standalone story and says which step of the story loop to re-enter, and
// at which review round. There are no task statuses and no waves any more: the saved `step:` and
// `round:` are the whole position.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCRIPT = path.join(__dirname, '..', 'bin', 'resume-point.js');

// The per-story plan: a Demo and one "## Story #<id>" section.
const PLAN = `## Demo

Run the app and see the new button.

## Story #7 — Add the button

**Acceptance criteria and their proofs:**
1. The button shows
   - Proof: unit — Button_Shows
   - Seen by: the rendered page
   - Would lie if: the page is empty
`;

// What a run before #83 saved: task XML in the plan and a per-task Progress table in the state.
const LEGACY_PLAN = `# Plan

<tasks story="7">
  <task id="1" parallel_group="1" type="auto">
    <name>One</name>
    <files>src/a.js</files>
  </task>
</tasks>
`;
const LEGACY_STATE = `# Executor state — story 7

run-mode: interactive
step: wave-1
next: wave-2
updated: 2026-10-05T12:00:00Z

## Progress

| Task | Name | Wave | Attempts | Status | Summary |
|---|---|---|---|---|---|
| 1 | "t1" | 1 | 1 | verified | x |
`;

function state({ runMode = 'interactive', step, round, branch = 'implement/7' }) {
  return `# Executor state — story 7

run-mode: ${runMode}
skill: implement
branch: ${branch}
step: ${step}
${round === undefined ? '' : `round: ${round}\n`}updated: 2026-11-04T12:00:00Z
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

test('Resume_StoppedAtRed_NextIsRed', () => {
  withStory({ stateText: state({ step: 'red' }) }, (root) => {
    const r = run(root);
    assert.equal(r.code, 0, r.err + r.out);
    assert.equal(r.fields.step, 'red');
    assert.equal(r.fields.next, 'red');
    assert.equal(r.fields.branch, 'implement/7');
    // Companion: the per-task lines of the old format are gone.
    for (const key of ['finished', 'to-run', 'restore', 'keep-as-is', 'reopened']) {
      assert.equal(r.fields[key], undefined, `no "${key}:" line: tasks and waves are retired`);
    }
  });
});

test('Resume_ReviewRound3_ResumesAtRound3', () => {
  withStory({ stateText: state({ step: 'review', round: 3 }) }, (root) => {
    const r = run(root);
    assert.equal(r.code, 0, r.err + r.out);
    assert.equal(r.fields.next, 'review');
    assert.equal(r.fields.round, '3');
  });
});

test('Resume_ReviewWithNoRoundSaved_StartsAtRound1', () => {
  withStory({ stateText: state({ step: 'review' }) }, (root) => {
    const r = run(root);
    assert.equal(r.code, 0, r.err + r.out);
    assert.equal(r.fields.next, 'review');
    assert.equal(r.fields.round, '1');
  });
});

test('Resume_LegacyTaskXmlState_SaysRestartFromThePlan', () => {
  withStory({ plan: LEGACY_PLAN, stateText: LEGACY_STATE }, (root) => {
    const r = run(root);
    assert.equal(r.code, 1, r.out + r.err);
    assert.match(r.out, /^legacy: .*restart from the plan/m);
  });
});

test('Resume_AutonomousRun_StaysAutonomous', () => {
  withStory({ stateText: state({ runMode: 'autonomous', step: 'code' }) }, (root) => {
    const r = run(root);
    assert.equal(r.fields['run-mode'], 'autonomous');
    assert.equal(r.fields.next, 'code', 'companion: the run was read, not refused');
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
  withStory({ plan: null, stateText: state({ step: 'red' }) }, (root) => {
    const r = run(root);
    assert.equal(r.code, 1);
    assert.match(r.out + r.err, /no plan/);
  });
});

test('Resume_StoppedBeforeThePlanWasApproved_ExitsNonZeroAndSaysRerun', () => {
  for (const step of ['understand', 'goal', 'plan']) {
    withStory({ stateText: state({ step }) }, (root) => {
      const r = run(root);
      assert.equal(r.code, 1, `${step}: ${r.out}${r.err}`);
      assert.match(r.out, /re-run \/implement 7: the plan was not approved/, step);
      assert.equal(r.fields.next, undefined, `${step}: no next step is offered`);
    });
  }
  // Companion: the first step after the plan is approved still resumes.
  withStory({ stateText: state({ step: 'tests' }) }, (root) => {
    assert.equal(run(root).code, 0);
  });
});

test('Resume_FinishedRun_SaysSoAndOffersNoNextStep', () => {
  withStory({ stateText: state({ step: 'done' }) }, (root) => {
    const r = run(root);
    assert.equal(r.code, 0, r.err + r.out);
    assert.match(r.out, /the run is finished/);
    assert.equal(r.fields.next, undefined, 'no next build step');
  });
  // Companion: the pr step is still in flight and resumes.
  withStory({ stateText: state({ step: 'pr' }) }, (root) => {
    const r = run(root);
    assert.equal(r.code, 0);
    assert.equal(r.fields.next, 'pr');
  });
});

test('Resume_PlanProseMentioningATaskTag_IsNotLegacy', () => {
  const plan = `${PLAN}\nNo \`<task \` blocks any more: the story is the unit.\n`;
  withStory({ plan, stateText: state({ step: 'red' }) }, (root) => {
    const r = run(root);
    assert.equal(r.code, 0, r.out + r.err);
    assert.equal(r.fields.next, 'red');
  });
});

test('Resume_PlanWithOnlyTheTaskXml_IsLegacy', () => {
  withStory({ plan: LEGACY_PLAN, stateText: state({ step: 'red' }) }, (root) => {
    const r = run(root);
    assert.equal(r.code, 1, r.out + r.err);
    assert.match(r.out, /^legacy: /m);
  });
  const idOnly = `${PLAN}\n<task id="1" type="auto"></task>\n`;
  withStory({ plan: idOnly, stateText: state({ step: 'red' }) }, (root) => {
    assert.match(run(root).out, /^legacy: /m);
  });
});

// The red set (tests and stubs) is saved under "## Red files" so a resume at `code` never restores it.
test('Resume_RedFilesSaved_ArePrintedOnePerLine', () => {
  const text = `${state({ step: 'code' })}\n## Red evidence\n\n- T | AC1 | x | shape: assertion\n\n## Red files\n\n- src/__tests__/a.test.js\n- src/a.js\n\n## Blockers\n\n- src/not-a-red-file.js\n`;
  withStory({ stateText: text }, (root) => {
    const r = spawnSync(process.execPath, [SCRIPT, '--root', root, '7'], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr + r.stdout);
    const lines = r.stdout.split('\n').filter((l) => l.startsWith('red-file: '));
    assert.deepEqual(lines, ['red-file: src/__tests__/a.test.js', 'red-file: src/a.js']);
  });
});

test('Resume_NoRedFilesSaved_PrintsNoRedFileLine', () => {
  withStory({ stateText: state({ step: 'code' }) }, (root) => {
    const r = run(root);
    assert.equal(r.code, 0, r.err + r.out);
    assert.doesNotMatch(r.out, /red-file/);
    assert.equal(r.fields.next, 'code', 'companion: the run is still read');
  });
});

test('Resume_StoryIdWithPathCharacters_IsRefused', () => {
  withStory({ stateText: state({ step: 'red' }) }, (root) => {
    assert.equal(run(root, '../7').code, 1);
  });
});
