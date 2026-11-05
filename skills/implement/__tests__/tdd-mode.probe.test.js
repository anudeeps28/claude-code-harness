// Doc-consistency probe for test-first building across /implement, the planner, /tdd, the wave and
// testing rules, and the four tracker adapters. Rewritten for F73 #83: the executor, its `must_fail`
// task attribute, waves, the red window and the plan-lint hook are retired, so every test that pinned
// them is gone (the commit lists each, as "moot: waves retired"). Every story is now test first, built
// by the story loop (`story-builder`, `suite-runner`, `red-evidence.js`); what is kept here is each
// guarantee the loop still makes:
//
//   D1  `--tdd` is documented and parsed as a flag (it changes nothing now: every story is test first)
//   D9  a bug is test first, decided from the tracker's `Type:` line (D10), never from the wording
//   D11 `--quick` does not skip test-first
//   D12 /tdd stays and is kept in step
//   the red is recorded (name, verbatim failure line, shape); a fix after the build is test first
//
// This is not a code test. Nothing in this repo parses the plan: the instructions are read by Claude
// at runtime, so the only thing that can go wrong is two files disagreeing, and a probe like this one
// is what catches it. The loop's own order and the retired pieces are in one-loop.probe.test.js.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

// assert.match dumps the entire file into the failure output, which is useless for files this size.
// These keep the message and drop the haystack.
function mustMatch(content, re, message) {
  assert.ok(re.test(content), message);
}

function read(...parts) {
  return fs.readFileSync(path.join(REPO_ROOT, ...parts), 'utf8').replace(/\r\n/g, '\n');
}

const IMPLEMENT = read('skills', 'implement', 'SKILL.md');
const TDD_SKILL = read('skills', 'tdd', 'SKILL.md');
const IMPLEMENT_PLANNER = read('agents', 'implement-planner-agent.md');
const TEST_PHILOSOPHY = read('rules', 'test-philosophy.md');

// One build skill and one planner since F7 (ADR-0001). The maps keep their names so each check below
// reads the same as before; they now hold one file each.
const BOTH_SKILLS = { 'skills/implement/SKILL.md': IMPLEMENT };
const BOTH_PLANNERS = { 'agents/implement-planner-agent.md': IMPLEMENT_PLANNER };

function hardRules(content) {
  const idx = content.indexOf('## Hard rules');
  return idx === -1 ? null : content.slice(idx);
}

// ---------------------------------------------------------------------------
// D1 — --tdd is a flag on the skill (kept; it changes nothing, every story is test first)
// ---------------------------------------------------------------------------

test('D1_BothSkillsDocumentTheTddFlag', () => {
  for (const [name, content] of Object.entries(BOTH_SKILLS)) {
    assert.ok(content.includes('--tdd'), `${name} must document the --tdd flag`);
  }
});

test('D1_BothSkillsParseTddAsAFlag', () => {
  for (const [name, content] of Object.entries(BOTH_SKILLS)) {
    mustMatch(
      content,
      /- `--tdd`\s*→/,
      `${name} must define --tdd in its flag-extraction list, in the same "- \`--flag\` → ..." shape as the others`
    );
  }
});

test('D1_HardRulesDocumentTdd', () => {
  for (const [name, content] of Object.entries(BOTH_SKILLS)) {
    const rules = hardRules(content);
    assert.ok(rules, `${name} must have a "## Hard rules" section`);
    mustMatch(rules, /--tdd/, `${name} hard rules must document --tdd`);
  }
});

// ---------------------------------------------------------------------------
// D9 — bugs are always test first
// ---------------------------------------------------------------------------

test('D9_BugFixesAreTestFirstWithoutTheFlag', () => {
  const places = { ...BOTH_SKILLS, 'rules/test-philosophy.md': TEST_PHILOSOPHY };
  for (const [name, content] of Object.entries(places)) {
    mustMatch(
      content,
      /bug[^\n]{0,160}(?:test-first|test first|without the flag)|(?:test-first|test first)[^\n]{0,160}bug/i,
      `${name} must state that a bug is test-first even without --tdd (D9)`
    );
  }
});

// ---------------------------------------------------------------------------
// D10 — the tracker reports the item type
// ---------------------------------------------------------------------------

