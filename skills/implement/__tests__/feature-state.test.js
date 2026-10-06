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
  run(dir, 'set', '--feature', '123', '--story', '201', 'status=merged');
  const r = init(dir);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /already exists.*--resume/);
  assert.equal(readState(dir, '123').stories[0].status, 'merged');
});

test('Next_BlockedStoryWaitsUntilItsBlockerHasMerged', () => {
  const dir = home(AB);
  init(dir);
  assert.match(run(dir, 'next', '--feature', '123').out, /^story 201$/m);
  run(dir, 'set', '--feature', '123', '--story', '201', 'status=running');
  assert.match(run(dir, 'next', '--feature', '123').out, /^wait$/m, 'one story at a time, and 202 is blocked anyway');
  run(dir, 'set', '--feature', '123', '--story', '201', 'status=merged');
  assert.match(run(dir, 'next', '--feature', '123').out, /^story 202$/m);
  run(dir, 'set', '--feature', '123', '--story', '202', 'status=merged');
  assert.match(run(dir, 'next', '--feature', '123').out, /^done$/m);
});

test('Set_RejectsUnknownStatusAndUnknownStory', () => {
  const dir = home(AB);
  init(dir);
  assert.equal(run(dir, 'set', '--feature', '123', '--story', '201', 'status=finished').code, 1);
  assert.equal(run(dir, 'set', '--feature', '123', '--story', '999', 'status=merged').code, 1);
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
  run(dir, 'set', '--feature', '123', '--story', '201', 'reason=bad\nstory 202: status=merged');
  run(dir, 'set', '--feature', '123', '--story', '201', 'title=Orders status=merged');
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
  assert.match(r.out, /^needs-person: 1 2 3$/m);
  const s = readState(dir, '123');
  assert.deepEqual(s.stories.map((x) => x.status), ['stuck', 'held', 'held', 'pending']);
  assert.equal(s.stories[0].reason, 'tests red after merge');
  assert.match(run(dir, 'next', '--feature', '123').out, /^story 4$/m, 'the independent story still runs');
  run(dir, 'set', '--feature', '123', '--story', '4', 'status=merged');
  const n = run(dir, 'next', '--feature', '123');
  assert.match(n.out, /^held: stuck #1; waiting on it #2 #3$/m, 'nothing left to run: pause, no PR');
});

test('Resume_SkipsMergedRestartsRunningKeepsTheRest', () => {
  const dir = home([...AB, { id: '203', title: 'Export orders', state: 'OPEN', blockers: [] }]);
  init(dir);
  run(dir, 'set', '--feature', '123', '--story', '201', 'status=merged');
  run(dir, 'set', '--feature', '123', '--story', '203', 'status=running');
  const r = run(dir, 'resume', '--feature', '123');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^skip 201: merged$/m);
  assert.match(r.out, /^restart 203: running; its worktree .*shop-f123-s203 is missing, recreate it from the Feature branch$/m);
  assert.match(r.out, /^pending 202$/m);
});

