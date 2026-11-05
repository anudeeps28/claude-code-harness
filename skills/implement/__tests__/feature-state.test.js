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
  assert.deepEqual(s.stories.map((x) => x.id), ['201', '202']);
  const b = s.stories[1];
  assert.equal(b.status, 'pending');
  assert.equal(b.blockers, '201');
});

test('Init_HasNoStoryCapOrStoryBranches', () => {
  // AC5 of #79: one story at a time on the Feature branch, so no cap, no agent limit, and no
  // per-story branch or worktree in the state file.
  const dir = home(AB);
  assert.equal(init(dir, ['--story-cap', '3']).code, 0);
  const s = readState(dir, '123');
  assert.equal(s.header['feature-branch'], 'feature/123-orders-page', 'companion: the Feature branch is still recorded');
  assert.equal(s.stories.length, 2, 'companion: both stories are there');
  assert.equal(s.header['story-cap'], undefined, 'no story-cap');
  assert.equal(s.header['agent-limit'], undefined, 'no agent-limit');
  for (const st of s.stories) {
    assert.equal(st.branch, undefined, `story ${st.id} has no branch`);
    assert.equal(st.worktree, undefined, `story ${st.id} has no worktree`);
  }
  const raw = fs.readFileSync(path.join(dir, 'tasks', 'features', '123', 'feature-state.md'), 'utf8').replace(/\r\n/g, '\n');
  assert.doesNotMatch(raw, /story-cap|agent-limit|story\/\d|-s20\d/, 'nothing in the file names a story branch or a story worktree');
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

// ── F72 #79: resume reads the Feature branch's own commits, in a real git repository ──

function git(cwd, ...args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

// A real repo on main with the Feature branch checked out; `commits` are made on the Feature branch,
// `onMain` are made on main before it. Returns the repo path and each commit's sha by message.
function featureRepo(commits, onMain = []) {
  const wt = fs.mkdtempSync(path.join(os.tmpdir(), 'fstate-git-'));
  git(wt, 'init', '-q', '-b', 'main');
  git(wt, 'config', 'user.email', 'test@example.com');
  git(wt, 'config', 'user.name', 'Test');
  git(wt, 'config', 'core.autocrlf', 'false');
  const shas = {};
  const commit = (msg, i) => {
    fs.writeFileSync(path.join(wt, `f${i}.txt`), `${i}\n`);
    git(wt, 'add', '.');
    git(wt, 'commit', '-q', '-m', msg);
    shas[msg] = git(wt, 'rev-parse', 'HEAD');
  };
  commit('init', 0);
  onMain.forEach((m, i) => commit(m, 100 + i));
  git(wt, 'checkout', '-q', '-b', 'feature/123-orders-page');
  commits.forEach((m, i) => commit(m, i + 1));
  return { wt, shas };
}

const resume = (dir, wt) => run(dir, 'resume', '--feature', '123', '--feature-worktree', wt);

test('Resume_SkipsStoriesWhoseCommitIsOnTheFeatureBranch', () => {
  // AC4 of #79. 201 has its commit although the state lagged (still pending). 202 only has look-alikes:
  // a message that merely mentions it, a longer id, and a commit on main, before the Feature branch.
  const { wt, shas } = featureRepo(
    ['Add the orders table\n\nStory: #201', 'Tidy\n\nStory: #2020', 'Notes about Story: #202 in prose'],
    ['Old work\n\nStory: #202']);
  const dir = home([...AB, { id: '203', title: 'Export orders', state: 'OPEN', blockers: [] }]);
  init(dir);
  const r = resume(dir, wt);
  assert.equal(r.code, 0, r.out);
  const sha = shas['Add the orders table\n\nStory: #201'];
  assert.ok(sha, 'fixture: the 201 commit exists');
  assert.match(r.out, new RegExp(`^skip 201: committed ${sha.slice(0, 7)}[0-9a-f]*$`, 'm'));
  assert.equal(readState(dir, '123').stories[0].status, 'committed', 'the lagging state is brought up to date');
  assert.doesNotMatch(r.out, /^skip 202/m, 'look-alike messages and a commit on main are not 202\'s commit');
  assert.doesNotMatch(r.out, /^skip 203/m);
  assert.equal(readState(dir, '123').stories[1].status, 'pending');
  assert.match(r.out, /^story 202$/m, 'the next story is handed out');
});

test('Resume_RunningStoryRestartsFromItsSavedStep', () => {
  const { wt } = featureRepo(['Add the orders table\n\nStory: #201']);
  const dir = home([...AB, { id: '203', title: 'Export orders', state: 'OPEN', blockers: [] }]);
  init(dir);
  run(dir, 'set', '--feature', '123', '--story', '201', 'status=committed');
  run(dir, 'set', '--feature', '123', '--story', '202', 'status=running', 'step=review');
  let r = resume(dir, wt);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^restart 202: from step review$/m);
  run(dir, 'set', '--feature', '123', '--story', '202', 'step=green');
  r = resume(dir, wt);
  assert.match(r.out, /^restart 202: from step green$/m, 'it follows the saved step, whatever it is');
  assert.doesNotMatch(r.out, /^restart 203/m, 'a pending story is not restarted');
  assert.doesNotMatch(r.out, /runner|per-story worktree|recreate/, 'no runner and no per-story worktree');
});

test('Resume_AllCommitted_GoesToTheFeaturePhases', () => {
  const { wt } = featureRepo(['One\n\nStory: #201', 'Two\n\nStory: #202']);
  const dir = home(AB);
  init(dir);
  const r = resume(dir, wt);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^skip 201: committed [0-9a-f]{7,40}$/m);
  assert.match(r.out, /^skip 202: committed [0-9a-f]{7,40}$/m);
  assert.match(r.out, /^done$/m, 'nothing left to build: on to the Feature phases');
  assert.deepEqual(readState(dir, '123').stories.map((s) => s.status), ['committed', 'committed']);
});

test('Resume_BaseBranchIsNotMain_StillSkipsTheCommittedStory', () => {
  // A repo whose trunk is "trunk": main..HEAD would make git fail and redo every committed story.
  const wt = fs.mkdtempSync(path.join(os.tmpdir(), 'fstate-trunk-'));
  git(wt, 'init', '-q', '-b', 'trunk');
  git(wt, 'config', 'user.email', 'test@example.com');
  git(wt, 'config', 'user.name', 'Test');
  fs.writeFileSync(path.join(wt, 'a.txt'), 'a\n');
  git(wt, 'add', '.');
  git(wt, 'commit', '-q', '-m', 'init');
  git(wt, 'checkout', '-q', '-b', 'feature/123-orders-page');
  fs.writeFileSync(path.join(wt, 'b.txt'), 'b\n');
  git(wt, 'add', '.');
  git(wt, 'commit', '-q', '-m', 'Add the orders table\n\nStory: #201');
  const sha = git(wt, 'rev-parse', 'HEAD');
  const dir = home(AB);
  assert.equal(init(dir, ['--base', 'trunk']).code, 0);
  assert.equal(readState(dir, '123').header.base, 'trunk', 'the base branch is recorded at init');
  run(dir, 'set', '--feature', '123', '--story', '201', 'status=committed', `commit=${sha}`);
  const r = resume(dir, wt);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, new RegExp(`^skip 201: committed ${sha.slice(0, 7)}`, 'm'));
  assert.doesNotMatch(r.out, /^redo 201/m);
  assert.equal(readState(dir, '123').stories[0].status, 'committed');
});

