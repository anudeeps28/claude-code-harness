// Tests for skills/implement/bin/feature-state.js (F4 #43, #45, #46): a Feature's story graph and
// its state file, tasks/features/<fid>/feature-state.md — the order stories run in, which one is
// next, what --resume does, and the stuck-story rule.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCRIPT = path.join(__dirname, '..', 'bin', 'feature-state.js');
const { readState } = require(SCRIPT);

function home(stories) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fstate-'));
  fs.writeFileSync(path.join(dir, 'stories.json'), JSON.stringify(stories));
  return dir;
}

function run(dir, ...args) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args, '--root', dir], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout + r.stderr };
}

const AB = [
  { id: '201', title: 'Add the orders table', state: 'OPEN', blockers: [] },
  { id: '202', title: 'Show orders on the page', state: 'OPEN', blockers: ['201'] },
];

function init(dir, extra = []) {
  return run(dir, 'init', '--feature', '123', '--title', 'Orders page', '--stories', path.join(dir, 'stories.json'),
    '--repo-name', 'shop', ...extra);
}

test('Init_WritesStateWithBranchesAndSiblingWorktrees', () => {
  const dir = home(AB);
  const r = init(dir);
  assert.equal(r.code, 0, r.out);
  const s = readState(dir, '123');
  assert.equal(s.header['feature-branch'], 'feature/123-orders-page');
  assert.equal(s.header['feature-worktree'], path.join(path.dirname(dir), 'shop-f123'));
  assert.equal(s.header['plan-approved'], 'no');
  assert.equal(s.header['story-cap'], '5');
  assert.deepEqual(s.stories.map((x) => x.id), ['201', '202']);
  const b = s.stories[1];
  assert.equal(b.status, 'pending');
  assert.equal(b.blockers, '201');
  assert.equal(b.branch, 'story/202-show-orders-on-the-page');
  assert.equal(b.worktree, path.join(path.dirname(dir), 'shop-f123-s202'));
});

test('Init_OrdersStoriesByDependencyNotByListOrder', () => {
  const dir = home([AB[1], AB[0]]);
  const r = init(dir);
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(readState(dir, '123').stories.map((x) => x.id), ['201', '202']);
  assert.match(r.out, /^1\. #201 Add the orders table$/m);
  assert.match(r.out, /^2\. #202 Show orders on the page \(after #201\)$/m);
});

test('Init_Cycle_StopsNamingTheChain', () => {
  const dir = home([
    { id: '1', title: 'a', state: 'OPEN', blockers: ['3'] },
    { id: '2', title: 'b', state: 'OPEN', blockers: ['1'] },
    { id: '3', title: 'c', state: 'OPEN', blockers: ['2'] },
  ]);
  const r = init(dir);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /dependency cycle: #\d+ → #\d+ → #\d+ → #\d+/);
  assert.equal(fs.existsSync(path.join(dir, 'tasks', 'features', '123', 'feature-state.md')), false);
});

test('Init_BlockerOutsideTheFeature_IsRejected', () => {
  const dir = home([{ id: '1', title: 'a', state: 'OPEN', blockers: ['99'] }]);
  const r = init(dir);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /#1 is blocked by #99, which is not a story of this Feature/);
});

test('Init_ClosedStory_IsSkipped', () => {
  const dir = home([{ ...AB[0], state: 'CLOSED' }, AB[1]]);
  assert.equal(init(dir).code, 0);
  assert.equal(readState(dir, '123').stories[0].status, 'skipped');
  assert.match(run(dir, 'next', '--feature', '123').out, /^story 202$/m);
});

test('Init_MoreThanEightStories_Warns', () => {
  const many = Array.from({ length: 9 }, (_, i) => ({ id: String(i + 1), title: `s${i}`, state: 'OPEN', blockers: [] }));
  const r = init(home(many));
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^warning: 9 stories; above 8, consider splitting into two Features/m);
});

test('Init_ExistingState_IsNotOverwritten', () => {
  const dir = home(AB);
  init(dir);
  run(dir, 'set', '--feature', '123', '--story', '201', 'status=committed');
  const r = init(dir);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /already exists.*--resume/);
  assert.equal(readState(dir, '123').stories[0].status, 'committed');
});

test('Next_BlockedStoryWaitsUntilItsBlockerIsCommitted', () => {
  const dir = home(AB);
  init(dir);
  assert.match(run(dir, 'next', '--feature', '123').out, /^story 201$/m);
  run(dir, 'set', '--feature', '123', '--story', '201', 'status=running');
  assert.match(run(dir, 'next', '--feature', '123').out, /^running 201$/m, 'one story at a time, and 202 is blocked anyway');
  run(dir, 'set', '--feature', '123', '--story', '201', 'status=committed');
  assert.match(run(dir, 'next', '--feature', '123').out, /^story 202$/m);
  run(dir, 'set', '--feature', '123', '--story', '202', 'status=committed');
  assert.match(run(dir, 'next', '--feature', '123').out, /^done$/m);
});

