// Tests for skills/implement/bin/test-lock.js (F73 #82, AC4): under `verify-lock: global`, builds, tests
// and Observe commands of several sessions queue on one lock directory. `run --lock <dir> -- <cmd...>`.
//
// The owner file is written by the script as `pid: <n>`, `host: <name>`, `platform: <os>`, `start: <iso>`;
// the tests that plant one use that shape.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const SCRIPT = path.join(__dirname, '..', 'bin', 'test-lock.js');

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tlock-'));
}

function runLock(lock, cmd, opts = {}) {
  const r = spawnSync(process.execPath, [SCRIPT, 'run', '--lock', lock, ...(opts.before || []), '--', ...cmd],
    { encoding: 'utf8', env: { ...process.env, ...(opts.env || {}) }, timeout: opts.timeout });
  return { code: r.status, out: String(r.stdout) + String(r.stderr) };
}

function runLockAsync(lock, cmd, opts = {}) {
  const child = spawn(process.execPath, [SCRIPT, 'run', '--lock', lock, ...(opts.before || []), '--', ...cmd],
    { encoding: 'utf8', env: { ...process.env, ...(opts.env || {}) } });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { out += d; });
  const done = new Promise((resolve) => child.on('close', (code) => resolve({ code, out })));
  return { child, done };
}

// A command that appends "start" and "end" stamps to a file, holding for 600 ms between them.
// The hold is the criterion here: it makes an overlap visible if the lock fails.
const STAMP = "const fs=require('fs');const f=process.argv[1];const t=process.argv[2];"
  + "fs.appendFileSync(f,'start '+t+'\\n');Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,600);"
  + "fs.appendFileSync(f,'end '+t+'\\n');";

test('Lock_SecondRunWaitsForTheFirst', async () => {
  const dir = tmp();
  const lock = path.join(dir, '.verify.lock');
  const stamps = path.join(dir, 'stamps.txt');
  const a = runLockAsync(lock, [process.execPath, '-e', STAMP, stamps, 'A']);
  const b = runLockAsync(lock, [process.execPath, '-e', STAMP, stamps, 'B']);
  const [ra, rb] = await Promise.all([a.done, b.done]);
  assert.equal(ra.code, 0, ra.out);
  assert.equal(rb.code, 0, rb.out);
  const lines = fs.readFileSync(stamps, 'utf8').trim().split('\n').map((l) => l.split(' '));
  assert.equal(lines.length, 4, 'both commands ran');
  assert.deepEqual(lines.map((l) => l[0]), ['start', 'end', 'start', 'end'], 'one finished before the other started');
  assert.equal(lines[0][1], lines[1][1], 'the one that started is the one that ended');
  assert.equal(lines[2][1], lines[3][1]);
  assert.notEqual(lines[0][1], lines[2][1], 'two different runs');
  assert.ok(!fs.existsSync(lock), 'the lock is gone at the end');
});

test('Lock_ReleasedOnFailure_ExitCodePassedThrough', () => {
  const dir = tmp();
  const lock = path.join(dir, '.verify.lock');
  const r = runLock(lock, [process.execPath, '-e', 'process.exit(7)']);
  assert.equal(r.code, 7, r.out);
  assert.ok(!fs.existsSync(lock), 'the lock is released after a failing command');
  const ok = runLock(lock, [process.execPath, '-e', 'process.exit(0)']);
  assert.equal(ok.code, 0, ok.out);
  assert.ok(!fs.existsSync(lock), 'and after a passing one');
});