// The base is passed to git as an argument, so a value shaped like an option is refused at init.
test('Init_BaseThatLooksLikeAnOption_IsRefused', () => {
  const dir = home(AB);
  const r = init(dir, ['--base', '--all']);
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /bad branch name for --base: --all/);
  assert.equal(init(dir, ['--base', 'release/2026.11']).code, 0, 'a real branch name with a slash and dots is fine');
});

// A state file written before the base was recorded still resumes against main.
test('Resume_StateWithNoBaseHeader_UsesMain', () => {
  const { wt } = featureRepo(['Add the orders table\n\nStory: #201']);
  const dir = home(AB);
  init(dir);
  const file = path.join(dir, 'tasks', 'features', '123', 'feature-state.md');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(/^base: main\r?\n/m, ''));
  assert.equal(readState(dir, '123').header.base, undefined, 'the header really has no base now');
  run(dir, 'set', '--feature', '123', '--story', '201', 'status=committed', 'commit=x');
  const r = resume(dir, wt);
  assert.match(r.out, /^skip 201: committed/m, r.out);
});

test('Resume_CommittedStoryWhoseCommitIsNotOnTheBranch_IsRedoneAndPending', () => {
  const { wt } = featureRepo(['Other work\n\nStory: #999']);
  const dir = home(AB);
  init(dir);
  run(dir, 'set', '--feature', '123', '--story', '201', 'status=committed', 'commit=deadbeefdeadbeef');
  const r = resume(dir, wt);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^redo 201: commit deadbee not on feature\/123-orders-page$/m);
  assert.equal(readState(dir, '123').stories[0].status, 'pending');
});