test('Set_RejectsUnknownStatusAndUnknownStory', () => {
  const dir = home(AB);
  init(dir);
  assert.equal(run(dir, 'set', '--feature', '123', '--story', '201', 'status=finished').code, 1);
  assert.equal(run(dir, 'set', '--feature', '123', '--story', '999', 'status=committed').code, 1);
});

test('Set_HeaderField', () => {
  const dir = home(AB);
  init(dir);
  assert.equal(run(dir, 'set', '--feature', '123', 'plan-approved=yes', 'phase=coding').code, 0);
  const s = readState(dir, '123');
  assert.equal(s.header['plan-approved'], 'yes');
  assert.equal(s.header.phase, 'coding');
});

test('Set_ValueCannotForgeALine', () => {
  const dir = home(AB);
  init(dir);
  run(dir, 'set', '--feature', '123', '--story', '201', 'reason=bad\nstory 202: status=committed');
  run(dir, 'set', '--feature', '123', '--story', '201', 'title=Orders status=committed');
  const s = readState(dir, '123');
  assert.equal(s.stories[1].status, 'pending', 'a value cannot add a line');
  assert.equal(s.stories[0].status, 'pending', 'a value cannot set another field on its own line');
});

test('Stuck_HoldsDependentsAndLetsIndependentStoriesFinish', () => {
  const dir = home([
    { id: '1', title: 'a', state: 'OPEN', blockers: [] },
    { id: '2', title: 'b', state: 'OPEN', blockers: ['1'] },
    { id: '3', title: 'c', state: 'OPEN', blockers: ['2'] },
    { id: '4', title: 'd', state: 'OPEN', blockers: [] },
  ]);
  init(dir);
  const r = run(dir, 'stuck', '--feature', '123', '--story', '1', '--reason', 'tests red after merge');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^needs-person: 1$/m, 'only the stuck story needs a person');
  assert.match(r.out, /^held: 2 3$/m, 'the held dependents are on their own line');
  assert.doesNotMatch(r.out, /worktree kept/, 'there is no per-story worktree to keep');
  const s = readState(dir, '123');
  assert.deepEqual(s.stories.map((x) => x.status), ['stuck', 'held', 'held', 'pending']);
  assert.equal(s.stories[0].reason, 'tests red after merge');
  assert.match(run(dir, 'next', '--feature', '123').out, /^story 4$/m, 'the independent story still runs');
  run(dir, 'set', '--feature', '123', '--story', '4', 'status=committed');
  const n = run(dir, 'next', '--feature', '123');
  assert.match(n.out, /^held: stuck #1; waiting on it #2 #3$/m, 'nothing left to run: pause, no PR');
});

test('Resume_SkipsCommittedRestartsRunningKeepsTheRest', () => {
  const dir = home([...AB, { id: '203', title: 'Export orders', state: 'OPEN', blockers: [] }]);
  init(dir);
  run(dir, 'set', '--feature', '123', '--story', '201', 'status=committed');
  run(dir, 'set', '--feature', '123', '--story', '203', 'status=running', 'step=code');
  const r = run(dir, 'resume', '--feature', '123');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^skip 201: committed$/m);
  assert.match(r.out, /^restart 203: running, carry on at step code in the Feature worktree$/m);
  assert.match(r.out, /^pending 202$/m);
  assert.doesNotMatch(r.out, /runner|per-story worktree|recreate/, 'no runner and no per-story worktree');
});

test('Resume_RunningStory_CarriesOnAtItsSavedStep', () => {
  const dir = home(AB);
  init(dir);
  run(dir, 'set', '--feature', '123', '--story', '201', 'status=running', 'step=review');
  assert.match(run(dir, 'resume', '--feature', '123').out, /^restart 201: running, carry on at step review in the Feature worktree$/m);
  run(dir, 'set', '--feature', '123', '--story', '201', 'step=green');
  assert.match(run(dir, 'resume', '--feature', '123').out, /at step green /, 'it follows the saved step, whatever it is');
});