test('D10_EveryTrackerAdapterEmitsATypeLine', () => {
  for (const tracker of ['ado', 'github', 'local', 'todoist']) {
    const script = read('trackers', tracker, 'get-issue.sh');
    mustMatch(
      script,
      /\*\*Type:\*\*/,
      `trackers/${tracker}/get-issue.sh must emit a "**Type:**" line so the planner never guesses whether an item is a bug (D10)`
    );
  }
});

test('D10_PlannersReadTheTypeFromTheTrackerNotFromProse', () => {
  for (const [name, content] of Object.entries(BOTH_PLANNERS)) {
    mustMatch(
      content,
      /\bType:\B|tracker[^\n]*type|type[^\n]*tracker/i,
      `${name} must take the item type from the tracker, not infer it from the description (D10)`
    );
  }
});

test('D10_AnUnknownTypeIsSafe', () => {
  for (const [name, content] of Object.entries(BOTH_PLANNERS)) {
    mustMatch(
      content,
      /unknown|empty|unavailable|cannot say|not set/i,
      `${name} must state that an absent type behaves as today — only "bug" changes anything (D10)`
    );
  }
});

// ---------------------------------------------------------------------------
// D11 — --quick does not skip test-first
// ---------------------------------------------------------------------------

test('D11_QuickDoesNotSkipTestFirst', () => {
  mustMatch(
    IMPLEMENT,
    /--quick[^\n]*(?:does not|never) skip[^\n]*(?:--tdd|test-first)|(?:--tdd|test-first)[^\n]*--quick[^\n]*(?:does not|never) skip/i,
    'skills/implement/SKILL.md must state that --quick does not skip test-first (D11) — --quick only skips checks that run after the build'
  );
});

// ---------------------------------------------------------------------------
// D12 — /tdd stays and is kept in step
// ---------------------------------------------------------------------------

test('D12_TddSkillCrossReferencesTheMode', () => {
  mustMatch(
    TDD_SKILL,
    /--tdd/,
    'skills/tdd/SKILL.md must point at the --tdd mode so the two are kept in step, not allowed to drift (D12)'
  );
});

test('D12_TddSkillStillStopsWhenATestPassesTooEarly', () => {
  mustMatch(
    TDD_SKILL,
    /passed before writing any code|test passed/i,
    'skills/tdd/SKILL.md already stops when a test passes before any code exists — that behaviour must survive (D12)'
  );
});

// /tdd said what a real failure is by pointing at the executor's Step 3.5. The executor is gone; the
// rules a test is written by are in the implement skill's reference.
test('D12_TddSkillPointsAtTheTestRulesNotTheExecutor', () => {
  mustMatch(
    TDD_SKILL,
    /skills\/implement\/reference\/test-rules\.md/,
    'skills/tdd/SKILL.md must point at skills/implement/reference/test-rules.md for what a real failing test is'
  );
  assert.ok(!/story-executor-agent|Step 3\.5/.test(TDD_SKILL), 'skills/tdd/SKILL.md must not point at the retired executor or its Step 3.5');
});

// ---------------------------------------------------------------------------
// The red is recorded; a fix after the build is test first
// ---------------------------------------------------------------------------

// Nothing is committed between the red run and the code, so once the implementation lands there is no
// trace left that the test ever failed. The record is the one surviving proof test-first happened.
test('Run1_RedWindowLeavesAnAuditTrail', () => {
  mustMatch(
    TEST_PHILOSOPHY,
    /evidence that the test was red|verbatim failure line/i,
    'rules/test-philosophy.md must require the red be recorded (test name, verbatim failure line, failure shape) — it is the only surviving proof test-first actually happened'
  );
});

// --tdd said nothing about how a Phase 3 fix is ordered — the one place a real defect appears.
test('Run1_PostBuildFixesAreTestFirstToo', () => {
  for (const [name, content] of Object.entries({
    'rules/test-philosophy.md': TEST_PHILOSOPHY,
    'skills/implement/SKILL.md': IMPLEMENT,
  })) {
    mustMatch(
      content,
      /after the (?:build|waves)|review finding[^\n]{0,80}test-first|Phase 3 fix/i,
      `${name} must state that a defect found after the build is fixed test-first too — otherwise the run patches the code at the one moment it matters and still reports full compliance`
    );
  }
});