test('Resume_RunningStoryWithoutStep_ReadsNextFromItsExecutorState', () => {
  const { wt } = featureRepo([]);
  const dir = home(AB);
  init(dir);
  run(dir, 'set', '--feature', '123', '--story', '201', 'status=running');
  const sdir = path.join(dir, 'tasks', 'stories', '201');
  fs.mkdirSync(sdir, { recursive: true });
  fs.writeFileSync(path.join(sdir, 'executor-state.md'), 'run-mode: autonomous\nnext: review\n');
  const r = resume(dir, wt);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^restart 201: from step review$/m);
});

test('Resume_RunningStoryWithoutStep_ReadsTheSavedStepFromItsExecutorState', () => {
  // F73 #83: executor-state.md saves `step:` and no longer writes `next:`.
  const { wt } = featureRepo([]);
  const dir = home(AB);
  init(dir);
  run(dir, 'set', '--feature', '123', '--story', '201', 'status=running');
  const sdir = path.join(dir, 'tasks', 'stories', '201');
  fs.mkdirSync(sdir, { recursive: true });
  fs.writeFileSync(path.join(sdir, 'executor-state.md'), 'run-mode: autonomous\nstep: code\nupdated: 2026-11-04T00:00:00Z\n');
  const r = resume(dir, wt);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^restart 201: from step code$/m);
});

