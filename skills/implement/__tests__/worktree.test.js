// Tests for skills/implement/bin/worktree.js (F4 #45, #46), against real git repositories: the
// Feature and story worktrees, the merge that is tested before it is committed (ADR-0003), cleanup
// that is never forced, and the half-done merge a crash leaves behind.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCRIPT = path.join(__dirname, '..', 'bin', 'worktree.js');

function git(cwd, ...args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

function run(...args) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout + r.stderr };
}

// A home repo on main with one file, plus paths for the Feature and story worktrees beside it.
function repo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-'));
  const home = path.join(root, 'shop');
  fs.mkdirSync(home);
  git(home, 'init', '-q', '-b', 'main');
  git(home, 'config', 'user.email', 'test@example.com');
  git(home, 'config', 'user.name', 'Test');
  git(home, 'config', 'core.autocrlf', 'false');
  fs.writeFileSync(path.join(home, 'app.txt'), 'line 1\n');
  git(home, 'add', '.');
  git(home, 'commit', '-q', '-m', 'init');
  return { root, home, fwt: path.join(root, 'shop-f1'), swt: (s) => path.join(root, `shop-f1-s${s}`) };
}

function commitIn(cwd, file, content, msg) {
  fs.writeFileSync(path.join(cwd, file), content);
  git(cwd, 'add', '.');
  git(cwd, 'commit', '-q', '-m', msg);
}

const PASS = `"${process.execPath}" -e "process.exit(0)"`;
const FAIL = `"${process.execPath}" -e "console.log('1 test failed: orders'); process.exit(1)"`;

function featureWithStory(r, sid = '201', branch = 'story/201-a') {
  assert.equal(run('feature', '--home', r.home, '--path', r.fwt, '--branch', 'feature/1-x').code, 0);
  const s = run('story', '--home', r.home, '--path', r.swt(sid), '--branch', branch, '--from', 'feature/1-x');
  assert.equal(s.code, 0, s.out);
}

test('Feature_CreatesSiblingWorktreeOnANewBranchFromMain', () => {
  const r = repo();
  const out = run('feature', '--home', r.home, '--path', r.fwt, '--branch', 'feature/1-x');
  assert.equal(out.code, 0, out.out);
  assert.equal(git(r.fwt, 'branch', '--show-current'), 'feature/1-x');
  assert.equal(git(r.home, 'branch', '--show-current'), 'main', 'the home folder stays on main');
});

test('Feature_AlreadyThereOnItsBranch_IsReused', () => {
  const r = repo();
  run('feature', '--home', r.home, '--path', r.fwt, '--branch', 'feature/1-x');
  const again = run('feature', '--home', r.home, '--path', r.fwt, '--branch', 'feature/1-x');
  assert.equal(again.code, 0, again.out);
  assert.match(again.out, /reusing/);
});

test('Story_StartsFromTheFeatureBranchWithEarlierMergesIn', () => {
  const r = repo();
  featureWithStory(r);
  commitIn(r.swt('201'), 'orders.txt', 'orders table\n', 'A');
  const m = run('merge', '--feature-worktree', r.fwt, '--branch', 'story/201-a', '--expect', 'feature/1-x',
    '--test', PASS, '--message', 'Merge story #201');
  assert.equal(m.code, 0, m.out);
  const s = run('story', '--home', r.home, '--path', r.swt('202'), '--branch', 'story/202-b', '--from', 'feature/1-x');
  assert.equal(s.code, 0, s.out);
  assert.equal(fs.readFileSync(path.join(r.swt('202'), 'orders.txt'), 'utf8'), 'orders table\n', 'B sees A\'s change');
});

test('Merge_GreenTests_CommitsOneMergeCommitAndPrintsItsSha', () => {
  const r = repo();
  featureWithStory(r);
  commitIn(r.swt('201'), 'orders.txt', 'x\n', 'A');
  const m = run('merge', '--feature-worktree', r.fwt, '--branch', 'story/201-a', '--expect', 'feature/1-x',
    '--test', PASS, '--message', 'Merge story #201');
  assert.equal(m.code, 0, m.out);
  const sha = git(r.fwt, 'rev-parse', 'HEAD');
  assert.match(m.out, new RegExp(`^merged ${sha}$`, 'm'));
  assert.equal(git(r.fwt, 'log', '-1', '--format=%P').split(' ').length, 2, 'a real merge commit (--no-ff)');
  assert.equal(git(r.fwt, 'log', '-1', '--format=%s'), 'Merge story #201');
});