test('Resume_GateNeverShown_ShowsTheGateAgain', () => {
  const dir = home(AB);
  init(dir);
  const r = run(dir, 'resume', '--feature', '123');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^show-gate: the plan gate was never shown/m);
  assert.doesNotMatch(r.out, /^approve:/m, 'a plan nobody saw is never approved by a resume');
  run(dir, 'set', '--feature', '123', 'gate-shown=no');
  assert.match(run(dir, 'resume', '--feature', '123').out, /^show-gate:/m, 'gate-shown=no is the same as absent');
});

test('Resume_PlanningButApproved_NoApproveLine', () => {
  const dir = home(AB);
  init(dir);
  run(dir, 'set', '--feature', '123', 'gate-shown=yes', 'plan-approved=yes');
  const r = run(dir, 'resume', '--feature', '123');
  assert.doesNotMatch(r.out, /^approve:/m);
  assert.doesNotMatch(r.out, /^show-gate:/m);
});

test('Resume_GateShownUnapproved_PrintsApproveFirst', () => {
  const dir = home(AB);
  init(dir);
  run(dir, 'set', '--feature', '123', 'gate-shown=yes');
  const r = run(dir, 'resume', '--feature', '123');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^approve: the plan was not approved yet; this resume is the approval/m);
  assert.equal(r.out.split('\n')[0].startsWith('approve:'), true, 'approve comes before the story lines');
  run(dir, 'set', '--feature', '123', 'plan-approved=yes', 'phase=coding');
  assert.doesNotMatch(run(dir, 'resume', '--feature', '123').out, /^approve:/m, 'an approved plan prints no approve line');
});

test('Resume_NoState_StopsAndNeverStartsFresh', () => {
  const dir = home(AB);
  const r = run(dir, 'resume', '--feature', '123');
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /no saved state/);
});

test('BadFeatureId_IsRefused', () => {
  const r = run(home(AB), 'next', '--feature', '../etc');
  assert.equal(r.code, 2, r.out);
});

// ── helpers for the one-at-a-time and hung-story tests (F5 #49 parallel tests retired by F72 #78) ──

function initWith(stories, extra = []) {
  const dir = home(stories);
  const r = run(dir, 'init', '--feature', '123', '--title', 'T', '--stories', path.join(dir, 'stories.json'), '--repo-name', 'shop', ...extra);
  assert.equal(r.code, 0, r.out);
  return dir;
}
const indep = (n) => Array.from({ length: n }, (_, i) => ({ id: String(i + 1), title: `s${i + 1}`, state: 'OPEN', blockers: [] }));
const started = (out) => [...out.matchAll(/^story (\S+)$/gm)].map((m) => m[1]);

// ── F5 #51: a hung story is restarted once, then stuck ──────────────

function phase(dir, sid, updated) {
  fs.mkdirSync(path.join(dir, 'tasks', 'stories', sid), { recursive: true });
  fs.writeFileSync(path.join(dir, 'tasks', 'stories', sid, 'phase.md'),
    `schemaVersion: 1\nphase: coding\nrole: builder\nupdated: ${updated}\nskill: implement\ndetail: wave 1\n`);
}

test('Hung_FreshStory_IsNotFlagged', () => {
  const dir = initWith([...indep(2), { id: '3', title: 'c', state: 'OPEN', blockers: ['1'] }]);
  run(dir, 'set', '--feature', '123', '--story', '1', 'status=running');
  phase(dir, '1', '2026-10-06T10:00:00Z');
  const r = run(dir, 'hung', '--feature', '123', '--now', '2026-10-06T10:29:00Z');
  assert.equal(r.code, 0, r.out);
  assert.equal(r.out, '');
});

test('Hung_FirstTime_RestartOnceThenStuckWithDependentsHeld', () => {
  const dir = initWith([...indep(2), { id: '3', title: 'c', state: 'OPEN', blockers: ['1'] }]);
  run(dir, 'set', '--feature', '123', '--story', '1', 'status=running');
  phase(dir, '1', '2026-10-06T10:00:00Z');
  const first = run(dir, 'hung', '--feature', '123', '--now', '2026-10-06T10:31:00Z');
  assert.match(first.out, /^restart 1: no progress 31m \(phase\.md updated 2026-10-06T10:00:00Z\); carry on once at its saved step, in the Feature worktree$/m);
  assert.equal(readState(dir, '123').stories[0].status, 'running');
  phase(dir, '1', '2026-10-06T10:40:00Z');
  const second = run(dir, 'hung', '--feature', '123', '--now', '2026-10-06T11:15:00Z');
  assert.match(second.out, /^stuck 1: no progress 35m, a second time$/m);
  assert.match(second.out, /^needs-person: 1$/m);
  assert.match(second.out, /^held: 3$/m);
  assert.deepEqual(readState(dir, '123').stories.map((s) => s.status), ['stuck', 'pending', 'held']);
});