test('Resume_FeatureWorktreeMissing_WarnsAndTrustsTheStateFile', () => {
  const dir = home(AB);
  init(dir);
  run(dir, 'set', '--feature', '123', '--story', '201', 'status=committed', 'commit=abc1234');
  const gone = path.join(os.tmpdir(), 'fstate-no-such-worktree');
  const r = resume(dir, gone);
  assert.equal(r.code, 0, r.out);
  const lines = r.out.split('\n');
  assert.equal(lines[0], `warn: no Feature worktree at ${gone}; committed stories are taken from the state file`);
  assert.match(r.out, /^skip 201: committed$/m, 'the committed story is still trusted');
  assert.equal(readState(dir, '123').stories[0].status, 'committed');
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

// hung runs on --resume, when no agent is running: an old phase.md says the session stopped, not
// that a job hung (a crash, a closed laptop and the usage limit all look the same). So it never
// marks a story stuck by itself: the first time it relaunches the step, the second time it asks.
test('Hung_FirstTimeRelaunches_SecondTimeAsks_NeverStuckByItself', () => {
  const dir = initWith([...indep(2), { id: '3', title: 'c', state: 'OPEN', blockers: ['1'] }]);
  run(dir, 'set', '--feature', '123', '--story', '1', 'status=running');
  phase(dir, '1', '2026-10-06T10:00:00Z');
  const first = run(dir, 'hung', '--feature', '123', '--now', '2026-10-06T10:31:00Z');
  assert.match(first.out, /^relaunch 1: no progress 31m \(phase\.md updated 2026-10-06T10:00:00Z\)/m);
  assert.equal(readState(dir, '123').stories[0].status, 'running');
  phase(dir, '1', '2026-10-06T10:40:00Z');
  const second = run(dir, 'hung', '--feature', '123', '--now', '2026-10-06T14:00:00Z');
  assert.match(second.out, /^ask 1: step stopped twice with no progress \(200m\)/m, second.out);
  assert.doesNotMatch(second.out, /^(stuck|needs-person|held)\b/m, 'it never marks a story stuck by itself');
  assert.deepEqual(readState(dir, '123').stories.map((s) => s.status), ['running', 'pending', 'pending'],
    'the story is still running and its dependent is not held');
});

test('Hung_OnlyTheStoryInFlight', () => {
  // AC5 of #79: one story runs at a time, so only the running one can hang. Planted look-alikes: a
  // pending story and a committed one both have a stale phase.md and must not be reported.
  const dir = initWith(indep(3));
  run(dir, 'set', '--feature', '123', '--story', '1', 'status=committed');
  run(dir, 'set', '--feature', '123', '--story', '2', 'status=running');
  phase(dir, '1', '2026-10-06T08:00:00Z');
  phase(dir, '2', '2026-10-06T10:00:00Z');
  phase(dir, '3', '2026-10-06T08:00:00Z');
  const r = run(dir, 'hung', '--feature', '123', '--now', '2026-10-06T10:45:00Z');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^relaunch 2: no progress 45m/m, 'the running story is reported');
  assert.doesNotMatch(r.out, /^\S+ [13]:/m, 'the committed and the pending story are not');
  assert.doesNotMatch(r.out, /^restart /m, 'the first hang is a relaunch, not a per-story restart');
  assert.deepEqual(readState(dir, '123').stories.map((s) => s.status), ['committed', 'running', 'pending']);
});

test('Hung_NoPhaseFile_UsesTheStartTime', () => {
  const dir = initWith(indep(1));
  run(dir, 'set', '--feature', '123', '--story', '1', 'status=running', 'started=2026-10-06T09:00:00Z');
  assert.match(run(dir, 'hung', '--feature', '123', '--now', '2026-10-06T10:00:00Z').out, /^relaunch 1: no progress 60m/m);
});

test('Hung_ANewStep_ClearsTheCounter_TheSameStepTwiceAsks', () => {
  // The counter counts relaunches of the same step only: a story that hung once and then moved on
  // to its next step gets a fresh relaunch, not a question.
  const dir = initWith(indep(1));
  run(dir, 'set', '--feature', '123', '--story', '1', 'status=running', 'step=tests');
  phase(dir, '1', '2026-10-06T10:00:00Z');
  assert.match(run(dir, 'hung', '--feature', '123', '--now', '2026-10-06T10:31:00Z').out, /^relaunch 1:/m);
  assert.equal(readState(dir, '123').stories[0].hangs, '1', 'companion: the first hang is counted');

  run(dir, 'set', '--feature', '123', '--story', '1', 'step=tests');
  assert.equal(readState(dir, '123').stories[0].hangs, '1', 'the same step set again keeps the count');

  run(dir, 'set', '--feature', '123', '--story', '1', 'step=code');
  assert.equal(readState(dir, '123').stories[0].hangs, undefined, 'a different step clears the count');
  const next = run(dir, 'hung', '--feature', '123', '--now', '2026-10-06T10:45:00Z');
  assert.match(next.out, /^relaunch 1:/m, `an old phase.md on the new step relaunches again: ${next.out}`);
  assert.doesNotMatch(next.out, /^ask /m);

  const again = run(dir, 'hung', '--feature', '123', '--now', '2026-10-06T11:15:00Z');
  assert.match(again.out, /^ask 1: /m, `the same step stopping twice is asked about: ${again.out}`);
});

test('ReadState_DropsABadStoryId_AndSaysSo', () => {
  const dir = initWith(indep(1));
  const file = path.join(dir, 'tasks', 'features', '123', 'feature-state.md');
  fs.appendFileSync(file, 'story a..b: status=pending title=x\n');
  const r = run(dir, 'next', '--feature', '123');
  assert.match(r.out, /^warn: dropped story row "a\.\.b": bad id$/m, r.out);
  assert.match(r.out, /^story 1$/m, 'companion: the good row is still read');
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

// ── review panel: values read from the state file reach git as arguments, so they are checked ──

test('Set_BaseThatLooksLikeAnOption_IsRefusedAndNotWritten', () => {
  const dir = home(AB);
  init(dir);
  const r = run(dir, 'set', '--feature', '123', 'base=--output=x');
  assert.notEqual(r.code, 0, r.out);
  assert.match(r.out, /bad branch name for base: --output=x/);
  assert.equal(readState(dir, '123').header.base, 'main', 'the refused value was not written');
  assert.equal(run(dir, 'set', '--feature', '123', 'base=release/2026.11').code, 0, 'a real branch name is still accepted');
});

test('Resume_StateFileBaseThatLooksLikeAnOption_IsRefusedAndGitNeverSeesIt', () => {
  const { wt } = featureRepo(['Add the orders table\n\nStory: #201']);
  const dir = home(AB);
  init(dir);
  const planted = path.join(os.tmpdir(), `fstate-planted-${process.pid}.txt`);
  fs.rmSync(planted, { force: true });
  const file = path.join(dir, 'tasks', 'features', '123', 'feature-state.md');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(/^base: .*$/m, `base: --output=${planted.split(path.sep).join('/')}`));
  const r = resume(dir, wt);
  assert.notEqual(r.code, 0, r.out);
  assert.match(r.out, /bad branch name for base/);
  assert.equal(fs.existsSync(planted), false, 'git was never run with the planted option, so no file was created');
});

test('Resume_StoryIdWithARegexDot_DoesNotMatchAnotherStorysCommit', () => {
  // Story 1.2 must not claim the commit "Story: #1x2": the id is matched as text, never as a pattern.
  const { wt } = featureRepo(['Other work\n\nStory: #1x2']);
  const dir = home([{ id: '1.2', title: 'Dotted', state: 'OPEN', blockers: [] }]);
  init(dir);
  const r = resume(dir, wt);
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.out, /^skip 1\.2/m, 'a look-alike commit with x for the dot is not 1.2');
  assert.match(r.out, /^story 1\.2$/m, 'it is still to build');
  const own = featureRepo(['Real\n\nStory: #1.2']);
  const dir2 = home([{ id: '1.2', title: 'Dotted', state: 'OPEN', blockers: [] }]);
  init(dir2);
  assert.match(resume(dir2, own.wt).out, /^skip 1\.2: committed/m, 'its own commit is still found');
});

test('ReadState_DropsAStoryRowWithABadId', () => {
  const dir = home(AB);
  init(dir);
  const file = path.join(dir, 'tasks', 'features', '123', 'feature-state.md');
  fs.appendFileSync(file, 'story ../evil: status=pending\nstory --all: status=pending\n');
  assert.deepEqual(readState(dir, '123').stories.map((s) => s.id), ['201', '202'], 'only well-formed ids survive; the two real stories prove the file was read');
});

// ── several sessions at once (F73 #82): claim and together ───────────────

const NOW = '2026-11-04T10:00:00Z';

function featureDir(dir, fid) {
  const f = path.join(dir, 'tasks', 'features', fid);
  fs.mkdirSync(f, { recursive: true });
  return f;
}

// One progress.log line in progress.js's own format, at the given time.
function logLine(fid, ts, event = 'step', sid = '1') {
  return `[harness] ts=${ts} feature=${fid} story=${sid} event=${event} phase=coding detail="x"\n`;
}

function claimed(dir, session, fid = '123') {
  fs.writeFileSync(path.join(featureDir(dir, fid), 'claim.md'), `session: ${session}\nclaimed: 2026-11-04T08:00:00Z\n`);
}

const claimFile = (dir, fid = '123') => path.join(dir, 'tasks', 'features', fid, 'claim.md');

function claim(dir, session, ...extra) {
  return run(dir, 'claim', '--feature', '123', '--session', session, '--now', NOW, ...extra);
}

test('Claim_OtherSessionActiveWithin30m_Busy', () => {
  const dir = home([]);
  claimed(dir, 's1');
  fs.writeFileSync(path.join(featureDir(dir, '123'), 'progress.log'), logLine('123', '2026-11-04T09:55:00Z', 'story-started'));
  const before = fs.readFileSync(claimFile(dir), 'utf8');
  const r = claim(dir, 's2');
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /^busy 123: session s1, last activity 5m ago \(story-started\)/m);
  assert.doesNotMatch(r.out, /^free$/m);
  assert.equal(fs.readFileSync(claimFile(dir), 'utf8'), before, 'the claim is unchanged');
  // Companion: 29 minutes is still active.
  fs.writeFileSync(path.join(featureDir(dir, '123'), 'progress.log'), logLine('123', '2026-11-04T09:31:00Z'));
  assert.equal(claim(dir, 's2').code, 1, '29 minutes old is still busy');
});

