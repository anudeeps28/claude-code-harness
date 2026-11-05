// Doc-consistency probe for F1 #19 "Builds you can trust to finish": the startup check (#22),
// state and a progress line at every step (#24), --resume (#25), done only after review (#26),
// no turn end while background work runs (#27) and unambiguous agent names (#28).
//
// Like the other probes here, this checks the instructions Claude reads at runtime. The three
// helper scripts the instructions call have their own behaviour tests next to this file.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const read = (...p) => fs.readFileSync(path.join(REPO_ROOT, ...p), 'utf8');
const exists = (...p) => fs.existsSync(path.join(REPO_ROOT, ...p));

const IMPLEMENT = read('skills', 'implement', 'SKILL.md');
const PROGRESS_RULE = read('rules', 'progress-tracking.md');
const { readRequired } = require('../bin/startup-check.js');

// The text from `heading` to the next "## " heading, ignoring headings inside ``` code blocks
// (the state-file example in "State and progress" has a "## Progress" line of its own).
function section(content, heading) {
  const lines = content.split('\n');
  const start = lines.findIndex((l) => l.startsWith(heading));
  if (start === -1) return null;
  let inFence = false;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith('```')) inFence = !inFence;
    else if (!inFence && lines[i].startsWith('## ')) { end = i; break; }
  }
  return lines.slice(start, end).join('\n');
}

function mustMatch(content, re, message) { assert.ok(re.test(content), message); }

// ── #22 startup check ─────────────────────────────────────────────────

test('StartupCheck_EveryAgentNamedInImplementIsInTheRequiredList', () => {
  const required = new Set(readRequired().filter((r) => r.kind === 'agent').map((r) => r.name));
  const named = new Set([...IMPLEMENT.matchAll(/`([a-z]+(?:-[a-z]+)*-agent)`/g)].map((m) => m[1]));
  for (const name of named) {
    assert.ok(required.has(name), `skills/implement/SKILL.md names \`${name}\` but its Required tools list does not`);
  }
});

test('StartupCheck_EveryAdapterScriptNamedInImplementIsInTheRequiredList', () => {
  const required = new Set(readRequired().filter((r) => r.kind.endsWith('-script')).map((r) => r.name));
  const named = new Set([...IMPLEMENT.matchAll(/(?:trackers|code-platform)\/active\/([a-z-]+\.sh)/g)].map((m) => m[1]));
  assert.ok(named.size > 0);
  for (const name of named) {
    assert.ok(required.has(name), `skills/implement/SKILL.md calls ${name} but its Required tools list does not`);
  }
});

test('StartupCheck_EveryRequiredToolExistsInThisRepo', () => {
  for (const r of readRequired()) {
    const where = {
      agent: ['agents', `${r.name}.md`],
      skill: ['skills', r.name, 'SKILL.md'],
      'tracker-script': ['trackers', 'local', r.name],
      'code-platform-script': ['code-platform', 'github', r.name],
    }[r.kind];
    assert.ok(where, `unknown kind ${r.kind}`);
    assert.ok(exists(...where), `Required tools lists ${r.kind} ${r.name}, which is not in the repo (${where.join('/')})`);
  }
});

// F73 #83: the executor and /troubleshoot (with its investigator) are retired, so the build skill no
// longer requires them: a startup check that still wanted them would stop every run on a missing file.
test('StartupCheck_RetiredAgentsAndSkillLeaveTheRequiredList', () => {
  const required = readRequired();
  assert.ok(required.length >= 20, `companion: the Required tools list was read (${required.length} entries)`);
  assert.ok(required.some((r) => r.kind === 'agent' && r.name === 'story-builder'), 'companion: story-builder is still required');
  const retired = required.filter((r) => ['story-executor-agent', 'troubleshoot-investigator', 'troubleshoot'].includes(r.name));
  assert.deepEqual(retired.map((r) => `${r.kind} ${r.name}`), [], 'the retired executor, investigator and /troubleshoot are not required');
});

test('StartupCheck_RunsBeforePhase1AndAMissingToolIsAStop', () => {
  const before = IMPLEMENT.slice(0, IMPLEMENT.indexOf('## Phase 1 — Understand'));
  mustMatch(before, /bin\/startup-check\.js/, 'the startup check must run before Phase 1');
  mustMatch(before, /exits non-zero[\s\S]{0,200}stop/i, 'a non-zero startup check must stop the run');
  mustMatch(before, /under `--autonomous`[\s\S]{0,120}(still stops|stops too)/i, 'the stop must hold under --autonomous');
});