test('Lock_OwnerProcessGone_IsBroken', async () => {
  const dir = tmp();
  const lock = path.join(dir, '.verify.lock');
  const marker = path.join(dir, 'ran.txt');
  const writeMarker = "require('fs').writeFileSync(process.argv[1],'ran')";
  // A pid that has exited: a short-lived child of this test.
  const gone = spawnSync(process.execPath, ['-e', ''], { encoding: 'utf8' }).pid;
  fs.mkdirSync(lock);
  fs.writeFileSync(path.join(lock, 'owner'), `pid: ${gone}\nhost: ${os.hostname()}\nplatform: ${process.platform}\nstart: 2026-11-04T09:00:00Z\n`);
  const r = runLock(lock, [process.execPath, '-e', writeMarker, marker]);
  assert.equal(r.code, 0, r.out);
  assert.equal(fs.existsSync(marker), true, 'the command ran after the dead owner\'s lock was broken');
  assert.ok(!fs.existsSync(lock));

  // Companion: an owner that is alive is never broken into, however long it holds.
  const lock2 = path.join(dir, '.verify2.lock');
  fs.mkdirSync(lock2);
  fs.writeFileSync(path.join(lock2, 'owner'), `pid: ${process.pid}\nhost: ${os.hostname()}\nplatform: ${process.platform}\nstart: 2026-11-04T09:00:00Z\n`);
  const marker2 = path.join(dir, 'ran2.txt');
  const w = runLockAsync(lock2, [process.execPath, '-e', writeMarker, marker2]);
  // Timing is the criterion: give a wrong implementation time to break the lock.
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const stillWaiting = w.child.exitCode === null;
  w.child.kill();
  await w.done;
  assert.equal(stillWaiting, true, 'the second run is still waiting for the live owner');
  assert.equal(fs.existsSync(marker2), false, 'its command never ran');
  assert.ok(fs.existsSync(lock2), 'the live owner\'s lock was not touched');
});

const lockModule = require(SCRIPT);

// A .cmd shim on PATH, as `npm` and `npx` are on Windows. It records its arguments as JSON.
function plantShim(dir) {
  const bin = path.join(dir, 'shimbin');
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'rec.js'), "require('fs').writeFileSync(process.env.RECFILE, JSON.stringify(process.argv.slice(2)))");
  fs.writeFileSync(path.join(bin, 'recshim.cmd'), `@"${process.execPath}" "${path.join(bin, 'rec.js')}" %*\r\n`);
  return bin;
}

test('Lock_WindowsCmdShim_RunsWithArgumentsIntact', { skip: process.platform !== 'win32' }, () => {
  const dir = tmp();
  const bin = plantShim(dir);
  const rec = path.join(dir, 'args.json');
  const args = ['a b', 'x&y', 'p|q', '50%', "it's", 'a;echo pwned', '(c)^d', '<in>', 'back\\slash\\'];
  const r = runLock(path.join(dir, '.verify.lock'), ['recshim', ...args],
    { env: { PATH: bin + path.delimiter + process.env.PATH, RECFILE: rec } });
  assert.equal(r.code, 0, r.out);
  assert.ok(fs.existsSync(rec), 'the shim ran');
  assert.deepEqual(JSON.parse(fs.readFileSync(rec, 'utf8')), args, 'every argument arrived as one argument, unchanged');
  assert.doesNotMatch(r.out, /^pwned/m, 'no argument ran as shell text');
});

test('Lock_WindowsCmdShim_ArgumentWithQuoteIsRefusedAndNothingRuns', { skip: process.platform !== 'win32' }, () => {
  const dir = tmp();
  const bin = plantShim(dir);
  const rec = path.join(dir, 'args.json');
  const env = { PATH: bin + path.delimiter + process.env.PATH, RECFILE: rec };
  for (const bad of ['"&echo pwned&"', 'x" & echo pwned & "']) {
    const r = runLock(path.join(dir, '.verify.lock'), ['recshim', bad], { env });
    assert.equal(r.code, 2, `${bad}: ${r.out}`);
    assert.match(r.out, /double quote/);
    assert.doesNotMatch(r.out, /^pwned/m, 'nothing ran as shell text');
    assert.ok(!fs.existsSync(rec), 'the shim never ran');
  }
  // Companion: without the quote the same shim runs.
  assert.equal(runLock(path.join(dir, '.verify.lock'), ['recshim', 'fine'], { env }).code, 0);
  assert.ok(fs.existsSync(rec), 'the shim runs for a plain argument');
});

test('Lock_CommandArgumentsAreNeverShellText', () => {
  const dir = tmp();
  const lock = path.join(dir, '.verify.lock');
  const out = path.join(dir, 'arg.txt');
  const r = runLock(lock, [process.execPath, '-e', "require('fs').writeFileSync(process.argv[1], process.argv[2])", out, 'a;echo pwned']);
  assert.equal(r.code, 0, r.out);
  assert.equal(fs.readFileSync(out, 'utf8'), 'a;echo pwned', 'the argument reached the command as one argument');
  assert.doesNotMatch(r.out, /^pwned/m, 'no shell ran the second command');
});