test('Claim_OtherSessionIdle30m_FreeAndTakesIt', () => {
  const dir = home([]);
  claimed(dir, 's1');
  fs.writeFileSync(path.join(featureDir(dir, '123'), 'progress.log'), logLine('123', '2026-11-04T09:30:00Z'));
  const r = claim(dir, 's2');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^free$/m);
  assert.match(fs.readFileSync(claimFile(dir), 'utf8'), /^session: s2$/m, 'the claim now names this session');
  // Companion: a newer phase.md keeps the Feature active even when the log is old.
  const dir2 = home([]);
  claimed(dir2, 's1');
  fs.writeFileSync(path.join(featureDir(dir2, '123'), 'progress.log'), logLine('123', '2026-11-04T08:00:00Z'));
  fs.writeFileSync(path.join(featureDir(dir2, '123'), 'phase.md'), 'schemaVersion: 1\nphase: coding\nrole: builder\nupdated: 2026-11-04T09:50:00Z\nskill: implement\ndetail: x\n');
  assert.equal(claim(dir2, 's2').code, 1, 'a fresh phase.md means busy');
});

test('Claim_SameSession_Free', () => {
  const dir = home([]);
  claimed(dir, 's1');
  fs.writeFileSync(path.join(featureDir(dir, '123'), 'progress.log'), logLine('123', '2026-11-04T09:58:00Z'));
  const r = claim(dir, 's1');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^free$/m);
  assert.equal(claim(dir, 's2').code, 1, 'companion: another session is still refused on the same fixture');
});

test('Claim_NoClaimYet_FreeAndWritten', () => {
  const dir = home([]);
  assert.ok(!fs.existsSync(path.join(dir, 'tasks', 'features', '123', 'feature-state.md')), 'no feature-state.md yet');
  const r = claim(dir, 's1');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^free$/m);
  assert.match(fs.readFileSync(claimFile(dir), 'utf8'), /^session: s1$/m);
  assert.match(fs.readFileSync(claimFile(dir), 'utf8'), /^claimed: \d{4}-\d\d-\d\dT/m);
});