test('Resume_RunningStoryWithWorktree_RestartsFromSavedState', () => {
  const dir = home(AB);
  init(dir);
  const s = readState(dir, '123');
  fs.mkdirSync(s.stories[0].worktree, { recursive: true });
  try {
    run(dir, 'set', '--feature', '123', '--story', '201', 'status=running');
    assert.match(run(dir, 'resume', '--feature', '123').out, /^restart 201: running; worktree present, restart its runner from tasks\/stories\/201\/executor-state\.md$/m);
  } finally { fs.rmSync(s.stories[0].worktree, { recursive: true, force: true }); }
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

// ── F5 #49: independent stories in parallel ──────────────────────────

function initWith(stories, extra = []) {
  const dir = home(stories);
  const r = run(dir, 'init', '--feature', '123', '--title', 'T', '--stories', path.join(dir, 'stories.json'), '--repo-name', 'shop', ...extra);
  assert.equal(r.code, 0, r.out);
  return dir;
}
const indep = (n) => Array.from({ length: n }, (_, i) => ({ id: String(i + 1), title: `s${i + 1}`, state: 'OPEN', blockers: [] }));
const started = (out) => [...out.matchAll(/^story (\S+)$/gm)].map((m) => m[1]);

test('Parallel_IndependentStoriesStartTogether', () => {
  const dir = initWith([...indep(2), { id: '3', title: 'c', state: 'OPEN', blockers: ['1'] }]);
  assert.equal(readState(dir, '123').header['story-cap'], '5', 'the default cap is 5');
  assert.deepEqual(started(run(dir, 'next', '--feature', '123').out), ['1', '2'], 'A and B start at once; C waits for A');
});

test('Parallel_BlockedStoryNeverStartsBeforeItsBlockerMerges', () => {
  const dir = initWith([...indep(2), { id: '3', title: 'c', state: 'OPEN', blockers: ['1'] }]);
  run(dir, 'set', '--feature', '123', '--story', '1', 'status=running');
  run(dir, 'set', '--feature', '123', '--story', '2', 'status=merged');
  assert.deepEqual(started(run(dir, 'next', '--feature', '123').out), [], 'B merged, but C still waits for A');
  assert.match(run(dir, 'next', '--feature', '123').out, /^wait$/m);
  run(dir, 'set', '--feature', '123', '--story', '1', 'status=merged');
  assert.deepEqual(started(run(dir, 'next', '--feature', '123').out), ['3']);
});

test('Parallel_CapOfOne_RunsOneAtATimeInOrder', () => {
  const dir = initWith(indep(3), ['--story-cap', '1']);
  assert.deepEqual(started(run(dir, 'next', '--feature', '123').out), ['1']);
});

test('Parallel_AgentLimit_FiveWideStoriesRunThreeAtATime', () => {
  const dir = initWith(indep(5));
  for (const s of ['1', '2', '3', '4', '5']) run(dir, 'set', '--feature', '123', '--story', s, 'width=5');
  // 1 + 3 × (1 + 5) = 19 ≤ 20; a fourth would make 25.
  const r = run(dir, 'next', '--feature', '123');
  assert.deepEqual(started(r.out), ['1', '2', '3'], r.out);
  assert.match(r.out, /^agents: 19\/20$/m);
  for (const s of ['1', '2', '3']) run(dir, 'set', '--feature', '123', '--story', s, 'status=running');
  assert.deepEqual(started(run(dir, 'next', '--feature', '123').out), []);
  run(dir, 'set', '--feature', '123', '--story', '1', 'status=merged');
  assert.deepEqual(started(run(dir, 'next', '--feature', '123').out), ['4'], 'the next one starts as soon as one finishes');
});

test('Parallel_UnplannedStoryCountsAsFiveWide', () => {
  const dir = initWith(indep(5));
  assert.deepEqual(started(run(dir, 'next', '--feature', '123').out), ['1', '2', '3']);
});

test('Parallel_NarrowStoriesFitUpToTheCap', () => {
  const dir = initWith(indep(6));
  for (const s of ['1', '2', '3', '4', '5', '6']) run(dir, 'set', '--feature', '123', '--story', s, 'width=1');
  // 1 + 5 × 2 = 11: the cap of 5 binds before the agent limit.
  assert.deepEqual(started(run(dir, 'next', '--feature', '123').out), ['1', '2', '3', '4', '5']);
});

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
  assert.match(first.out, /^restart 1: no progress 31m \(phase\.md updated 2026-10-06T10:00:00Z\); restart its runner once from its saved state, in the same worktree$/m);
  assert.equal(readState(dir, '123').stories[0].status, 'running');
  phase(dir, '1', '2026-10-06T10:40:00Z');
  const second = run(dir, 'hung', '--feature', '123', '--now', '2026-10-06T11:15:00Z');
  assert.match(second.out, /^stuck 1: no progress 35m, a second time$/m);
  assert.match(second.out, /^needs-person: 1 3$/m);
  assert.deepEqual(readState(dir, '123').stories.map((s) => s.status), ['stuck', 'pending', 'held']);
});

test('Hung_NoPhaseFile_UsesTheStartTime', () => {
  const dir = initWith(indep(1));
  run(dir, 'set', '--feature', '123', '--story', '1', 'status=running', 'started=2026-10-06T09:00:00Z');
  assert.match(run(dir, 'hung', '--feature', '123', '--now', '2026-10-06T10:00:00Z').out, /^restart 1: no progress 60m/m);
});
