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
  assert.match(f.out, /x\.lock is held: another git command is running, or one stopped and left it; check that no other git process is running/);
  assert.ok(fs.existsSync(lock), 'the run never deletes a lock itself');
  assert.ok(!fs.existsSync(r.fwt), 'no worktree was made');
  // Companion: a real failure that is not a lock is not retried or reworded.
  const plain = repo();
  fs.mkdirSync(path.join(plain.fwt, 'lib'), { recursive: true });
  const p = run('feature', '--home', plain.home, '--path', plain.fwt, '--branch', 'feature/1-x');
  assert.equal(p.code, 1, p.out);
  assert.doesNotMatch(p.out, /is held/);
});

// A4: `worktree.js git -- <args...>` runs one git command in the current folder with the same lock retry,
// so the story commit, the stuck-story restore and the PR push survive another session's lock file.
function runIn(cwd, ...args) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', cwd });
  return { code: r.status, out: r.stdout + r.stderr };
}

test('Git_IndexLockHeldBriefly_RetriedAndTheCommandSucceeds', async () => {
  const r = repo();
  fs.writeFileSync(path.join(r.home, 'new.txt'), 'x\n');
  const lock = path.join(r.home, '.git', 'index.lock');
  fs.writeFileSync(lock, '');
  const child = spawn(process.execPath, [SCRIPT, 'git', '--', 'add', '--', 'new.txt'], { cwd: r.home });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { out += d; });
  const done = new Promise((resolve) => child.on('close', resolve));
  // Timing is the criterion: the other session's lock is held for a second, then released.
  setTimeout(() => fs.rmSync(lock, { force: true }), 1000);
  const code = await done;
  assert.equal(code, 0, out);
  assert.match(git(r.home, 'status', '--porcelain'), /^A {2}new\.txt$/m, 'the add really happened');
});

test('Git_LockNeverReleased_NamesItAndNeverDeletesIt_AndAPlainFailureIsNotRetried', () => {
  const r = repo();
  fs.writeFileSync(path.join(r.home, 'new.txt'), 'x\n');
  const lock = path.join(r.home, '.git', 'index.lock');
  fs.writeFileSync(lock, '');
  const held = runIn(r.home, 'git', '--', 'add', '--', 'new.txt');
  assert.equal(held.code, 1, held.out);
  assert.match(held.out, /index\.lock is held/);
  assert.match(held.out, /check that no other git process is running/);
  assert.doesNotMatch(held.out, /remove it/, 'never tells the person to delete a lock');
  assert.ok(fs.existsSync(lock), 'the lock was never deleted');
  fs.rmSync(lock);
  // Companion: a failure that is not a lock comes back at once (no 2 s waits) with git's own message.
  const t0 = Date.now();
  const plain = runIn(r.home, 'git', '--', 'restore', '--worktree', '--', 'no-such-file');
  assert.equal(plain.code, 1, plain.out);
  assert.match(plain.out, /no-such-file/);
  assert.doesNotMatch(plain.out, /is held/);
  assert.ok(Date.now() - t0 < 1900, 'not retried');
  // And no git arguments is a usage error.
  assert.equal(runIn(r.home, 'git', '--').code, 2);
});

// A non-lock failure that merely contains the words "cannot lock ref" (a branch `feature` already
// exists, so `feature/x` cannot be made) is not a lock held by another session: not retried.
test('Feature_CannotLockRefThatIsNotALockFile_IsNotRetried', () => {
  const r = repo();
  git(r.home, 'branch', 'feature');
  const t0 = Date.now();
  const f = run('feature', '--home', r.home, '--path', r.fwt, '--branch', 'feature/x');
  assert.equal(f.code, 1, f.out);
  assert.match(f.out, /cannot lock ref/, 'git really did say cannot lock ref');
  assert.doesNotMatch(f.out, /is held/);
  assert.ok(Date.now() - t0 < 1900, 'not retried');
});

// A line the remote printed (prefixed `remote:`) is never this machine's lock file.
test('Git_RemoteSaysLockFileExists_IsNotRetried', () => {
  const r = repo();
  const bare = path.join(r.root, 'origin.git');
  git(r.root, 'init', '-q', '--bare', '-b', 'main', bare);
  const hook = path.join(bare, 'hooks', 'pre-receive');
  fs.writeFileSync(hook, "#!/bin/sh\necho \"Unable to create '/srv/x.lock': File exists.\" >&2\nexit 1\n");
  fs.chmodSync(hook, 0o755);
  git(r.home, 'remote', 'add', 'origin', bare);
  git(r.home, 'checkout', '-q', '-b', 'feature/y');
  const t0 = Date.now();
  const p = runIn(r.home, 'git', '--', 'push', '-u', 'origin', 'feature/y');
  assert.equal(p.code, 1, p.out);
  assert.match(p.out, /remote: Unable to create/, 'the remote line really came through');
  assert.doesNotMatch(p.out, /is held/);
  assert.ok(Date.now() - t0 < 1900, 'not retried');
});

