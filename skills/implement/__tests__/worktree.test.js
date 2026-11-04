// Tests for skills/implement/bin/worktree.js (F4 #45, #46; F72 #79), against real git repositories:
// the one Feature worktree, the branch check, and the Prove-it scratch copy. There are no story
// worktrees, story merges or story removals any more (F72 #79).

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

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

// A home repo on main with one file, plus the path for the Feature worktree beside it.
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

function feature(r) {
  const f = run('feature', '--home', r.home, '--path', r.fwt, '--branch', 'feature/1-x');
  assert.equal(f.code, 0, f.out);
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

test('Usage_StoryAndMergeAreGone', () => {
  // AC3 of #79. Each call carries every option the old command needed, so the only reason for exit 2
  // is that the command no longer exists (a missing option would also exit 2 and prove nothing).
  const r = repo();
  feature(r);
  const story = run('story', '--home', r.home, '--path', r.swt('201'), '--branch', 'story/201-a', '--from', 'feature/1-x');
  assert.equal(story.code, 2, `story: ${story.out}`);
  assert.ok(!fs.existsSync(r.swt('201')), 'no story worktree was created');
  const merge = run('merge', '--feature-worktree', r.fwt, '--branch', 'story/201-a', '--expect', 'feature/1-x',
    '--test', 'node -e "process.exit(0)"', '--message', 'Merge story #201');
  assert.equal(merge.code, 2, `merge: ${merge.out}`);
  const remove = run('remove', '--home', r.home, '--feature-worktree', r.fwt, '--path', r.swt('201'), '--branch', 'story/201-a');
  assert.equal(remove.code, 2, `remove: ${remove.out}`);
  // Companions: the kept commands still work, and the usage line no longer names the retired ones.
  const bogus = run('bogus');
  assert.equal(bogus.code, 2, bogus.out);
  for (const kept of ['feature', 'check-branch', 'scratch', 'remove-scratch']) assert.match(bogus.out, new RegExp(kept), `${kept} is listed`);
  assert.doesNotMatch(bogus.out, /\bstory\b|\bmerge\b/, 'the retired commands are not');
});

test('Feature_PathIsAPlainFolder_RefusedWithAClearReason', () => {
  const r = repo();
  fs.mkdirSync(path.join(r.fwt, 'lib'), { recursive: true });
  const s = run('feature', '--home', r.home, '--path', r.fwt, '--branch', 'feature/1-x');
  assert.equal(s.code, 1, s.out);
  assert.match(s.out, /exists and is not a git worktree/);
  assert.doesNotMatch(s.out, /branch-moved/);
});

// ── git lock files held by another session (F73 #82, AC6) ─────────────

function plantRefLock(r) {
  const lockDir = path.join(r.home, '.git', 'refs', 'heads', 'feature');
  fs.mkdirSync(lockDir, { recursive: true });
  const lock = path.join(lockDir, 'x.lock');
  fs.writeFileSync(lock, '');
  return lock;
}

test('Feature_RefLockHeldBriefly_RetriedAndCreated', async () => {
  const r = repo();
  const lock = plantRefLock(r);
  const child = spawn(process.execPath, [SCRIPT, 'feature', '--home', r.home, '--path', r.fwt, '--branch', 'feature/x'], { encoding: 'utf8' });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { out += d; });
  const done = new Promise((resolve) => child.on('close', resolve));
  // Timing is the criterion: the other session's lock is held for a second, then released.
  setTimeout(() => fs.rmSync(lock, { force: true }), 1000);
  const code = await done;
  assert.equal(code, 0, out);
  assert.match(out, /created /);
  assert.equal(git(r.fwt, 'branch', '--show-current'), 'feature/x');
});

test('Feature_LockNeverReleased_NamesTheLock', () => {
  const r = repo();
  const lock = plantRefLock(r);
  const f = run('feature', '--home', r.home, '--path', r.fwt, '--branch', 'feature/x');
  assert.equal(f.code, 1, f.out);
  assert.match(f.out, /x\.lock is held: another git command is running, or one stopped and left it; check, then remove it/);
  assert.ok(fs.existsSync(lock), 'the run never deletes a lock itself');
  assert.ok(!fs.existsSync(r.fwt), 'no worktree was made');
  // Companion: a real failure that is not a lock is not retried or reworded.
  const plain = repo();
  fs.mkdirSync(path.join(plain.fwt, 'lib'), { recursive: true });
  const p = run('feature', '--home', plain.home, '--path', plain.fwt, '--branch', 'feature/1-x');
  assert.equal(p.code, 1, p.out);
  assert.doesNotMatch(p.out, /is held/);
});

test('CheckBranch_ReportsAMovedBranch', () => {
  const r = repo();
  feature(r);
  assert.equal(run('check-branch', '--path', r.fwt, '--expect', 'feature/1-x').code, 0);
  git(r.fwt, 'checkout', '-q', '-b', 'other');
  const c = run('check-branch', '--path', r.fwt, '--expect', 'feature/1-x');
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