const ownerOf = (pid, platform = process.platform) => `pid: ${pid}\nhost: ${os.hostname()}\nplatform: ${platform}\nstart: 2026-11-04T09:00:00Z\n`;

function plantLock(lock, ownerText) {
  fs.mkdirSync(lock);
  if (ownerText !== null) fs.writeFileSync(path.join(lock, 'owner'), ownerText);
}

test('Lock_BreakingAStaleLock_NeverRemovesAFreshLockTakenInTheMeantime', () => {
  assert.equal(typeof lockModule.judgeStale, 'function', 'judgeStale is exported');
  assert.equal(typeof lockModule.breakJudged, 'function', 'breakJudged is exported');
  const dir = tmp();
  const lock = path.join(dir, '.verify.lock');
  const gone = spawnSync(process.execPath, ['-e', ''], { encoding: 'utf8' }).pid;
  // A judged the lock stale (owner `gone`); before A removes it, B broke it and C took a fresh one.
  plantLock(lock, ownerOf(gone));
  const judged = lockModule.judgeStale(lock);
  assert.ok(judged, 'the dead owner\'s lock is judged stale');
  fs.rmSync(lock, { recursive: true });
  plantLock(lock, ownerOf(process.pid));
  lockModule.breakJudged(lock, judged);
  assert.ok(fs.existsSync(path.join(lock, 'owner')), 'the live owner\'s lock is still there');
  assert.match(fs.readFileSync(path.join(lock, 'owner'), 'utf8'), new RegExp(`^pid: ${process.pid}$`, 'm'));
  assert.deepEqual(fs.readdirSync(dir), ['.verify.lock'], 'nothing is left aside');
  // Companion: the lock that was judged is the one removed.
  fs.rmSync(lock, { recursive: true });
  plantLock(lock, ownerOf(gone));
  lockModule.breakJudged(lock, lockModule.judgeStale(lock));
  assert.ok(!fs.existsSync(lock), 'the judged lock is removed');
  assert.deepEqual(fs.readdirSync(dir), [], 'and nothing is left aside');
});

test('Lock_OwnerWriteFails_NoOwnerlessLockIsLeft', () => {
  assert.equal(typeof lockModule.tryTake, 'function', 'tryTake is exported');
  const dir = tmp();
  const lock = path.join(dir, '.verify.lock');
  const real = fs.writeFileSync;
  fs.writeFileSync = (f, ...rest) => { if (String(f).endsWith('owner')) throw new Error('disk full'); return real(f, ...rest); };
  try {
    assert.throws(() => lockModule.tryTake(lock), /disk full/);
  } finally {
    fs.writeFileSync = real;
  }
  assert.ok(!fs.existsSync(lock), 'the lock without an owner was removed');
  assert.equal(lockModule.tryTake(lock), true, 'companion: with the write working the lock is taken');
  assert.ok(fs.existsSync(path.join(lock, 'owner')));
});

test('Lock_TakenLock_NeverExistsWithoutItsOwner', () => {
  const dir = tmp();
  const lock = path.join(dir, '.verify.lock');
  const violations = [];
  const probe = (what) => { if (fs.existsSync(lock) && !fs.existsSync(path.join(lock, 'owner'))) violations.push(what); };
  const names = ['mkdirSync', 'writeFileSync', 'renameSync'];
  const real = Object.fromEntries(names.map((n) => [n, fs[n]]));
  for (const n of names) fs[n] = (...a) => { probe(`before ${n}`); const v = real[n](...a); probe(`after ${n}`); return v; };
  try {
    assert.equal(lockModule.tryTake(lock), true);
  } finally {
    for (const n of names) fs[n] = real[n];
  }
  assert.deepEqual(violations, [], 'the lock was never visible without an owner');
  assert.ok(fs.existsSync(path.join(lock, 'owner')), 'the taken lock has its owner');
  assert.deepEqual(fs.readdirSync(dir), ['.verify.lock'], 'no temp dir left');
  // Companion: a failed take (lock held) leaves the holder's lock alone and no temp dir.
  assert.equal(lockModule.tryTake(lock), false);
  assert.deepEqual(fs.readdirSync(dir), ['.verify.lock'], 'a failed take leaves no temp dir');
  assert.ok(fs.existsSync(path.join(lock, 'owner')));
});