test('Merge_RedTests_AbortsAndLeavesTheFeatureBranchUnchanged', () => {
  const r = repo();
  featureWithStory(r);
  commitIn(r.swt('201'), 'orders.txt', 'x\n', 'A');
  const before = git(r.fwt, 'rev-parse', 'HEAD');
  const m = run('merge', '--feature-worktree', r.fwt, '--branch', 'story/201-a', '--expect', 'feature/1-x',
    '--test', FAIL, '--message', 'Merge story #201');
  assert.equal(m.code, 4, m.out);
  assert.match(m.out, /^tests-failed: /m);
  assert.match(m.out, /1 test failed: orders/);
  assert.equal(git(r.fwt, 'rev-parse', 'HEAD'), before, 'same commit as before the merge');
  assert.equal(git(r.fwt, 'status', '--porcelain'), '', 'nothing left half-merged');
  assert.equal(fs.existsSync(path.join(r.fwt, '.git')) && fs.existsSync(path.join(r.home, '.git', 'worktrees', 'shop-f1', 'MERGE_HEAD')), false);
});

test('Merge_Conflict_AbortsNamingTheFiles', () => {
  const r = repo();
  featureWithStory(r);
  commitIn(r.swt('201'), 'app.txt', 'story line\n', 'A');
  commitIn(r.fwt, 'app.txt', 'feature line\n', 'meanwhile on the feature branch');
  const before = git(r.fwt, 'rev-parse', 'HEAD');
  const m = run('merge', '--feature-worktree', r.fwt, '--branch', 'story/201-a', '--expect', 'feature/1-x',
    '--test', PASS, '--message', 'Merge story #201');
  assert.equal(m.code, 3, m.out);
  assert.match(m.out, /^conflict: app\.txt$/m);
  assert.equal(git(r.fwt, 'rev-parse', 'HEAD'), before);
  assert.equal(git(r.fwt, 'status', '--porcelain'), '');
});

test('Merge_WrongBranchInTheFeatureWorktree_Stops', () => {
  const r = repo();
  featureWithStory(r);
  git(r.fwt, 'checkout', '-q', '-b', 'someone-else');
  const m = run('merge', '--feature-worktree', r.fwt, '--branch', 'story/201-a', '--expect', 'feature/1-x',
    '--test', PASS, '--message', 'm');
  assert.equal(m.code, 5, m.out);
  assert.match(m.out, /^branch-moved: .*expected feature\/1-x, found someone-else/m);
});

test('Merge_HalfDoneMergeFromACrash_IsAbortedAndRedone', () => {
  const r = repo();
  featureWithStory(r);
  commitIn(r.swt('201'), 'orders.txt', 'x\n', 'A');
  git(r.fwt, 'merge', '--no-ff', '--no-commit', 'story/201-a'); // the session died here
  const m = run('merge', '--feature-worktree', r.fwt, '--branch', 'story/201-a', '--expect', 'feature/1-x',
    '--test', PASS, '--message', 'Merge story #201');
  assert.equal(m.code, 0, m.out);
  assert.match(m.out, /^aborted a half-done merge/m);
  assert.match(m.out, /^merged [0-9a-f]{40}$/m);
});

test('Remove_DeletesWorktreeAndMergedBranchWithoutForce', () => {
  const r = repo();
  featureWithStory(r);
  commitIn(r.swt('201'), 'orders.txt', 'x\n', 'A');
  run('merge', '--feature-worktree', r.fwt, '--branch', 'story/201-a', '--expect', 'feature/1-x', '--test', PASS, '--message', 'm');
  const rm = run('remove', '--home', r.home, '--feature-worktree', r.fwt, '--path', r.swt('201'), '--branch', 'story/201-a');
  assert.equal(rm.code, 0, rm.out);
  assert.equal(fs.existsSync(r.swt('201')), false);
  assert.equal(git(r.home, 'branch', '--list', 'story/201-a'), '');
});