// ── `git --` runs only the run's own fixed shapes (round 2, item 1a) ─────────

test('Git_EachAllowedShape_Runs', () => {
  const r = repo();
  const bare = path.join(r.root, 'origin.git');
  git(r.root, 'init', '-q', '--bare', '-b', 'main', bare);
  git(r.home, 'remote', 'add', 'origin', bare);
  fs.writeFileSync(path.join(r.home, 'new.txt'), 'x\n');
  // add -N -- <paths>: intent to add
  const n = runIn(r.home, 'git', '--', 'add', '-N', '--', 'new.txt');
  assert.equal(n.code, 0, n.out);
  assert.match(git(r.home, 'status', '--porcelain'), /^ ?A new\.txt$/m); // the helper trims the leading space of the first line
  // add -- <paths>, with a -C prefix from another folder
  const a = runIn(r.root, 'git', '--', '-C', r.home, 'add', '--', 'new.txt');
  assert.equal(a.code, 0, a.out);
  assert.match(git(r.home, 'status', '--porcelain'), /^A {2}new\.txt$/m);
  // restore --staged --worktree --source=HEAD -- <paths> takes the new file out of both
  const re = runIn(r.home, 'git', '--', 'restore', '--staged', '--worktree', '--source=HEAD', '--', 'new.txt');
  assert.equal(re.code, 0, re.out);
  assert.equal(fs.existsSync(path.join(r.home, 'new.txt')), false, 'the new file is gone from the tree');
  // restore --worktree -- <paths> puts a changed tracked file back
  fs.writeFileSync(path.join(r.home, 'app.txt'), 'changed\n');
  const rw = runIn(r.home, 'git', '--', 'restore', '--worktree', '--', 'app.txt');
  assert.equal(rw.code, 0, rw.out);
  assert.equal(fs.readFileSync(path.join(r.home, 'app.txt'), 'utf8'), 'line 1\n');
  // commit -F <file>
  fs.writeFileSync(path.join(r.home, 'c.txt'), 'c\n');
  git(r.home, 'add', '--', 'c.txt');
  const msg = path.join(r.root, 'msg.txt');
  fs.writeFileSync(msg, 'feat: c\n');
  const c = runIn(r.home, 'git', '--', '-C', r.home, 'commit', '-F', msg);
  assert.equal(c.code, 0, c.out);
  assert.equal(git(r.home, 'log', '-1', '--format=%s'), 'feat: c');
  // push -u origin <branch>
  git(r.home, 'checkout', '-q', '-b', 'feature/z');
  const p = runIn(r.home, 'git', '--', 'push', '-u', 'origin', 'feature/z');
  assert.equal(p.code, 0, p.out);
  assert.match(git(r.root, '--git-dir', bare, 'branch', '--list'), /feature\/z/);
});

test('Git_RefusedFlagsAndSubcommands_Exit2_AndGitNeverRuns', () => {
  const r = repo();
  const bare = path.join(r.root, 'origin.git');
  git(r.root, 'init', '-q', '--bare', '-b', 'main', bare);
  git(r.home, 'remote', 'add', 'origin', bare);
  fs.writeFileSync(path.join(r.home, 'app.txt'), 'dirty\n');
  const refused = [
    ['push', '--force', 'origin', 'feature/x'],
    ['push', '-f', 'origin', 'feature/x'],
    ['push', '-u', 'origin', '+feature/x'],
    ['push', 'origin', '+main:main'],
    ['push', '--mirror', 'origin'],
    ['push', '--delete', 'origin', 'feature/x'],
    ['push', '-u', 'origin', 'feature/x', '--force'],
    ['push', '--upload-pack=evil', '-u', 'origin', 'feature/x'],
    ['push', '--receive-pack=evil', '-u', 'origin', 'feature/x'],
    ['push', '--exec=evil', '-u', 'origin', 'feature/x'],
    ['-c', 'core.hooksPath=/x', 'add', '--', 'app.txt'],
    ['-C', r.home, '-c', 'core.hooksPath=/x', 'add', '--', 'app.txt'],
    ['checkout', '--', 'app.txt'],
    ['reset', '--hard'],
    ['config', 'user.name', 'x'],
    ['commit', '-m', 'x'],
    ['commit', '-F', 'f', '--amend'],
    ['add', '.'],
    ['restore', '--source=other', '--', 'app.txt'],
    ['push', '-u', 'origin', '--bad'],
  ];
  for (const args of refused) {
    const s = runIn(r.home, 'git', '--', ...args);
    assert.equal(s.code, 2, `${args.join(' ')}: ${s.out}`);
    assert.match(s.out, /refused/, `${args.join(' ')} is named as refused`);
  }
  // Companions: git never ran (the dirty file was not restored, nothing was pushed or configured).
  assert.equal(fs.readFileSync(path.join(r.home, 'app.txt'), 'utf8'), 'dirty\n');
  assert.equal(git(r.root, '--git-dir', bare, 'branch', '--list'), '');
  assert.equal(spawnSync('git', ['config', '--get', 'user.name'], { cwd: r.home, encoding: 'utf8' }).stdout.trim(), 'Test');
  // The refusal names the offending thing.
  assert.match(runIn(r.home, 'git', '--', 'push', '--force', 'origin', 'x').out, /--force/);
  assert.match(runIn(r.home, 'git', '--', 'reset', '--hard').out, /reset/);
});

