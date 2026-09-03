// Doc-consistency probe for `--tdd` mode across /story, /implement, /run-tasks, the planner and
// executor agents, the wave and testing rules, and the four tracker adapters.
//
// This is not a code test. Nothing in this repo parses the task XML — `type="test"`, `must_fail`,
// `parallel_group` are instructions Claude reads at runtime. So the only thing that can go wrong is
// two files disagreeing, and the only thing that can catch it is a probe like this one.
//
// Decisions being enforced (see tasks/tdd/findings.md section 10):
//   D1  --tdd is a switch, not a default
//   D2  the mode travels on the task as must_fail="true"
//   D3  what counts as a real failing test, and the response to a false pass
//   D4  three tasks per slice, three separate agents
//   D5  the implementer may read the test, never edit it
//   D6  a must_fail task is exempt from the failed-task restore rule
//   D7  autonomous self-answers one case, pauses on the rest
//   D8  only behaviour changes go test-first; a skip needs a written reason
//   D9  bug fixes are always test-first, switch or no switch
//   D10 the tracker reports the item type
//   D11 --quick does not skip it
//   D12 /tdd stays and is kept in step

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
function mustNotMatch(content, re, message) {
  assert.ok(!re.test(content), message);
}

function read(...parts) {
  return fs.readFileSync(path.join(REPO_ROOT, ...parts), 'utf8');
}

const STORY = read('skills', 'story', 'SKILL.md');
const IMPLEMENT = read('skills', 'implement', 'SKILL.md');
const RUN_TASKS = read('skills', 'run-tasks', 'SKILL.md');
const TDD_SKILL = read('skills', 'tdd', 'SKILL.md');
const STORY_PLANNER = read('agents', 'story-plan-agent.md');
const IMPLEMENT_PLANNER = read('agents', 'implement-planner-agent.md');
const EXECUTOR = read('agents', 'story-executor-agent.md');
const WAVE_RULES = read('rules', 'wave-execution.md');
const TEST_PHILOSOPHY = read('rules', 'test-philosophy.md');

const BOTH_SKILLS = { 'skills/story/SKILL.md': STORY, 'skills/implement/SKILL.md': IMPLEMENT };
const BOTH_PLANNERS = {
  'agents/story-plan-agent.md': STORY_PLANNER,
  'agents/implement-planner-agent.md': IMPLEMENT_PLANNER,
};
// Every file that has to know the mode exists at all.
const MODE_AWARE = {
  ...BOTH_SKILLS,
  ...BOTH_PLANNERS,
  'skills/run-tasks/SKILL.md': RUN_TASKS,
  'agents/story-executor-agent.md': EXECUTOR,
  'rules/wave-execution.md': WAVE_RULES,
  'rules/test-philosophy.md': TEST_PHILOSOPHY,
};

function hardRules(content) {
  const idx = content.indexOf('## Hard rules');
  return idx === -1 ? null : content.slice(idx);
}

// ---------------------------------------------------------------------------
// D1 — --tdd is a switch on both skills
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