// ---------------------------------------------------------------------------
// --resume must carry the run mode and the position across a resume (it replaced /run-tasks in F7)
// ---------------------------------------------------------------------------

test('Resume_KeepsTheRunModeAndReentersAtTheSavedStep', () => {
  const resume = IMPLEMENT.slice(IMPLEMENT.indexOf('## Resume mode'), IMPLEMENT.indexOf('## Autonomous mode'));
  assert.ok(resume.length > 200, 'companion: the Resume mode section was read');
  mustMatch(
    resume,
    /run-mode: autonomous/,
    '--resume must keep the saved run mode from executor-state.md'
  );
  mustMatch(
    resume,
    /`step:?`|\bstep:/,
    '--resume must re-enter at the saved step'
  );
  mustMatch(
    resume,
    /`round:?`|\bround:/,
    '--resume must re-enter a review at the saved round'
  );
  assert.ok(!/must_fail|keep-as-is/.test(resume), '--resume has no must_fail exemption: tasks are retired');
});

// ---------------------------------------------------------------------------
// Findings of earlier dogfooding runs that do not depend on the executor or waves
// ---------------------------------------------------------------------------

// A user-level skill silently shadows a project skill of the same name, so a dogfooding run can
// execute a stale flow and report success.
test('Run1_SkillShadowingIsDetectable', () => {
  const lib = path.join(REPO_ROOT, 'hooks', 'lib', 'skill-shadowing.js');
  assert.ok(fs.existsSync(lib), 'hooks/lib/skill-shadowing.js must exist — a user-level skill silently shadows a project skill of the same name, so a dogfooding run can execute a stale flow and report success');
  const startMsg = read('hooks', 'session-start-msg.js');
  mustMatch(
    startMsg,
    /skill-shadowing/,
    'hooks/session-start-msg.js must surface the shadowing warning at session start — detection nobody sees is not detection'
  );
});

// "Every finding that survives the ship test is registered" read as deferral in one clause and
// blocker in the one above it.
test('Run1_ShipTestOutcomesAreUnambiguous', () => {
  mustMatch(
    IMPLEMENT,
    /fails the ship test[^\n]{0,60}defer|Every deferred finding is registered/i,
    'skills/implement/SKILL.md must say plainly which ship-test outcome defers and which blocks — "survives the ship test" meant both in consecutive clauses'
  );
});

// Originally this demanded a skip-it fallback. #22 (F1) changed the decision on purpose: a run with
// no checklist tool now stops at startup. What this test still protects is the original lesson — a
// run must never have to work out for itself what a missing tool means — so the rule must say
// plainly what happens and how to fix it.
test('Run1_MissingChecklistToolHasAClearAnswer', () => {
  const rule = read('rules', 'progress-tracking.md');
  mustMatch(rule, /has neither, the build skill stops at startup/i,
    'rules/progress-tracking.md must say plainly what a run does when the checklist tool is missing');
  mustMatch(rule, /CLAUDE_CODE_ENABLE_TODO_TOOLS=1/,
    'rules/progress-tracking.md must say how to switch the checklist tool on');
});

test('Run1_ThereIsACleanStopBeforeShipping', () => {
  mustMatch(
    IMPLEMENT,
    /--no-ship/,
    'skills/implement/SKILL.md needs a terminal state that runs everything except the git phase — without it the only way to end a run without touching git is to abandon it mid-flow'
  );
});

// Same class as skill shadowing: what runs is not what we edit. `.claude/trackers/active/` was a
// copy taken at install time, so adapter fixes were dead code from the harness's own point of view.
test('Verify_DogfoodLinksTheAdapterDirsToo', () => {
  const plan = read('scripts', 'dogfood-links.js');
  mustMatch(
    plan,
    /trackers\/active/,
    'scripts/dogfood-links.js must link trackers/active at the selected adapter — otherwise every edit to trackers/<name>/ is invisible to the running harness'
  );
  mustMatch(
    plan,
    /code-platform\/active/,
    'scripts/dogfood-links.js must link code-platform/active for the same reason'
  );
});