// Round 4, item 3: add and restore take only named files; push takes only the run's own branches.
test('Git_AddAndRestoreWithABroadPath_RefusedAndGitNeverRuns', () => {
  const r = repo();
  fs.mkdirSync(path.join(r.home, 'sub'));
  fs.writeFileSync(path.join(r.home, 'sub', 'in.txt'), 'x\n');
  fs.writeFileSync(path.join(r.home, 'app.txt'), 'dirty\n');
  const broad = ['.', '..', ':/', ':(top)app.txt', ':!app.txt', '*', 'a?.txt', 'f[ab].txt', 'sub', './sub', 'sub/'];
  for (const sub of [['add'], ['add', '-N'], ['restore', '--worktree'], ['restore', '--staged', '--worktree', '--source=HEAD']]) {
    for (const p of broad) {
      const s = runIn(r.home, 'git', '--', ...sub, '--', p);
      assert.equal(s.code, 2, `${sub.join(' ')} -- ${p}: ${s.out}`);
      assert.match(s.out, /refused/, `${sub.join(' ')} -- ${p}`);
    }
    // a named file beside a broad one is still refused
    assert.equal(runIn(r.home, 'git', '--', ...sub, '--', 'app.txt', '.').code, 2);
  }
  // With -C the directory is looked up in that folder, not in the caller's.
  assert.equal(runIn(r.root, 'git', '--', '-C', r.home, 'add', '--', 'sub').code, 2);
  // Companions: git never ran.
  assert.equal(fs.readFileSync(path.join(r.home, 'app.txt'), 'utf8'), 'dirty\n');
  assert.doesNotMatch(git(r.home, 'status', '--porcelain'), /^A/m);
});

test('Git_AddAndRestoreWithNamedFiles_StillRun', () => {
  const r = repo();
  fs.mkdirSync(path.join(r.home, 'sub'));
  fs.writeFileSync(path.join(r.home, 'sub', 'in.txt'), 'x\n');
  fs.writeFileSync(path.join(r.home, 'app.txt'), 'dirty\n');
  const a = runIn(r.home, 'git', '--', 'add', '--', 'sub/in.txt', 'app.txt');
  assert.equal(a.code, 0, a.out);
  assert.match(git(r.home, 'status', '--porcelain'), /A {2}sub\/in\.txt/);
  const re = runIn(r.root, 'git', '--', '-C', r.home, 'restore', '--staged', '--worktree', '--source=HEAD', '--', 'sub/in.txt', 'app.txt');
  assert.equal(re.code, 0, re.out);
  assert.equal(fs.readFileSync(path.join(r.home, 'app.txt'), 'utf8'), 'line 1\n');
});

test('Git_PushOfABranchThatIsNotTheRunsOwn_RefusedAndNothingPushed', () => {
  const r = repo();
  const bare = path.join(r.root, 'origin.git');
  git(r.root, 'init', '-q', '--bare', '-b', 'main', bare);
  git(r.home, 'remote', 'add', 'origin', bare);
  for (const b of ['main', 'master', 'HEAD', 'refs/heads/main', 'refs/tags/v1', 'develop', 'release/1']) {
    const s = runIn(r.home, 'git', '--', 'push', '-u', 'origin', b);
    assert.equal(s.code, 2, `${b}: ${s.out}`);
    assert.match(s.out, /refused/, b);
  }
  assert.equal(git(r.root, '--git-dir', bare, 'branch', '--list'), '', 'nothing was pushed');
  git(r.home, 'checkout', '-q', '-b', 'implement/42-x');
  assert.equal(runIn(r.home, 'git', '--', 'push', '-u', 'origin', 'implement/42-x').code, 0, 'the run\'s own implement/ branch is pushed');
  assert.match(git(r.root, '--git-dir', bare, 'branch', '--list'), /implement\/42-x/);
});