test('Lock_FailedRename_LeavesNoTempDir', () => {
  const dir = tmp();
  const lock = path.join(dir, '.verify.lock');
  const real = fs.renameSync;
  fs.renameSync = () => { throw Object.assign(new Error('boom'), { code: 'EIO' }); };
  try {
    assert.throws(() => lockModule.tryTake(lock), /boom/);
  } finally {
    fs.renameSync = real;
  }
  assert.deepEqual(fs.readdirSync(dir), [], 'neither a lock nor a temp dir is left');
});

test('Lock_KillTree_WindowsUsesTaskkillWithArgvArray', () => {
  assert.equal(typeof lockModule.killTreeCommand, 'function', 'killTreeCommand is exported');
  assert.deepEqual(lockModule.killTreeCommand(4321, 'win32'), { file: 'taskkill', args: ['/pid', '4321', '/T', '/F'] });
  assert.equal(lockModule.killTreeCommand(4321, 'linux'), null, 'elsewhere the plain kill stays');
});

test('Lock_CommandKilledBySignal_IsAClearNonZeroFailure', () => {
  assert.equal(typeof lockModule.describeExit, 'function', 'describeExit is exported');
  const killed = lockModule.describeExit(null, 'SIGTERM');
  assert.notEqual(killed.code, 0);
  assert.match(killed.message, /killed by signal SIGTERM/);
  assert.deepEqual(lockModule.describeExit(3, null), { code: 3, message: null }, 'a normal exit code passes through');
  assert.equal(lockModule.describeExit(0, null).code, 0);
});

test('Lock_WaitTimeout_ExitsThreeNamingTheOwner', () => {
  const dir = tmp();
  const lock = path.join(dir, '.verify.lock');
  plantLock(lock, ownerOf(process.pid));
  const r = runLock(lock, [process.execPath, '-e', ''], { env: { TEST_LOCK_TIMEOUT_MS: '700' }, timeout: 8000 });
  assert.equal(r.code, 3, r.out);
  assert.match(r.out, /lock held: .*\.verify\.lock by pid: \d+, host: /);
  assert.ok(fs.existsSync(lock), 'the live owner\'s lock was not touched');
});

test('Lock_OwnerlessLock_BrokenOnlyAfterTheGrace', () => {
  const dir = tmp();
  const ago = (ms) => new Date(Date.now() - ms);
  // Older than the grace: broken, the command runs.
  const old = path.join(dir, 'old.lock');
  plantLock(old, null);
  fs.utimesSync(old, ago(300000), ago(300000));
  const r = runLock(old, [process.execPath, '-e', ''], { env: { TEST_LOCK_GRACE_MS: '1000', TEST_LOCK_TIMEOUT_MS: '1500' }, timeout: 8000 });
  assert.equal(r.code, 0, r.out);
  // Younger than the grace: waited on until the timeout.
  const young = path.join(dir, 'young.lock');
  plantLock(young, null);
  const r2 = runLock(young, [process.execPath, '-e', ''], { env: { TEST_LOCK_GRACE_MS: '60000', TEST_LOCK_TIMEOUT_MS: '800' }, timeout: 8000 });
  assert.equal(r2.code, 3, r2.out);
  assert.ok(fs.existsSync(young), 'the young ownerless lock was not broken');
});

test('Lock_WindowsCmdShim_TrailingBackslashRunsArriveExactly', { skip: process.platform !== 'win32' }, () => {
  // S1: a run of backslashes at the end of an argument (and before the closing quote) is doubled whole.
  const dir = tmp();
  const bin = plantShim(dir);
  const rec = path.join(dir, 'args.json');
  const args = ['q\\\\', 'r\\\\\\', 'next', 'one\\', 'plain'];
  const r = runLock(path.join(dir, '.verify.lock'), ['recshim', ...args],
    { env: { PATH: bin + path.delimiter + process.env.PATH, RECFILE: rec } });
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(JSON.parse(fs.readFileSync(rec, 'utf8')), args, 'two and three trailing backslashes arrive exactly as sent');
});