// The ship test answers "No" vacuously for anything not yet wired up, certifying a defect as safe
// because the feature has not shipped. A security finding hit this and the reviewer argued with it.
test('Verify_ShipTestHandlesNewlyIntroducedInputs', () => {
  mustMatch(
    read('rules', 'deferrals.md'),
    /NEW input|new input/,
    'rules/deferrals.md must handle a change that introduces a new input — nothing declares it yet, so every finding about it answers "No" vacuously and the rule certifies the defect as safe because the feature has not shipped'
  );
});

test('Verify_AutonomousAndNoShipAreDocumentedAsTheAuditCombination', () => {
  mustMatch(
    IMPLEMENT,
    /--autonomous --no-ship/,
    'skills/implement/SKILL.md must name `--autonomous --no-ship` as the audit/dogfooding combination — `--autonomous` alone ends by opening a PR, which is what a dry run must not do'
  );
});

// --no-ship shipped half-wired: it forbade git operations while an earlier unconditional step created
// a branch, and said nothing about story-pr-agent or the terminal marker.
test('Final_NoShipIsFullyWired', () => {
  mustMatch(
    IMPLEMENT,
    /unless \*\*`--no-ship`\*\* was passed|Skip the branch creation/i,
    'skills/implement/SKILL.md must gate the branch-creation step on --no-ship — it runs earlier in the file than the flag\'s own prohibition, so a literal reading creates a branch and then promises not to'
  );
  mustMatch(
    IMPLEMENT,
    /Do not spawn `story-pr-agent`/,
    'skills/implement/SKILL.md must say whether story-pr-agent runs under --no-ship — it performs tracker mutations rather than git ones, so "the git phase" does not obviously exclude it'
  );
  mustMatch(
    IMPLEMENT,
    /terminal phase marker/i,
    'skills/implement/SKILL.md must specify the terminal phase marker under --no-ship — the flag exists so the workspace stops claiming work is in progress, and without the marker it still does'
  );
});

// "Fresh" gated a check that is explicitly NOT self-answerable under --autonomous, and was undefined.
test('Final_FreshnessHasANumber', () => {
  const markers = read('rules', 'phase-markers.md');
  mustMatch(
    markers,
    /within the last \d+ minutes/i,
    'rules/phase-markers.md must give "fresh" a concrete threshold — it gates a pre-flight check that cannot be self-answered, so an undefined word forces the run to halt or invent a number'
  );
  mustMatch(
    markers,
    /same directory is not foreign work|earlier run in this same directory/i,
    'rules/phase-markers.md must exempt markers left by earlier runs of the same exercise — otherwise run 3 of a dogfooding session halts on the wreckage of runs 1 and 2'
  );
});

// An agent contract forbade what the orchestrating skill required of it.
test('Final_AcceptanceAgentMayWriteItsOwnReport', () => {
  mustMatch(
    read('agents', 'acceptance-test-agent.md'),
    /Writing your own report file is allowed/i,
    'agents/acceptance-test-agent.md must permit writing acceptance.md — the skills require it as a handoff artifact and /improve-harness skips stories without it'
  );
});

// ---------------------------------------------------------------------------
// Regression — nothing that already worked may quietly disappear
// ---------------------------------------------------------------------------

test('Regression_ExistingFlagsAndStopTokensSurvive', () => {
  const implementTokens = [
    // STOP 1, 1.5 and 3 survive as --step-only stops; the plan gate is the default's one stop.
    'STOP 1', 'STOP 1.5', 'STOP 3', 'The plan gate',
    '--discuss', '--research', '--quick', '--step', '--auto', '--full', '--autonomous', '--rework',
  ];
  for (const token of implementTokens) {
    assert.ok(IMPLEMENT.includes(token), `skills/implement/SKILL.md must still contain "${token}"`);
  }
});

test('Regression_ThreeLevelsOfTestingSurvive', () => {
  for (const heading of ['Level 1', 'Level 2', 'Level 3']) {
    assert.ok(
      TEST_PHILOSOPHY.includes(heading),
      `rules/test-philosophy.md must still describe ${heading} — test-first is an ordering change, not a replacement`
    );
  }
});