// Claude Code leaves the checklist tools out on newer models unless CLAUDE_CODE_ENABLE_TODO_TOOLS=1
// is set (code.claude.com/docs/en/tools, "Task tool availability"). A run without them stops and
// says how to switch them on; it does not carry on without a checklist.
test('StartupCheck_NoChecklistTool_StopsAndSaysHowToSwitchItOn', () => {
  const before = IMPLEMENT.slice(0, IMPLEMENT.indexOf('## Phase 1 — Understand'));
  mustMatch(before, /TodoWrite/, 'the startup check must cover TodoWrite');
  mustMatch(before, /TaskCreate/, 'the startup check must accept the newer Task tools as the checklist');
  mustMatch(before, /neither[\s\S]{0,200}\*\*stop\*\*/i, 'with no checklist tool the run must stop');
  mustMatch(before, /CLAUDE_CODE_ENABLE_TODO_TOOLS=1/, 'the stop must say which setting switches the tools on');
  mustMatch(before, /restart/i, 'the stop must say Claude Code has to be restarted');
  assert.ok(!/carry on without/i.test(before), 'the startup check must not carry on without a checklist');
  assert.ok(!/skip it and say so once/.test(PROGRESS_RULE), 'progress-tracking.md still says to skip TodoWrite quietly');
  mustMatch(PROGRESS_RULE, /CLAUDE_CODE_ENABLE_TODO_TOOLS=1/, 'progress-tracking.md must say how to switch the tools on');
});

// ── #24 state and a progress line at every step ──────────────────────

test('StateAndProgress_SectionDefinesTheStepRecordAndItsEvents', () => {
  const s = section(IMPLEMENT, '## State and progress');
  assert.ok(s, 'expected a "## State and progress" section');
  for (const key of ['run-mode:', 'step:', 'updated:']) {
    assert.ok(s.includes(key), `the state contract must define ${key}`);
  }
  // C6: `next:` is only the resume script's output line (the step to run), not a saved line.
  assert.ok(!/^next:/m.test(s), 'the saved state template has no next: line');
  // F73 #83: the position is the saved step and review round; there are no per-task statuses.
  assert.ok(s.includes('round:'), 'the state contract must define round:');
  assert.ok(!/\| Task \| Name \| Wave/.test(s), 'the state contract has no per-task Progress table');
  for (const status of ['verified', 'reopened']) {
    assert.ok(!s.includes(`\`${status}\``), `the state contract must not define the per-task status \`${status}\``);
  }
  mustMatch(s, /bin\/progress\.js/, 'the step record must print the line through bin/progress.js');
  mustMatch(s, /before the next step starts/i, 'state must be saved before the next step starts');
});