test('Claim_TakeOver_WritesRegardless', () => {
  const dir = home([]);
  claimed(dir, 's1');
  fs.writeFileSync(path.join(featureDir(dir, '123'), 'progress.log'), logLine('123', '2026-11-04T09:59:00Z'));
  assert.equal(claim(dir, 's2').code, 1, 'companion: without --take-over it is busy');
  const r = claim(dir, 's2', '--take-over');
  assert.equal(r.code, 0, r.out);
  assert.match(fs.readFileSync(claimFile(dir), 'utf8'), /^session: s2$/m);
});

test('Claim_UnsubstitutedSessionId_Refused', () => {
  const dir = home([]);
  const r = claim(dir, '${CLAUDE_SESSION_ID}');
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /no session id: /);
  assert.ok(!fs.existsSync(claimFile(dir)), 'nothing was written');
  assert.equal(claim(dir, '').code, 2, 'an empty id is refused too');
  // Even when the claim on disk holds the same literal, it is never treated as a match.
  claimed(dir, '${CLAUDE_SESSION_ID}');
  fs.writeFileSync(path.join(featureDir(dir, '123'), 'progress.log'), logLine('123', '2026-11-04T09:59:00Z'));
  assert.equal(claim(dir, '${CLAUDE_SESSION_ID}').code, 2);
  assert.equal(claim(dir, 's9').code, 1, 'companion: a real id is refused as busy, so the literal was not the holder');
});

function twoLogs(dir, a, b) {
  const write = (fid, rows) => fs.writeFileSync(path.join(featureDir(dir, fid), 'progress.log'),
    rows.map(([ts, event, sid]) => logLine(fid, ts, event, sid)).join(''));
  write('123', a);
  write('124', b);
}

test('Together_StoriesOfTwoFeaturesInterleave_Ok', () => {
  const dir = home([]);
  twoLogs(dir,
    [['2026-11-04T10:00:00Z', 'story-started', '1'], ['2026-11-04T10:20:00Z', 'story-committed', '1']],
    [['2026-11-04T10:10:00Z', 'story-started', '5'], ['2026-11-04T10:30:00Z', 'story-committed', '5']]);
  const r = run(dir, 'together', '--feature', '123', '--with', '124');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^ok$/m);
  assert.doesNotMatch(r.out, /apart/);
  // The other orientation: the first Feature's start falls inside the second one's window.
  twoLogs(dir,
    [['2026-11-04T10:15:00Z', 'story-started', '1'], ['2026-11-04T10:40:00Z', 'story-committed', '1']],
    [['2026-11-04T10:00:00Z', 'story-started', '5'], ['2026-11-04T10:30:00Z', 'story-committed', '5']]);
  assert.match(run(dir, 'together', '--feature', '123', '--with', '124').out, /^ok$/m);
});

test('Together_OneAfterTheOther_Apart', () => {
  const dir = home([]);
  twoLogs(dir,
    [['2026-11-04T10:00:00Z', 'story-started', '1'], ['2026-11-04T10:20:00Z', 'story-committed', '1']],
    [['2026-11-04T10:30:00Z', 'story-started', '5'], ['2026-11-04T10:50:00Z', 'story-committed', '5']]);
  const r = run(dir, 'together', '--feature', '123', '--with', '124');
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /^apart: /m);
  assert.doesNotMatch(r.out, /^ok$/m);
  // Companion: the same logs moved to overlap are ok, so the command did read both files.
  twoLogs(dir,
    [['2026-11-04T10:00:00Z', 'story-started', '1'], ['2026-11-04T10:40:00Z', 'story-committed', '1']],
    [['2026-11-04T10:30:00Z', 'story-started', '5'], ['2026-11-04T10:50:00Z', 'story-committed', '5']]);
  assert.match(run(dir, 'together', '--feature', '123', '--with', '124').out, /^ok$/m);
});

// ── review fixes for #82 ─────────────────────────────────────────────────

const { cmdClaim } = require(SCRIPT);

function inProcess(fn) {
  const lines = [];
  const real = process.stdout.write;
  process.stdout.write = (s) => { lines.push(String(s)); return true; };
  try { return { code: fn(), out: lines.join('') }; } finally { process.stdout.write = real; }
}