test('Hung_NoPhaseFile_UsesTheStartTime', () => {
  const dir = initWith(indep(1));
  run(dir, 'set', '--feature', '123', '--story', '1', 'status=running', 'started=2026-10-06T09:00:00Z');
  assert.match(run(dir, 'hung', '--feature', '123', '--now', '2026-10-06T10:00:00Z').out, /^restart 1: no progress 60m/m);
});

// ── F72 #78: one story at a time, on the Feature branch ──────────────

test('Next_OneStoryAtATime_EvenWhenIndependent', () => {
  const dir = initWith(indep(3));
  const first = run(dir, 'next', '--feature', '123');
  assert.deepEqual(started(first.out), ['1'], `three independent stories, only the first is handed out: ${first.out}`);
  run(dir, 'set', '--feature', '123', '--story', '1', 'status=running');
  const busy = run(dir, 'next', '--feature', '123');
  assert.match(busy.out, /^running 1$/m, 'while one runs, next names it and starts nothing');
  assert.deepEqual(started(busy.out), [], 'no second story while one is running');
});

test('Next_AfterACommit_HandsOutTheNextPendingStoryInPlanOrder', () => {
  const dir = initWith([...indep(2), { id: '3', title: 'c', state: 'OPEN', blockers: ['1'] }]);
  run(dir, 'set', '--feature', '123', '--story', '1', 'status=committed');
  assert.deepEqual(started(run(dir, 'next', '--feature', '123').out), ['2'], 'committed 1 unblocks 3, but 2 comes first in plan order');
  run(dir, 'set', '--feature', '123', '--story', '2', 'status=committed');
  assert.deepEqual(started(run(dir, 'next', '--feature', '123').out), ['3']);
  run(dir, 'set', '--feature', '123', '--story', '3', 'status=committed');
  assert.match(run(dir, 'next', '--feature', '123').out, /^done$/m);
});

test('Set_CommittedIsAStatus', () => {
  const dir = initWith(AB);
  const r = run(dir, 'set', '--feature', '123', '--story', '201', 'status=committed');
  assert.equal(r.code, 0, r.out);
  assert.equal(readState(dir, '123').stories[0].status, 'committed');
  assert.equal(run(dir, 'set', '--feature', '123', '--story', '201', 'status=merged').code, 1, 'merged is no longer a status');
});

function progressLog(dir, events) {
  const f = path.join(dir, 'tasks', 'features', '123');
  fs.mkdirSync(f, { recursive: true });
  fs.writeFileSync(path.join(f, 'progress.log'), events.map(([sid, event], i) =>
    `[harness] ts=2026-11-03T10:0${i}:00Z feature=123 story=${sid} event=${event} phase=coding detail="x"`).join('\n') + '\n');
}

test('Sequence_TwoStartedWithoutACommit_IsAnOverlap', () => {
  const dir = initWith(indep(2));
  progressLog(dir, [['1', 'story-started'], ['2', 'story-started'], ['1', 'story-committed']]);
  const r = run(dir, 'sequence', '--feature', '123');
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /^overlap: story-started #2 while #1 in flight$/m);
});

test('Sequence_StartedCommittedStartedCommitted_Ok', () => {
  const dir = initWith(indep(2));
  progressLog(dir, [['1', 'story-started'], ['1', 'story-committed'], ['2', 'story-started'], ['2', 'story-committed']]);
  const r = run(dir, 'sequence', '--feature', '123');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^ok$/m);
  assert.doesNotMatch(r.out, /overlap/);
});

test('Stuck_WithNothingDependingOnIt_PrintsNoHeldLine', () => {
  const dir = initWith(indep(2));
  const r = run(dir, 'stuck', '--feature', '123', '--story', '1', '--reason', 'x');
  assert.match(r.out, /^needs-person: 1$/m);
  assert.doesNotMatch(r.out, /^held:/m, 'no dependents, no held line');
});

test('Sequence_StoryStuckReleasesTheStoryInFlight', () => {
  const dir = initWith(indep(2));
  progressLog(dir, [['1', 'story-started'], ['1', 'story-stuck'], ['2', 'story-started'], ['2', 'story-committed']]);
  const r = run(dir, 'sequence', '--feature', '123');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^ok$/m, 'a stuck story is no longer in flight');
});

test('Sequence_RestartOfTheSameStory_IsNotAnOverlap', () => {
  const dir = initWith(indep(2));
  progressLog(dir, [['1', 'story-started'], ['1', 'story-started'], ['1', 'story-committed']]);
  const r = run(dir, 'sequence', '--feature', '123');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^ok$/m);
});