test('D1_BothSkillsStateTheSwitchIsOffByDefault', () => {
  for (const [name, content] of Object.entries(BOTH_SKILLS)) {
    mustMatch(
      content,
      /--tdd[^\n]*\b(off by default|opt-in|not the default)\b|\b(off by default|opt-in|not the default)\b[^\n]*--tdd/i,
      `${name} must state that --tdd is off by default — a reader must not have to infer it`
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
// D2 — the mode travels on the task as must_fail="true"
// ---------------------------------------------------------------------------

test('D2_EveryModeAwareFileKnowsTheMustFailAttribute', () => {
  for (const [name, content] of Object.entries(MODE_AWARE)) {
    assert.ok(
      content.includes('must_fail'),
      `${name} must document the must_fail attribute — it is how the mode reaches a fresh executor agent`
    );
  }
});

test('D2_MustFailIsAnAttributeNotANewTaskType', () => {
  for (const [name, content] of Object.entries(MODE_AWARE)) {
    mustNotMatch(
      content,
      /type="red"/,
      `${name} must not introduce type="red" — the mode is an attribute on type="test" (D2)`
    );
  }
  for (const [name, content] of Object.entries(BOTH_PLANNERS)) {
    mustMatch(
      content,
      /type="test"\s+must_fail="true"/,
      `${name} must show the attribute on an existing test task: type="test" must_fail="true"`
    );
  }
});

test('D2_PlansWithoutTheAttributeBehaveAsBefore', () => {
  for (const [name, content] of Object.entries(MODE_AWARE)) {
    mustMatch(
      content,
      /(?:without|no|absent|lacking|missing)[^\n]{0,16}`?\*{0,2}must_fail/i,
      `${name} must state what happens when must_fail is absent — switch-off runs must be unchanged (D1)`
    );
  }
});

// ---------------------------------------------------------------------------
// D3 — what counts as a real failing test
// ---------------------------------------------------------------------------

test('D3_ExecutorDefinesARealFailureByItsCauseNotItsShape', () => {
  mustMatch(
    EXECUTOR,
    /assertion/i,
    'The executor must accept an assertion failure as a real failing test'
  );
  mustMatch(
    EXECUTOR,
    /compile|build/i,
    'The executor must call out a compile/build failure as NOT a valid failing test'
  );
});

// Found by the Layer B end-to-end run, not by this probe: with a shell whose body is
// `throw new NotImplementedException()`, the runner reports the first red as an EXCEPTION, with no
// assertion text anywhere in the message. Verified in a real xUnit run. The original contract said a
// real failure "is an assertion failure", which would have rejected the textbook correct red on every
// single feature slice. Both shapes must stay documented, and they must stay distinguishable from
// trap 13 (a test that PASSES by asserting the throw).
test('D3_NotImplementedExceptionCountsAsARealFailure', () => {
  for (const [name, content] of Object.entries({
    'agents/story-executor-agent.md': EXECUTOR,
    'rules/test-philosophy.md': TEST_PHILOSOPHY,
  })) {
    mustMatch(
      content,
      /NotImplementedException/,
      `${name} must state that a NotImplementedException from the method under test is a REAL failing test — it is the normal first red on a feature slice, and the runner reports no assertion text at all`
    );
    mustMatch(
      content,
      /where the failure came from|method under test/i,
      `${name} must draw the line at where the failure originated, not at whether it was an assertion`
    );
    mustMatch(
      content,
      /Assert\.Throws/,
      `${name} must keep the opposite case distinct: a test that PASSES by asserting the throw is asserting the shell, not the behaviour (trap 13)`
    );
  }
});

test('D3_ExecutorRequiresProofTheTestActuallyRan', () => {
  const required = [
    /exists on disk|file exists/i,
    /only our test ran|exactly one test|one test ran|a single test/i,
    /skip/i,
  ];
  for (const re of required) {
    mustMatch(
      EXECUTOR,
      re,
      `The executor must require positive proof the test ran before reporting a must_fail result (missing ${re})`
    );
  }
});

// Also from Layer B: a [Theory] with three InlineData rows is ONE test method reporting THREE cases.
// A literal "exactly one test ran" check fails on every table-driven test, which is a normal and
// desirable way to pin boundaries. The rule exists to rule out a whole-suite run, not to ban tables.
// From the Layer B executor run: on a must_fail task a success report sits directly above a verify
// output whose exit code is 1 and whose last line reads "Failed!". A bare `RESULT: PASS` there can
// only be read correctly by someone who already knows the convention, and a misread marks a wave green
// when no code was written.
test('D3_MustFailVerdictIsLabelledNotBare', () => {
  mustMatch(
    EXECUTOR,
    /PASS \(must_fail[^)]*\)/,
    'agents/story-executor-agent.md must require the verdict be written as "PASS (must_fail — red achieved)", never a bare PASS — the polarity is inverted on this task type only'
  );
});

// Also from that run, and a contradiction introduced by this feature: Step 3.5 requires proving the
// test file exists on disk and holds the named test, but the security note allowed ONLY the <verify>
// command and the lock commands. A strict reading left proof 1 unsatisfiable.
test('D3_SecurityNoteAllowsTheChecksStep35Demands', () => {
  const idx = EXECUTOR.indexOf('## Security note');
  assert.ok(idx !== -1, 'agents/story-executor-agent.md must keep its Security note section');
  const security = EXECUTOR.slice(idx);
  mustMatch(
    security,
    /exception|read-only/i,
    'The security note must carve out the read-only file inspection Step 3.5 requires, or the two sections contradict each other and the first proof cannot be satisfied'
  );
  mustMatch(
    security,
    /must_fail/,
    'The carve-out must be scoped to must_fail tasks specifically, not opened up for every task'
  );
});

// From the Layer B BLOCKED run. The "the shell's default satisfied the test" row prescribes FAIL with
// the remedy "expect something the shell cannot return". Applied to a method that is NOT a shell — one
// holding real code — that remedy is an instruction to manufacture a red against working code, which
// the same file forbids outright. The row needs its precondition stated, or the two passages collide
// exactly when the answer matters most: "the behaviour already exists" is BLOCKED, never FAIL.
test('D3_ShellDefaultRowStatesItsPrecondition', () => {
  mustMatch(
    EXECUTOR,
    /method under test is a shell/i,
    'agents/story-executor-agent.md must gate the shell-default row on the method actually BEING a shell — otherwise it tells the agent to weaken a test against working code, contradicting "never weaken the test to produce a failure"'
  );
});

// Also from Layer B: between a must_fail task and the task that makes it pass, the tree is
// legitimately red. A task whose verify runs the whole suite in that window fails through no fault of
// its own — observed in a real run, where a shell task was reported FAIL because an unrelated
// must_fail test was still open.
test('D4_RedWindowIsClosedByTheNextWave', () => {
  for (const [name, content] of Object.entries(BOTH_PLANNERS)) {
    mustMatch(
      content,
      /red window|legitimately red|still red/i,
      `${name} must state that the tree is deliberately red between the must_fail task and its implementation, and that nothing else may be scheduled in that window`
    );
    mustMatch(
      content,
      /(?:very next wave|immediately after|next wave)/i,
      `${name} must require the implementation task to be the very next wave, so the red window is exactly one wave long`
    );
  }
});

// From the Layer B shape-2 run. A planner wrote an action that could not compile as written (decimal
// literals in a C# attribute). Deviation rules 1-4 are all about defects in the CODEBASE; none covered
// a defect in the TASK. Both nearest instincts are wrong: silently substituting hides the planning
// error, and BLOCKED stalls the run over a notation problem.
test('D4_ExecutorHasARuleForAnImpossibleAction', () => {
  mustMatch(
    EXECUTOR,
    /impossible action|cannot be carried out/i,
    'agents/story-executor-agent.md needs a deviation rule for an <action> that cannot be carried out as written — rules 1-4 only cover defects in the codebase, not in the task'
  );
  mustMatch(
    EXECUTOR,
    /closest conforming|document it \*\*prominently\*\*|prominently/i,
    'The impossible-action rule must require the closest conforming alternative AND a prominent report — a silent substitution hides the planning error from the planner who must fix it'
  );
});

// From the /story --tdd Layer B run. The executor got the [Theory] carve-out but the PLANNERS did not,
// so their "name exactly one test" rule was still unqualified — the planning agent noticed and
// sidestepped it by mandating a [Fact], leaving the question unresolved for any slice that genuinely
// needs a table.
test('D3_PlannersAlsoAllowTableDrivenTests', () => {
  for (const [name, content] of Object.entries(BOTH_PLANNERS)) {
    mustMatch(
      content,
      /(?:Theory|InlineData|table-driven)/i,
      `${name} must qualify its "name exactly one test" verify rule so a table-driven test is allowed — the executor already does, and the two must not disagree`
    );
  }
});

// Also from that run: the checklist demands every code task have a paired test task, but the shell IS
// a code task and the only test you can write against it asserts NotImplementedException — which is
// trap 13, a false green. The planner hit the collision and had to invent its own resolution.
test('D4_ShellTaskPairingCollisionIsResolved', () => {
  for (const [name, content] of Object.entries(BOTH_PLANNERS)) {
    mustMatch(
      content,
      /shell[^\n]{0,80}(?:pair|no test of its own)|(?:pair|no test of its own)[^\n]{0,80}shell/i,
      `${name} must say the shell task's pair is the must_fail test in the next wave and that the shell gets no test of its own — otherwise "every code task gets a paired test task" forces a shell-asserting test, which is trap 13`
    );
  }
});

// The next six all come from the Layer B orchestrator and resume runs. Every one is a general rule
// that reads correctly on its own but forbids something test-first mode requires.

// "A task FAIL or BLOCKED halts the run" appears in three places and had no carve-out, while the
// --tdd section says the already-exists case self-answers. An autonomous run reading top-to-bottom
// would pause exactly where the feature says it should not.
test('D7_BlockedHaltsRuleCarvesOutTheSelfAnsweredCase', () => {
  const places = {
    'rules/autonomous-mode.md': read('rules', 'autonomous-mode.md'),
    ...BOTH_SKILLS,
  };
  for (const [name, content] of Object.entries(places)) {
    mustMatch(
      content,
      /carve-?out[^\n]{0,200}must_fail|must_fail[^\n]{0,200}carve-?out|already exists[^\n]{0,80}self-answered/i,
      `${name} states that a FAIL or BLOCKED halts the run; it must carve out the one self-answered case (must_fail BLOCKED because the behaviour already exists) or the two rules contradict`
    );
  }
});

// "Skip that slice" never said what happens to the test that wrongly went green.
test('D7_SkippedSliceKeepsTheTest', () => {
  for (const [name, content] of Object.entries(BOTH_SKILLS)) {
    mustMatch(
      content,
      /dropping the implementation task, not the test|keep it/i,
      `${name} must say the skipped slice drops the implementation task but KEEPS the test — it is a legitimate passing regression test, and it stays on disk anyway under the never-restore rule`
    );
  }
});

// run-tasks paraphrased the contract as "fails on an assertion" — narrower than the executor spec,
// and wrong for the shell-throw case, which is the normal red on a feature slice.
test('D3_RunTasksDoesNotNarrowTheContractToAssertions', () => {
  mustMatch(
    RUN_TASKS,
    /NotImplementedException|right reason/i,
    'skills/run-tasks/SKILL.md must not paraphrase the must_fail contract as "fails on an assertion" — that rejects the shell-throw red, which is the normal first red on a feature slice'
  );
});

// Two run-tasks hard rules, read literally, forbid a must_fail task from ever being marked done.
test('D6_RunTasksHardRulesCarveOutMustFail', () => {
  const idx = RUN_TASKS.indexOf('## Hard rules');
  assert.ok(idx !== -1, 'skills/run-tasks/SKILL.md must keep its Hard rules section');
  const hard = RUN_TASKS.slice(idx);
  mustMatch(
    hard,
    /must_fail[^\n]{0,120}never restored|never restored[^\n]{0,120}must_fail/i,
    'run-tasks hard rule "restore before each retry" must carve out must_fail tasks'
  );
  mustMatch(
    hard,
    /must_fail[^\n]{0,160}(?:FAILS|fails)/,
    'run-tasks hard rule "a task is only done when its verify passes" must carve out must_fail tasks — its correct outcome is a non-zero exit, so read literally the rule forbids ever completing one'
  );
});

// "Runs alone in its wave" was stated but nothing enforced it: the auto-split check fires only on
// FILE OVERLAP and only on waves with 2+ tasks, so a file-disjoint sibling passes silently.
test('D3_AloneInWaveIsEnforcedNotJustAsserted', () => {
  mustMatch(
    WAVE_RULES,
    /isolation check|must contain nothing else/i,
    'rules/wave-execution.md must have a check that SPLITS a wave containing a must_fail task, separate from the file-overlap check — overlap only fires on shared files, so a file-disjoint sibling would pass silently and could still turn the red green'
  );
});

// A wave-by-wave run legitimately stops with a red suite between the failing test and its fix. Nothing
// told the human that, so running the tests at that checkpoint looks like a broken build.
test('D3_WaveStopWarnsTheTreeIsDeliberatelyRed', () => {
  for (const [name, content] of Object.entries({ ...BOTH_SKILLS, 'skills/run-tasks/SKILL.md': RUN_TASKS })) {
    mustMatch(
      content,
      /deliberately red/i,
      `${name} must warn at the wave STOP that the suite is deliberately red when the wave held a must_fail task — otherwise a human running the tests at that checkpoint sees a failure with no explanation`
    );
  }
});

// From the Layer B GREEN run. The executor is told both to follow tasks/lessons.md "exactly" and to
// follow the <action> "precisely", with no tie-break. Test-first makes the collision routine rather
// than rare: a plan deliberately stages work so one task omits something a convention requires
// (validation deferred to a later task, a shell with no behaviour). The agent resolved it correctly
// and flagged that ApplyTiered(-10m) now returns instead of throwing — which is exactly how a
// "later task will add validation" becomes validation nobody ever added.
test('D4_ActionVersusConventionsHasAStatedTieBreak', () => {
  mustMatch(
    EXECUTOR,
    /disagree[^\n]{0,60}(?:action|`<action>`) wins|action[^\n]{0,40}wins/i,
    'agents/story-executor-agent.md must state which wins when the <action> and tasks/lessons.md conflict — it currently says to follow both exactly, and test-first makes that collision routine'
  );
  mustMatch(
    EXECUTOR,
    /flag the divergence|silent divergence/i,
    'The tie-break must require the divergence be reported, not just resolved — otherwise deferred work silently disappears'
  );
});

// ── The nine findings from the first full `/implement --tdd` run ────────────────────────────────
// That run built a real feature for this repo end to end. Everything structural held; what it found
// were rules elsewhere that fight the mode, and gaps at the seams.

// The most dangerous one: Skill(implement) served the stale ~/.claude copy, which has no --tdd in it
// at all. Nothing warned. Detection now lives in hooks/lib/skill-shadowing.js with its own tests.
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

// The post-wave stray-file check compared against a clean tree, while the startup check explicitly
// allows a dirty one. Every wave of every run in a dirty tree was ordered to stop.
test('Run1_StrayFileCheckComparesAgainstTheRunBaseline', () => {
  mustMatch(
    WAVE_RULES,
    /baseline/i,
    'rules/wave-execution.md must compare the post-wave tree against the run\'s STARTING state — comparing against a clean tree contradicts the startup check that deliberately allows a dirty one, and halts every wave'
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
      `${name} must state that a defect found after the waves is fixed test-first too — otherwise the run patches the code at the one moment it matters and still reports full compliance`
    );
  }
});

// Nothing commits between waves, so after the fact an honest run and a fabricated one look identical.
test('Run1_RedWindowLeavesAnAuditTrail', () => {
  mustMatch(
    TEST_PHILOSOPHY,
    /evidence that the test was red|verbatim failure line/i,
    'rules/test-philosophy.md must require the red be recorded (test name, verbatim failure line, failure shape) — nothing commits between waves, so it is the only surviving proof test-first actually happened'
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

// A single pure function is one slice, not one slice per acceptance criterion.
test('Run1_SmallDeliverablesAreOneSlice', () => {
  for (const [name, content] of Object.entries(BOTH_PLANNERS)) {
    mustMatch(
      content,
      /ONE slice|one slice/,
      `${name} must state that a small deliverable is a single behaviour slice — splitting by acceptance criterion produces a shell per criterion and a red window per criterion`
    );
    mustMatch(
      content,
      /no-unused-vars|linter/i,
      `${name} must warn that a throw-only shell trips the project linter on unused parameters — a real executor stopped to decide whether its own task had passed`
    );
  }
});

// Tests written from the same <action> as the code agree with the code, not the requirement.
test('Run1_TestsDeriveFromAcceptanceCriteriaNotTheAction', () => {
  for (const [name, content] of Object.entries(BOTH_PLANNERS)) {
    mustMatch(
      content,
      /acceptance criteria, not the|not from the implementation sketch/i,
      `${name} must require the failing test's expected values come from the acceptance criteria rather than a code task's <action> — sharing an author makes the test agree with the implementation and go green for the wrong reason`
    );
  }
});

test('Run1_TodoWriteHasAFallback', () => {
  mustMatch(
    read('rules', 'progress-tracking.md'),
    /not available|skip it/i,
    'rules/progress-tracking.md must give a fallback when TodoWrite is unavailable — a hard instruction with no fallback made a real run stop to decide whether a missing tool was a blocker'
  );
});

test('Run1_ThereIsACleanStopBeforeShipping', () => {
  mustMatch(
    IMPLEMENT,
    /--no-ship/,
    'skills/implement/SKILL.md needs a terminal state that runs everything except the git phase — without it the only way to end a run without touching git is to abandon it mid-flow'
  );
});

// ── Findings from the VERIFICATION run (the fixes above, re-exercised end to end) ────────────────
// That run confirmed the bug path goes test-first with no flag, decided from the tracker; that the
// stray-file check stopped zero times where it would previously have stopped three; and that the red
// evidence is recorded. It then found these.

// Same class as skill shadowing: what runs is not what we edit. `.claude/trackers/active/` was a
// copy taken at install time, so adapter fixes were dead code from the harness's own point of view —
// and the two halves of one adapter had drifted five weeks apart from each other.
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

// Scoping the post-build rule to the FLAG exempts the bug-fix run — the one case where test-first is
// not optional. A real run hit exactly this and followed the rules file over the skill.
test('Verify_PostBuildFixRuleIsScopedToTheModeNotTheFlag', () => {
  mustMatch(
    IMPLEMENT,
    /test-first mode is on/i,
    'skills/implement/SKILL.md must scope the post-build test-first rule to "test-first mode is on", not to `--tdd` — a bug fix has the mode on with no flag, and flag-scoping exempts precisely that run'
  );
});

test('Verify_BaselineIsHandedToReviewAgentsAndItsLimitStated', () => {
  mustMatch(
    WAVE_RULES,
    /[Hh]and that baseline path/,
    'rules/wave-execution.md must tell the orchestrator to pass the baseline path to the review agents — it lives under a gitignored directory, so an agent that goes looking will not find it'
  );
  mustMatch(
    WAVE_RULES,
    /per-path, not per-hunk|already dirty at startup/i,
    'rules/wave-execution.md must state that the check cannot see changes INSIDE an already-dirty file — a real evaluator attributed a pre-existing edit to the story on exactly that basis'
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

// ── Findings from the FINAL run (18 waves, 8 must_fail tasks, all correct) ───────────────────────
// TDD mode itself held throughout. What broke were the seams around it.

// The worst: two normative documents disagreed about the central invariant. §2b's auto-split moved
// displaced siblings into "a new wave immediately after" a must_fail task — which is exactly the wave
// plan-lint's `no_implementation_next_wave` reserves for the implementation. The remedy created the
// violation. An architect agent raised it as a BLOCK during a real run.
test('Final_AutoSplitDoesNotParkSiblingsInTheRedWindow', () => {
  mustMatch(
    WAVE_RULES,
    /after the wave that closes the red window/i,
    'rules/wave-execution.md §2b must move displaced siblings to AFTER the wave that closes the red window — parking them immediately after the must_fail task puts their verify against a deliberately red tree, swapping one violation for another'
  );
});

// Two constraints the linter hard-blocks on lived in no rules document at all.
test('Final_LinterEnforcedConstraintsAreWrittenDown', () => {
  for (const [name, content] of Object.entries(BOTH_PLANNERS)) {
    mustMatch(
      content,
      /exactly \*\*wave \+ 1\*\*|exactly \*\*wave \+ 1/,
      `${name} must state that the implementation sits at exactly wave+1 — plan-lint hard-blocks on it and it appeared in no rules document`
    );
    mustMatch(
      content,
      /independent/i,
      `${name} must state that the one-red-at-a-time rule holds even for INDEPENDENT slices — the linter forbids overlapping red windows and nothing said so`
    );
  }
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

// Two agent contracts forbade what the orchestrating skills required of them.
test('Final_AgentContractsDoNotForbidTheirOwnDeliverables', () => {
  mustMatch(
    read('agents', 'acceptance-test-agent.md'),
    /Writing your own report file is allowed/i,
    'agents/acceptance-test-agent.md must permit writing acceptance.md — the skills require it as a handoff artifact and /improve-harness skips stories without it'
  );
  mustMatch(
    EXECUTOR,
    /registry entry|README hook/i,
    'agents/story-executor-agent.md must carve out the README registry rows — CONTRIBUTING.md requires them for a new hook, so a blanket ban makes the project\'s own procedure impossible for the agent it uses to carry it out'
  );
});

// The skill printed the un-baselined command while the rule required the baselined one.
test('Final_SkillAndRuleAgreeOnTheStrayFileCommand', () => {
  mustMatch(
    IMPLEMENT,
    /tree-baseline/,
    'skills/implement/SKILL.md must use the baselined stray-file command — the skill is what an executing agent reads, and it still printed the bare `git status --porcelain` while the rule required the baseline'
  );
});

test('D3_TableDrivenTestsAreNotMistakenForASuiteRun', () => {
  mustMatch(
    EXECUTOR,
    /Theory|InlineData|table-driven|several cases|table/i,
    'agents/story-executor-agent.md must say that a table-driven test is one test method that may report several cases — otherwise the "only our test ran" proof rejects every [Theory]'
  );
});

test('D3_FalsePassNeverGoesToDebug', () => {
  for (const [name, content] of Object.entries({ ...BOTH_SKILLS, 'agents/story-executor-agent.md': EXECUTOR })) {
    const idx = content.indexOf('must_fail');
    assert.ok(idx !== -1, `${name} must mention must_fail`);
    mustMatch(
      content,
      /(?:never|not)[^\n]{0,24}`?\/debug|do not (?:invoke|call|escalate to)[^\n]{0,12}`?\/debug/i,
      `${name} must state that a test passing too early never goes to /debug — nothing is broken (D3)`
    );
  }
});

test('D3_FourPreventionRulesArePresent', () => {
  const rules = [
    { re: /alone in (?:its|the) wave|runs alone/i, what: 'a must_fail task runs alone in its wave' },
    { re: /--no-build|fresh build|no cache|clean build/i, what: 'the verify must force a fresh build' },
    { re: /\|\|\s*true/, what: 'the verify must not hide failure with || true' },
    { re: /one test|single (?:named )?test|names? (?:exactly )?one/i, what: 'the verify must name one test' },
  ];
  const combined = WAVE_RULES + STORY_PLANNER + IMPLEMENT_PLANNER + EXECUTOR;
  for (const { re, what } of rules) {
    mustMatch(combined, re, `Prevention rule missing across wave rules / planners / executor: ${what}`);
  }
});

// ---------------------------------------------------------------------------
// D4 — three tasks per slice, three separate agents
// ---------------------------------------------------------------------------

test('D4_PlannersOrderShellThenTestThenCode', () => {
  for (const [name, content] of Object.entries(BOTH_PLANNERS)) {
    mustMatch(
      content,
      /shell|skeleton/i,
      `${name} must describe the empty-shell step — a compiled language cannot build a test against a class that does not exist`
    );
    mustMatch(
      content,
      /before the (?:code|implementation)|wave before/i,
      `${name} must state that the failing test comes BEFORE the code it tests`
    );
  }
});

test('D4_ShellTestAndCodeAreSeparateTasks', () => {
  for (const [name, content] of Object.entries(BOTH_PLANNERS)) {
    mustMatch(
      content,
      /separate tasks?|never (?:be )?(?:merged|combined)|own task/i,
      `${name} must state the shell, test and code steps are separate tasks so each gets a fresh agent (D4)`
    );
  }
});

test('D4_OldCodeFirstOrderingIsQualifiedNotLeftBare', () => {
  // The old rule still governs runs without --tdd, so it must survive -- but never bare. Any file
  // stating it must say on the same line that test-first reverses it, or some run will read the
  // unqualified sentence and order the plan code-first even under --tdd.
  const stale = /in the same wave or (?:the )?next wave after the code[^\n]*/gi;
  for (const [name, content] of Object.entries({ ...BOTH_PLANNERS, 'rules/test-philosophy.md': TEST_PHILOSOPHY })) {
    for (const line of content.match(stale) || []) {
      assert.ok(
        /reversed|test-first|--tdd/i.test(line),
        `${name} states the old code-first ordering without qualifying it for test-first mode: "${line.trim()}"`
      );
    }
  }
});

// ---------------------------------------------------------------------------
// D5 — the implementer may read the test, never edit it
// ---------------------------------------------------------------------------

test('D5_TestFileGoesInReadFirstNotFiles', () => {
  for (const [name, content] of Object.entries(BOTH_PLANNERS)) {
    mustMatch(
      content,
      /read_first[^\n]*test|test[^\n]*read_first/i,
      `${name} must put the test file in the implementation task's <read_first>, never its <files> (D5)`
    );
  }
});

// ---------------------------------------------------------------------------
// D6 — must_fail tasks are exempt from the restore rule
// ---------------------------------------------------------------------------

test('D6_RestoreRuleCarveOutInAllThreePlaces', () => {
  const places = {
    'rules/wave-execution.md': WAVE_RULES,
    'skills/story/SKILL.md': STORY,
    'skills/implement/SKILL.md': IMPLEMENT,
  };
  for (const [name, content] of Object.entries(places)) {
    mustMatch(
      content,
      /must_fail[^.\n]*(?:exempt|never restore|not restored)|(?:exempt|never restore|not restored)[^.\n]*must_fail/i,
      `${name} states the failed-task restore rule and must carve out must_fail tasks (D6) — otherwise the retry deletes the test we need to look at`
    );
  }
});

// ---------------------------------------------------------------------------
// D7 — autonomous behaviour
// ---------------------------------------------------------------------------

test('D7_AutonomousSelfAnswersOnlyTheCheckableCase', () => {
  for (const [name, content] of Object.entries(BOTH_SKILLS)) {
    mustMatch(
      content,
      /already exists/i,
      `${name} must say an autonomous run may self-answer only the "feature already exists" case (D7)`
    );
    mustMatch(
      content,
      /pause-anyway/i,
      `${name} must classify the remaining false-pass cases as pause-anyway triggers (D7)`
    );
  }
});

// ---------------------------------------------------------------------------
// D8 — only behaviour changes, and a skip needs a written reason
// ---------------------------------------------------------------------------

test('D8_OnlyBehaviourChangesGoTestFirst', () => {
  for (const [name, content] of Object.entries(BOTH_PLANNERS)) {
    mustMatch(
      content,
      /(?:behaviour|behavior)[^\n]{0,120}(?:must_fail|test-first|--tdd)|(?:must_fail|test-first|--tdd)[^\n]{0,120}(?:behaviour|behavior)/i,
      `${name} must limit test-first to tasks that change what the system does (D8)`
    );
    mustMatch(
      content,
      /(?:skip|exempt)[^\n]{0,160}(?:reason|why|justif)/i,
      `${name} must require a written reason when a task skips test-first (D8) — a silent skip turns the mode off while appearing to comply`
    );
  }
});

// ---------------------------------------------------------------------------
// D9 — bug fixes are always test-first
// ---------------------------------------------------------------------------

test('D9_BugFixesAreTestFirstWithoutTheFlag', () => {
  const places = { ...BOTH_PLANNERS, 'rules/test-philosophy.md': TEST_PHILOSOPHY };
  for (const [name, content] of Object.entries(places)) {
    mustMatch(
      content,
      /bug[^\n]{0,160}(?:test-first|must_fail|--tdd|without the flag)|(?:test-first|must_fail|--tdd)[^\n]{0,160}bug/i,
      `${name} must state that bug fixes are test-first even without --tdd (D9)`
    );
  }
});

test('D9_BugFixesSkipTheShellStep', () => {
  for (const [name, content] of Object.entries(BOTH_PLANNERS)) {
    mustMatch(
      content,
      /bug[^\n]*(?:no shell|skip[^\n]*shell|two steps)|(?:no shell|two steps)[^\n]*bug/i,
      `${name} must state a bug fix is two steps, not three — the code already exists, so there is no shell to build (D9)`
    );
  }
});

test('D9_D1ExceptionIsWrittenDownInBothSkills', () => {
  for (const [name, content] of Object.entries(BOTH_SKILLS)) {
    mustMatch(
      content,
      /bug[^\n]{0,160}(?:test-first|must_fail|--tdd|without the flag)|(?:test-first|must_fail|--tdd)[^\n]{0,160}bug/i,
      `${name} must record the one exception to "switch off behaves as today": bug fixes are test-first even without --tdd (D9 amends D1)`
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

// ---------------------------------------------------------------------------
// run-tasks must carry the mode across a resume
// ---------------------------------------------------------------------------

test('RunTasks_InheritsTheModeAcrossAResume', () => {
  mustMatch(
    RUN_TASKS,
    /must_fail/,
    'skills/run-tasks/SKILL.md must honour must_fail — it replays waves, and a resumed story would otherwise silently drop test-first'
  );
  mustMatch(
    RUN_TASKS,
    /executor-state\.md/,
    'skills/run-tasks/SKILL.md must read the mode from executor-state.md on a standalone resume, the same way it reads run-mode: autonomous'
  );
});

test('RunTasks_NoLongerClaimsTestTasksNeedNoSpecialHandling', () => {
  mustNotMatch(
    RUN_TASKS,
    /No special handling\./,
    'skills/run-tasks/SKILL.md still says a test task needs "No special handling." — a must_fail task needs the opposite verify verdict'
  );
});

// ---------------------------------------------------------------------------
// Regression — nothing that already worked may quietly disappear
// ---------------------------------------------------------------------------

test('Regression_ExistingFlagsAndStopTokensSurvive', () => {
  const implementTokens = [
    'STOP 1', 'STOP 1.5', 'STOP 3',
    '--discuss', '--research', '--quick', '--auto', '--full', '--autonomous', '--rework',
  ];
  for (const token of implementTokens) {
    assert.ok(IMPLEMENT.includes(token), `skills/implement/SKILL.md must still contain "${token}"`);
  }
  for (const token of ['--auto', '--autonomous']) {
    assert.ok(STORY.includes(token), `skills/story/SKILL.md must still contain "${token}"`);
  }
});

test('Regression_TestTasksAreStillMandatory', () => {
  for (const [name, content] of Object.entries(BOTH_PLANNERS)) {
    mustMatch(
      content,
      /type="test"/,
      `${name} must still require test tasks in every plan — --tdd changes their order, not whether they exist`
    );
  }
});

test('Regression_ThreeLevelsOfTestingSurvive', () => {
  for (const heading of ['Level 1', 'Level 2', 'Level 3']) {
    assert.ok(
      TEST_PHILOSOPHY.includes(heading),
      `rules/test-philosophy.md must still describe ${heading} — --tdd is an ordering change, not a replacement`
    );
  }
});