test('Claim_ClaimAppearsBetweenReadAndWrite_SecondSessionGetsBusy', () => {
  assert.equal(typeof cmdClaim, 'function', 'cmdClaim is exported');
  const dir = home([]);
  featureDir(dir, '123');
  // s2 read "no claim"; before it writes, s1 claims the Feature.
  const hooks = { afterRead: () => fs.writeFileSync(claimFile(dir), 'session: s1\nclaimed: 2026-11-04T09:59:00Z\n') };
  const r = inProcess(() => cmdClaim(dir, { feature: '123', session: 's2', now: NOW }, hooks));
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /^busy 123: session s1/m);
  assert.match(fs.readFileSync(claimFile(dir), 'utf8'), /^session: s1$/m, 's1 still holds the claim');
  // Companion: with nothing in between, the same call takes the claim.
  const dir2 = home([]);
  const r2 = inProcess(() => cmdClaim(dir2, { feature: '123', session: 's2', now: NOW }, {}));
  assert.equal(r2.code, 0, r2.out);
  assert.match(fs.readFileSync(claimFile(dir2), 'utf8'), /^session: s2$/m);
});

test('Claim_TwoSessionsTakeOverTheSameStaleClaim_OnlyOneGetsFree', () => {
  const dir = home([]);
  claimed(dir, 's1'); // stale: claimed two hours ago, nothing since
  // s2 judged s1's claim stale; before s2 acts, s3 took it over.
  const hooks = { afterRead: () => fs.writeFileSync(claimFile(dir), 'session: s3\nclaimed: 2026-11-04T09:59:00Z\n') };
  const r = inProcess(() => cmdClaim(dir, { feature: '123', session: 's2', now: NOW }, hooks));
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /^busy 123: session s3/m);
  assert.doesNotMatch(r.out, /^free$/m);
  assert.match(fs.readFileSync(claimFile(dir), 'utf8'), /^session: s3$/m, 's3 still holds the claim');
  assert.deepEqual(fs.readdirSync(path.dirname(claimFile(dir))), ['claim.md'], 'no file left aside');
  // Companion: with nobody in between the take-over succeeds and leaves nothing aside.
  const dir2 = home([]);
  claimed(dir2, 's1');
  const r2 = inProcess(() => cmdClaim(dir2, { feature: '123', session: 's2', now: NOW }, {}));
  assert.equal(r2.code, 0, r2.out);
  assert.match(r2.out, /^took over 123 from session s1/m);
  assert.match(fs.readFileSync(claimFile(dir2), 'utf8'), /^session: s2$/m);
  assert.deepEqual(fs.readdirSync(path.dirname(claimFile(dir2))), ['claim.md']);
  // The claim vanishes between read and take-over (another session moved it away): busy or re-claimed, never both free.
  const dir3 = home([]);
  claimed(dir3, 's1');
  const gone = { afterRead: () => { fs.rmSync(claimFile(dir3)); fs.writeFileSync(claimFile(dir3), 'session: s4\nclaimed: 2026-11-04T09:59:00Z\n'); } };
  assert.equal(inProcess(() => cmdClaim(dir3, { feature: '123', session: 's2', now: NOW, 'take-over': 'true' }, gone)).code, 1, 'an explicit take-over also loses to a claim made since it read');
});

test('Claim_ReplaceFails_LeavesNoTempFile_AndRetriesOnEperm', () => {
  const dir = home([]);
  claimed(dir, 's1');
  const folder = path.dirname(claimFile(dir));
  const realRename = fs.renameSync;
  // The session's own claim is replaced in place; the rename always fails.
  fs.renameSync = () => { throw Object.assign(new Error('EPERM: operation not permitted'), { code: 'EPERM' }); };
  try {
    assert.throws(() => inProcess(() => cmdClaim(dir, { feature: '123', session: 's1', now: NOW })), /cannot replace the claim/);
  } finally {
    fs.renameSync = realRename;
  }
  assert.deepEqual(fs.readdirSync(folder), ['claim.md'], 'no .tmp file left behind');
  // Companion: an EPERM that goes away on the third try is retried and succeeds.
  let calls = 0;
  fs.renameSync = (a, b) => { calls++; if (calls < 3) throw Object.assign(new Error('EPERM'), { code: 'EPERM' }); return realRename(a, b); };
  try {
    assert.equal(inProcess(() => cmdClaim(dir, { feature: '123', session: 's1', now: NOW })).code, 0);
  } finally {
    fs.renameSync = realRename;
  }
  assert.equal(calls, 3, 'renamed on the third try');
  assert.deepEqual(fs.readdirSync(folder), ['claim.md']);
});