test('Lock_LockHoldingOtherFiles_IsNeverBrokenAsOwnerless', () => {
  // S2: an old directory with no owner file is broken only when empty (or holding only `owner`).
  const dir = tmp();
  const ago = (ms) => new Date(Date.now() - ms);
  const folder = path.join(dir, 'realfolder');
  fs.mkdirSync(folder);
  fs.writeFileSync(path.join(folder, 'keep.txt'), 'somebody\'s file');
  fs.utimesSync(folder, ago(300000), ago(300000));
  const env = { TEST_LOCK_GRACE_MS: '1000', TEST_LOCK_TIMEOUT_MS: '1500' };
  const r = runLock(folder, [process.execPath, '-e', ''], { env, timeout: 8000 });
  assert.equal(r.code, 3, r.out);
  assert.match(r.out, /lock held: .*realfolder/, 'it names the folder it will not break');
  assert.ok(fs.existsSync(path.join(folder, 'keep.txt')), 'the file inside was left alone');
  // Companion: an equally old EMPTY directory is still broken (the crash-leftover case).
  const empty = path.join(dir, 'empty.lock');
  plantLock(empty, null);
  fs.utimesSync(empty, ago(300000), ago(300000));
  assert.equal(runLock(empty, [process.execPath, '-e', ''], { env, timeout: 8000 }).code, 0);
});

test('Lock_OwnerOnAnotherPlatformSameHost_IsNeverJudgedDead', () => {
  // S3: WSL and Windows share a hostname but not a pid namespace.
  assert.equal(typeof lockModule.judgeStale, 'function');
  const dir = tmp();
  const gone = spawnSync(process.execPath, ['-e', ''], { encoding: 'utf8' }).pid;
  const other = process.platform === 'win32' ? 'linux' : 'win32';
  const lock = path.join(dir, '.verify.lock');
  plantLock(lock, ownerOf(gone, other));
  assert.equal(lockModule.judgeStale(lock), null, 'a dead pid on another platform proves nothing');
  fs.rmSync(lock, { recursive: true });
  plantLock(lock, ownerOf(gone));
  assert.ok(lockModule.judgeStale(lock), 'companion: same host and platform, dead pid: stale');
  // The owner file the script writes carries the platform.
  const fresh = path.join(dir, 'fresh.lock');
  assert.equal(lockModule.tryTake(fresh), true);
  assert.match(fs.readFileSync(path.join(fresh, 'owner'), 'utf8'), new RegExp(`^platform: ${process.platform}$`, 'm'));
});

test('Lock_Heartbeat_TouchedWhileWaitingAndWhileTheCommandRuns', async () => {
  const dir = tmp();
  const lock = path.join(dir, '.verify.lock');
  const beat = path.join(dir, 'features', '123', 'heartbeat');
  const env = { TEST_LOCK_BEAT_MS: '200' };
  // While the command runs: at its end the heartbeat is newer than the command's own start.
  const probe = "const fs=require('fs');const t=Date.now();Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,1200);"
    + "fs.writeFileSync(process.argv[1], String(Date.now()-fs.statSync(process.argv[2]).mtimeMs))";
  const age = path.join(dir, 'age.txt');
  const r = runLock(lock, [process.execPath, '-e', probe, age, beat], { env, before: ['--heartbeat', beat], timeout: 15000 });
  assert.equal(r.code, 0, r.out);
  assert.ok(Number(fs.readFileSync(age, 'utf8')) < 700, 'the heartbeat was refreshed while the command ran');
  // While waiting: the heartbeat exists and is fresh although the command never ran.
  const lock2 = path.join(dir, '.verify2.lock');
  plantLock(lock2, ownerOf(process.pid));
  fs.rmSync(path.dirname(beat), { recursive: true });
  const w = runLockAsync(lock2, [process.execPath, '-e', ''], { env, before: ['--heartbeat', beat] });
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const exists = fs.existsSync(beat);
  const fresh = exists && Date.now() - fs.statSync(beat).mtimeMs < 700;
  w.child.kill();
  await w.done;
  assert.ok(exists, 'a waiting run writes the heartbeat');
  assert.ok(fresh, 'and keeps it fresh');
});