test('StateAndProgress_EveryPhaseMarkerWriteAlsoWritesTheStepRecord', () => {
  const blocks = IMPLEMENT.split(/\n(?=#{2,3} )/).filter((b) => /\*\*Write the phase marker\*\*/.test(b));
  assert.ok(blocks.length >= 5, `expected at least 5 phase-marker write points, got ${blocks.length}`);
  for (const b of blocks) {
    const heading = b.split('\n')[0];
    assert.ok(/step record/i.test(b), `"${heading}" writes the phase marker but not the step record`);
  }
});

test('StateAndProgress_AfterCompactionTheFirstActionIsRereadingState', () => {
  const top = IMPLEMENT.slice(0, IMPLEMENT.indexOf('## Before you start'));
  mustMatch(top, /compact/i, 'the compaction instruction must sit above "Before you start"');
  mustMatch(top, /executor-state\.md/, 'after compaction the skill must re-read executor-state.md first');
});

test('StateAndProgress_ProgressLogIsSavedAndNamedInTheStoryWorkspace', () => {
  mustMatch(IMPLEMENT, /tasks\/stories\/<id>\/progress\.log/, 'progress.log must live in the story workspace');
});

// ── #25 --resume ──────────────────────────────────────────────────────

test('Resume_FlagIsDeclaredInFrontmatterAndFlagList', () => {
  const fm = IMPLEMENT.split('\n---')[0];
  mustMatch(fm, /description:.*--resume/, 'description: must mention --resume');
  mustMatch(fm, /argument-hint:.*--resume/, 'argument-hint: must mention --resume');
  mustMatch(IMPLEMENT, /- `--resume <id>`/, 'the flag list must define --resume <id>');
});

test('Resume_SectionReadsSavedStateAndCoversEveryCase', () => {
  const s = section(IMPLEMENT, '## Resume mode');
  assert.ok(s, 'expected a "## Resume mode" section');
  mustMatch(s, /bin\/resume-point\.js/, 'resume must use bin/resume-point.js');
  mustMatch(s, /no saved state[\s\S]{0,200}(stop|never start)/i, 'no saved state must stop, not start fresh');
  mustMatch(s, /`step:?`|\bstep:/, 'resume must re-enter at the saved `step`');
  mustMatch(s, /`round:?`|\bround:/, 'resume must re-enter a review at the saved `round`');
  assert.ok(!/must_fail/.test(s), 'resume has no must_fail exemption: it is retired');
  mustMatch(s, /run-mode: autonomous/, 'a resumed autonomous run must stay autonomous');
  mustMatch(s, /branch/i, 'resume must check it is on the saved branch');
});

// ── #26 done only after tests and review ─────────────────────────────

// F73 #83: the unit of "done" is the story. There are no per-task `verified`, `done` or `reopened`
// statuses: a story is done after its review and the e2e gate.

test('DoneAfterReview_AStoryWhoseSuiteIsGreenIsNotDoneYet', () => {
  const doneAfterReview = (t) => /\bstory is done[^.]{0,80}after the review[^.]{0,120}e2e gate/i.test(String(t).replace(/[*`]/g, '').replace(/\s+/g, ' '));
  assert.ok(!doneAfterReview('A story is done when its tests pass.'), 'planted text that completes a story on green must be rejected');
  assert.ok(!/mark each PASSed task `completed`/.test(IMPLEMENT), 'a passing run still marks tasks completed');
  assert.ok(doneAfterReview(IMPLEMENT), 'the skill must say a story is done after the review and the e2e gate pass');
});

test('DoneAfterReview_Phase3HasNoPerTaskStatuses', () => {
  const s = section(IMPLEMENT, '## Phase 3 — Evaluate + PR');
  assert.ok(s, 'expected a Phase 3 section');
  mustMatch(s, /evaluator-agent/, 'companion: the Phase 3 reviewers were read');
  assert.ok(!/`verified`|`reopened`|Marking tasks done|task-done|task-reopened/.test(s), 'Phase 3 must not turn verified tasks into done or reopen tasks: the story is the unit');
});

test('DoneAfterReview_FindingsGoToTheBuilderTestFirstThenOnlyTheirReviewersRerun', () => {
  const s = section(IMPLEMENT, '## Phase 3 — Evaluate + PR');
  assert.ok(s, 'expected a Phase 3 section');
  const f = s.replace(/[*`]/g, '').replace(/\s+/g, ' ');
  mustMatch(f, /story-builder[^.]{0,160}fix[^.]{0,160}test[- ]first|test[- ]first[^.]{0,160}story-builder/i, 'findings go to story-builder, job fix, test first');
  mustMatch(f, /suite-runner[^.]{0,120}green/i, 'a fix is followed by a green suite-runner run');
  mustMatch(f, /only the reviewers whose area/i, 'only the reviewers whose area the fix touched run again');
  mustMatch(f, /refactor: address review findings/, 'the fixes are one commit named "refactor: address review findings"');
});

test('DoneAfterReview_ProgressRuleNoLongerCompletesOnVerify', () => {
  assert.ok(!/Mark `completed` the moment its `<verify>` passes/.test(PROGRESS_RULE),
    'progress-tracking.md still completes a task the moment its verify passes');
});

// ── #27 never end a turn while background work runs ──────────────────

test('BackgroundWork_RuleExistsWithItsOneException', () => {
  assert.ok(exists('rules', 'background-work.md'), 'expected rules/background-work.md');
  const rule = read('rules', 'background-work.md');
  mustMatch(rule, /final summary|end (its|the) turn/i, 'the rule must forbid ending the turn early');
  mustMatch(rule, /exception/i, 'the rule must state its one exception');
});

test('BackgroundWork_TheBuildSkillReferencesTheRule', () => {
  assert.ok(IMPLEMENT.includes('rules/background-work.md'), 'skills/implement/SKILL.md must reference rules/background-work.md');
});

// ── #28 unambiguous names ─────────────────────────────────────────────

test('Names_RoleAgentsAreRenamed', () => {
  assert.ok(exists('agents', 'build-session.md'), 'expected agents/build-session.md');
  assert.ok(exists('agents', 'review-session.md'), 'expected agents/review-session.md');
  assert.ok(!exists('agents', 'builder.md'), 'agents/builder.md should be renamed');
  assert.ok(!exists('agents', 'reviewer.md'), 'agents/reviewer.md should be renamed');
  mustMatch(read('agents', 'build-session.md'), /^name: build-session$/m, 'build-session.md name: field');
  mustMatch(read('agents', 'review-session.md'), /^name: review-session$/m, 'review-session.md name: field');
});

test('Names_RostersPointAtTheRenamedAgents', () => {
  for (const pack of ['solo', 'enterprise']) {
    const roster = JSON.parse(read('templates', `harness-roles.${pack}.json`));
    assert.equal(roster.roles.builder.agent, 'build-session', `${pack}: roles.builder.agent`);
    assert.equal(roster.roles.reviewer.agent, 'review-session', `${pack}: roles.reviewer.agent`);
  }
});

test('Names_NothingLaunchesTheOldAgentNames', () => {
  const dirs = ['agents', 'skills', 'rules', 'templates'];
  const offenders = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(path.join(REPO_ROOT, d), { withFileTypes: true })) {
      const rel = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== '__tests__' && e.name !== 'node_modules') walk(rel); continue; }
      if (!/\.(md|json)$/.test(e.name)) continue;
      const text = read(rel);
      if (/--agent (builder|reviewer)\b|"agent": "(builder|reviewer)"/.test(text)) offenders.push(rel);
    }
  };
  dirs.forEach(walk);
  assert.deepEqual(offenders, [], `still launch the old agent names: ${offenders.join(', ')}`);
});

test('Names_BuiltInAgentsAreNamedAsBuiltIns', () => {
  mustMatch(IMPLEMENT, /built-in `Explore` agent/, 'the --research step must name Claude Code\'s built-in Explore agent');
});