test('Claim_StaleTakeOver_IsAnnounced', () => {
  const dir = home([]);
  claimed(dir, 's1');
  fs.writeFileSync(path.join(featureDir(dir, '123'), 'progress.log'), logLine('123', '2026-11-04T09:20:00Z'));
  const r = claim(dir, 's2');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^took over 123 from session s1, idle 40m$/m);
  assert.match(r.out, /^free$/m);
  // Companions: the same session, a claim nobody held and an explicit --take-over say nothing of the kind.
  assert.doesNotMatch(claim(dir, 's2').out, /took over/, 'its own claim again');
  assert.doesNotMatch(claim(home([]), 's1').out, /took over/, 'no earlier holder');
  const dir3 = home([]);
  claimed(dir3, 's1');
  fs.writeFileSync(path.join(featureDir(dir3, '123'), 'progress.log'), logLine('123', '2026-11-04T09:59:00Z'));
  assert.doesNotMatch(claim(dir3, 's2', '--take-over').out, /took over/, 'the person chose it');
});

test('Claim_TestLockHeartbeat_KeepsTheFeatureActive', () => {
  const dir = home([]);
  claimed(dir, 's1');
  const beat = path.join(featureDir(dir, '123'), 'heartbeat');
  fs.writeFileSync(beat, '2026-11-04T09:50:00Z\n');
  const at = new Date('2026-11-04T09:50:00Z');
  fs.utimesSync(beat, at, at);
  const r = claim(dir, 's2');
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /^busy 123: session s1, last activity 10m ago \(test lock\)/m);
  // Companion: an old heartbeat does not hold the claim.
  const old = new Date('2026-11-04T09:00:00Z');
  fs.utimesSync(beat, old, old);
  assert.equal(claim(dir, 's2').code, 0, 'a 60-minute-old heartbeat is idle');
});

test('Claim_RunningStorysPhaseMd_KeepsTheFeatureActive', () => {
  const dir = home(AB);
  init(dir);
  assert.equal(run(dir, 'set', '--feature', '123', '--story', '201', 'status=running').code, 0);
  claimed(dir, 's1');
  const storyDir = path.join(dir, 'tasks', 'stories', '201');
  fs.mkdirSync(storyDir, { recursive: true });
  fs.writeFileSync(path.join(storyDir, 'phase.md'), 'schemaVersion: 1\nphase: coding\nrole: builder\nupdated: 2026-11-04T09:50:00Z\nskill: implement\ndetail: Step 2 build\n');
  const r = claim(dir, 's2');
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /^busy 123: session s1, last activity 10m ago \(Step 2 build\)/m);
  // Companion: once the story is no longer running its phase.md is not read.
  assert.equal(run(dir, 'set', '--feature', '123', '--story', '201', 'status=committed').code, 0);
  assert.equal(claim(dir, 's2').code, 0, 'a finished story\'s phase.md does not hold the claim');
});

test('Claim_ClaimedTimeIsTheLastResort', () => {
  const dir = home([]);
  fs.writeFileSync(path.join(featureDir(dir, '123'), 'claim.md'), 'session: s1\nclaimed: 2026-11-04T09:45:00Z\n');
  const r = claim(dir, 's2');
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /^busy 123: session s1, last activity 15m ago \(claimed\)/m);
  claimed(dir, 's1');
  assert.equal(claim(dir, 's2').code, 0, 'companion: claimed two hours ago and nothing since is free');
});

test('Together_StoryStillInFlight_CountsAsRunning', () => {
  const dir = home([]);
  twoLogs(dir,
    [['2026-11-04T10:00:00Z', 'story-started', '1']],
    [['2026-11-04T10:10:00Z', 'story-started', '5'], ['2026-11-04T10:30:00Z', 'story-committed', '5']]);
  const r = run(dir, 'together', '--feature', '123', '--with', '124');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^ok$/m);
  // Companion: an in-flight story that started after the other Feature's last story ended is apart.
  twoLogs(dir,
    [['2026-11-04T11:00:00Z', 'story-started', '1']],
    [['2026-11-04T10:10:00Z', 'story-started', '5'], ['2026-11-04T10:30:00Z', 'story-committed', '5']]);
  assert.match(run(dir, 'together', '--feature', '123', '--with', '124').out, /^apart: /m);
  // The latest commit counts, not the last line.
  twoLogs(dir,
    [['2026-11-04T10:00:00Z', 'story-started', '1'], ['2026-11-04T10:20:00Z', 'story-committed', '1']],
    [['2026-11-04T10:10:00Z', 'story-started', '5'], ['2026-11-04T10:50:00Z', 'story-committed', '5'], ['2026-11-04T10:05:00Z', 'step', '5']]);
  assert.match(run(dir, 'together', '--feature', '123', '--with', '124').out, /^ok$/m);
});