// Round 5, item 2: push takes only the branch that is checked out in the folder git runs in.
function withOrigin(r) {
  const bare = path.join(r.root, 'origin.git');
  git(r.root, 'init', '-q', '--bare', '-b', 'main', bare);
  git(r.home, 'remote', 'add', 'origin', bare);
  return bare;
}

test('Git_PushOfTheCheckedOutFixBranch_Runs', () => {
  const r = repo();
  const bare = withOrigin(r);
  git(r.home, 'checkout', '-q', '-b', 'fix/x');
  const p = runIn(r.home, 'git', '--', 'push', '-u', 'origin', 'fix/x');
  assert.equal(p.code, 0, p.out);
  assert.match(git(r.root, '--git-dir', bare, 'branch', '--list'), /fix\/x/);
  // with -C, "checked out" is read in that folder, not in the caller's
  git(r.home, 'checkout', '-q', '-b', 'chore/y');
  const c = runIn(r.root, 'git', '--', '-C', r.home, 'push', '-u', 'origin', 'chore/y');
  assert.equal(c.code, 0, c.out);
});

test('Git_PushOfABranchThatIsNotTheCheckedOutOne_Refused', () => {
  const r = repo();
  const bare = withOrigin(r);
  git(r.home, 'branch', 'fix/other');
  git(r.home, 'checkout', '-q', '-b', 'fix/x');
  for (const b of ['fix/other', 'feature/x', 'fix/x2']) {
    const s = runIn(r.home, 'git', '--', 'push', '-u', 'origin', b);
    assert.equal(s.code, 2, `${b}: ${s.out}`);
    assert.match(s.out, /refused/, b);
  }
  assert.equal(git(r.root, '--git-dir', bare, 'branch', '--list'), '', 'nothing was pushed');
});

test('Git_PushOfMainOrMasterEvenWhenCheckedOut_Refused', () => {
  const r = repo();
  const bare = withOrigin(r);
  assert.equal(runIn(r.home, 'git', '--', 'push', '-u', 'origin', 'main').code, 2, 'main is checked out here');
  git(r.home, 'checkout', '-q', '-b', 'master');
  const s = runIn(r.home, 'git', '--', 'push', '-u', 'origin', 'master');
  assert.equal(s.code, 2, s.out);
  assert.match(s.out, /refused/);
  assert.equal(git(r.root, '--git-dir', bare, 'branch', '--list'), '', 'nothing was pushed');
});

// The push line the SKILL's Rework mode tells the run to type must be one the wrapper accepts for a
// head branch that is not feature/ or implement/ (pins the two together).
test('Git_ReworkPushLineInTheSkill_AcceptedForAFixHead', () => {
  const skill = fs.readFileSync(path.join(__dirname, '..', 'SKILL.md'), 'utf8');
  const section = skill.match(/## Rework mode[\s\S]*?(?=\n## )/)[0];
  const line = section.split('\n').find((l) => /worktree\.js" git -- push -u origin /.test(l));
  assert.ok(line, 'the Rework mode section has a push line through worktree.js');
  const m = line.match(/git -- push -u origin "<[^>]*>"/);
  assert.ok(m, `the push line names the branch as a quoted placeholder: ${line}`);
  const r = repo();
  const bare = withOrigin(r);
  git(r.home, 'checkout', '-q', '-b', 'fix/x');
  const p = runIn(r.home, 'git', '--', 'push', '-u', 'origin', 'fix/x'); // "<head branch>" := fix/x
  assert.equal(p.code, 0, p.out);
  assert.match(git(r.root, '--git-dir', bare, 'branch', '--list'), /fix\/x/);
});

// Round 5, item 3: a tracked folder moved away from disk is still a folder.
test('Git_AddAndRestoreOfATrackedFolderMissingFromDisk_Refused', () => {
  const r = repo();
  fs.mkdirSync(path.join(r.home, 'sub'));
  fs.writeFileSync(path.join(r.home, 'sub', 'in.txt'), 'x\n');
  git(r.home, 'add', '.');
  git(r.home, 'commit', '-q', '-m', 'sub');
  fs.renameSync(path.join(r.home, 'sub'), path.join(r.root, 'moved-away'));
  for (const sub of [['add'], ['restore', '--worktree'], ['restore', '--staged', '--worktree', '--source=HEAD']]) {
    for (const p of ['sub', 'sub/']) {
      const s = runIn(r.home, 'git', '--', ...sub, '--', p);
      assert.equal(s.code, 2, `${sub.join(' ')} -- ${p}: ${s.out}`);
      assert.match(s.out, /refused/);
    }
  }
  // companion: a deleted tracked FILE is still restorable
  fs.rmSync(path.join(r.home, 'app.txt'));
  assert.equal(runIn(r.home, 'git', '--', 'restore', '--worktree', '--', 'app.txt').code, 0);
  assert.equal(fs.existsSync(path.join(r.home, 'app.txt')), true);
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