test('Remove_UncommittedWork_IsRefusedNeverForced', () => {
  const r = repo();
  featureWithStory(r);
  fs.writeFileSync(path.join(r.swt('201'), 'wip.txt'), 'not committed\n');
  const rm = run('remove', '--home', r.home, '--feature-worktree', r.fwt, '--path', r.swt('201'), '--branch', 'story/201-a');
  assert.equal(rm.code, 1, rm.out);
  assert.ok(fs.existsSync(path.join(r.swt('201'), 'wip.txt')), 'the work is still there');
});

test('Remove_UnmergedBranch_IsKept', () => {
  const r = repo();
  featureWithStory(r);
  commitIn(r.swt('201'), 'orders.txt', 'x\n', 'A');
  const rm = run('remove', '--home', r.home, '--feature-worktree', r.fwt, '--path', r.swt('201'), '--branch', 'story/201-a');
  assert.equal(rm.code, 1, rm.out);
  assert.notEqual(git(r.home, 'branch', '--list', 'story/201-a'), '', 'git branch -d refuses an unmerged branch');
});

test('Story_PathIsAPlainFolder_RefusedWithAClearReason', () => {
  const r = repo();
  run('feature', '--home', r.home, '--path', r.fwt, '--branch', 'feature/1-x');
  fs.mkdirSync(path.join(r.swt('201'), 'lib'), { recursive: true });
  const s = run('story', '--home', r.home, '--path', r.swt('201'), '--branch', 'story/201-a', '--from', 'feature/1-x');
  assert.equal(s.code, 1, s.out);
  assert.match(s.out, /exists and is not a git worktree/);
  assert.doesNotMatch(s.out, /branch-moved/);
});

test('CheckBranch_ReportsAMovedBranch', () => {
  const r = repo();
  featureWithStory(r);
  assert.equal(run('check-branch', '--path', r.swt('201'), '--expect', 'story/201-a').code, 0);
  git(r.swt('201'), 'checkout', '-q', '-b', 'other');
  const c = run('check-branch', '--path', r.swt('201'), '--expect', 'story/201-a');
  assert.equal(c.code, 5, c.out);
});

// ── Prove it's scratch copy (F6 #60) ─────────────────────────────────

test('Scratch_DetachedCopyAtTheFeatureBranch_NoBranchCreated', () => {
  const r = repo();
  run('feature', '--home', r.home, '--path', r.fwt, '--branch', 'feature/1-x');
  const branches = git(r.home, 'branch', '--list');
  const p = path.join(r.root, 'shop-f1-prove');
  const s = run('scratch', '--home', r.home, '--path', p, '--from', 'feature/1-x');
  assert.equal(s.code, 0, s.out);
  assert.equal(git(p, 'branch', '--show-current'), '', 'detached');
  assert.equal(git(r.home, 'branch', '--list'), branches, 'no branch was added');
  assert.equal(run('scratch', '--home', r.home, '--path', p, '--from', 'feature/1-x').code, 1, 'an existing path is refused');
});

test('RemoveScratch_ABrokenLineNotPutBack_IsRefused', () => {
  const r = repo();
  const p = path.join(r.root, 'shop-prove');
  run('scratch', '--home', r.home, '--path', p, '--from', 'main');
  fs.writeFileSync(path.join(p, 'app.txt'), 'line 1 broken\n');
  const refused = run('remove-scratch', '--home', r.home, '--path', p);
  assert.equal(refused.code, 1, refused.out);
  assert.match(refused.out, /not-clean: [\s\S]*app\.txt/);
  assert.ok(fs.existsSync(p), 'never forced');
  fs.writeFileSync(path.join(p, 'app.txt'), 'line 1\n');
  const ok = run('remove-scratch', '--home', r.home, '--path', p);
  assert.equal(ok.code, 0, ok.out);
  assert.ok(!fs.existsSync(p));
});

test('RemoveScratch_AWorktreeOnABranch_IsNeverRemoved', () => {
  const r = repo();
  run('feature', '--home', r.home, '--path', r.fwt, '--branch', 'feature/1-x');
  const c = run('remove-scratch', '--home', r.home, '--path', r.fwt);
  assert.equal(c.code, 1, c.out);
  assert.match(c.out, /not a scratch copy/);
  assert.ok(fs.existsSync(r.fwt));
});
