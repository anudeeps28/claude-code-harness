#!/usr/bin/env node
// test-lock.js — one lock for the builds, tests and Observe commands of several sessions (F73 #82).
// Under `verify-lock: global`, Features built side by side share a port, a database, Docker or a global
// cache, so their test commands take turns.
//
// Usage: node test-lock.js run --lock <dir> [--heartbeat <file>] -- <command> [args...]
//   Takes the lock with mkdir (atomic) and writes <dir>/owner ("pid:", "host:", "start:" lines). A lock
//   whose owner pid is gone on this host is broken, and only the exact lock that was judged dead is ever
//   removed. Waits at most 60 minutes, then exits 3 with "lock held: <dir> by <owner>". There is no age
//   limit while the owner lives, so a long suite is never broken into. The command runs with its
//   arguments as an array, never as shell text. On Windows a `.cmd`/`.bat` shim (npm, npx, pnpm, yarn)
//   is found through PATH and PATHEXT and run through cmd.exe with every argument escaped for it; an
//   argument holding `"` or a line break is refused there, because the shim's `%*` parses it again. The
//   command is ONE command: a compound `a && b` is not wrapped, so wrap each command on its own.
//   The lock is removed when the command ends (also on SIGINT/SIGTERM) and the exit code is the
//   command's; a command killed by a signal is reported as such, with a non-zero code.
//   --heartbeat <file>: written every minute while waiting for the lock and while the command runs, so
//   `feature-state.js claim` sees a session that waits or runs a long suite as alive.
//
// Environment (tests and tuning): TEST_LOCK_TIMEOUT_MS (wait, default 60 min), TEST_LOCK_GRACE_MS
// (how old a lock with no owner file must be before it is broken, default 20 min), TEST_LOCK_BEAT_MS
// (heartbeat interval, default 60 s).
//
// Exit codes: the command's; 2 usage error; 3 the lock was not free within the wait.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { setInterval, clearInterval } = require('node:timers');

const POLL_MS = 200;
const envMs = (name, dflt) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : dflt;
};
// A lock dir with no owner file is the story-executor's shell lock (same <state>/.verify.lock under
// `global`, until #83 deletes that agent) or one left by a crash; the executor breaks its own at 20 minutes.
const maxWaitMs = () => envMs('TEST_LOCK_TIMEOUT_MS', 60 * 60 * 1000);
const noOwnerGraceMs = () => envMs('TEST_LOCK_GRACE_MS', 20 * 60 * 1000);
const beatMs = () => envMs('TEST_LOCK_BEAT_MS', 60 * 1000);

function die(code, message) {
  process.stderr.write(message + '\n');
  process.exit(code);
}

function readOwner(lock) {
  try {
    const text = fs.readFileSync(path.join(lock, 'owner'), 'utf8');
    const get = (k) => (text.match(new RegExp(`^${k}: (.*)$`, 'm')) || [])[1];
    return { pid: Number(get('pid')), host: get('host'), start: get('start'), text: text.trim().replace(/\s*\n\s*/g, ', ') };
  } catch { return null; }
}

function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

// What a waiter judged: null when the lock is not stale, else the owner it saw (null text for a lock
// that never got an owner file). breakJudged removes only a lock that still matches this.
function judgeStale(lock) {
  const owner = readOwner(lock);
  if (!owner) {
    try { return Date.now() - fs.statSync(lock).mtimeMs > noOwnerGraceMs() ? { owner: null } : null; } catch { return null; }
  }
  return owner.host === os.hostname() && !pidAlive(owner.pid) ? { owner: owner.text } : null;
}

// Move the lock aside (of several waiters only one rename succeeds), look at whose it is, and remove it
// only when it is the one that was judged. Another owner's lock is put back if its path is still free;
// if it is not, it is left aside and the caller retries.
// Known residual race, accepted: a live lock moved aside here while a third session takes the freed path.
// It needs a crashed owner and three concurrent waiters; if it happens, two commands run at once.
function breakJudged(lock, judged) {
  const aside = `${lock}.dead-${process.pid}-${Date.now()}`;
  try { fs.renameSync(lock, aside); } catch { return 'gone'; }
  const now = readOwner(aside);
  const same = judged.owner === null ? now === null : now !== null && now.text === judged.owner;
  if (same) {
    fs.rmSync(aside, { recursive: true, force: true });
    return 'broken';
  }
  try {
    if (!fs.existsSync(lock)) { fs.renameSync(aside, lock); return 'restored'; }
  } catch { /* fall through */ }
  return 'kept';
}

// The lock is built next to its path with its owner inside, then renamed into place: the rename fails
// while the lock exists (a non-empty directory), so a lock never exists without its owner and a waiter
// can never judge a half-made lock ownerless.
function tryTake(lock) {
  // On POSIX a rename can replace an EMPTY directory (the executor's shell lock just after its mkdir).
  // This check narrows that window but does not close it; it goes when #83 retires the executor.
  if (fs.existsSync(lock)) return false;
  const tmp = `${lock}.${process.pid}.tmp`;
  fs.rmSync(tmp, { recursive: true, force: true });
  try {
    fs.mkdirSync(tmp);
    fs.writeFileSync(path.join(tmp, 'owner'), `pid: ${process.pid}\nhost: ${os.hostname()}\nstart: ${new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')}\n`);
    fs.renameSync(tmp, lock);
  } catch (e) {
    fs.rmSync(tmp, { recursive: true, force: true });
    if (fs.existsSync(lock)) return false; // another session got there first
    throw e;
  }
  return true;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function acquire(lock) {
  const deadline = Date.now() + maxWaitMs();
  for (;;) {
    if (tryTake(lock)) return;
    const judged = judgeStale(lock);
    if (judged) {
      breakJudged(lock, judged);
      continue;
    }
    if (Date.now() >= deadline) {
      const owner = readOwner(lock);
      die(3, `lock held: ${lock} by ${owner ? owner.text : 'an unknown owner'}`);
    }
    await sleep(POLL_MS);
  }
}

// ── running the command ──────────────────────────────────────────────

// The Windows file for a command: PATH (current folder first, as cmd.exe does) and PATHEXT.
function resolveOnWindows(command) {
  const exts = (process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean);
  const hasDir = /[\\/]/.test(command);
  const dirs = hasDir ? [''] : [process.cwd(), ...(process.env.PATH || '').split(path.delimiter).filter(Boolean)];
  const names = path.extname(command) ? [command] : [];
  names.push(...exts.map((e) => command + e));
  for (const dir of dirs) {
    for (const name of names) {
      const file = hasDir ? path.resolve(name) : path.join(dir, name);
      try { if (fs.statSync(file).isFile()) return file; } catch { /* next */ }
    }
  }
  return null;
}

// The cross-spawn rules for cmd.exe: an argument is quoted for the program that reads it, then every
// cmd metacharacter, the quotes included, is caret-escaped so cmd.exe never treats any of it as syntax.
const CMD_META = /([()\][%!^"`<>&|;, *?])/g;
const escapeCmdCommand = (s) => s.replace(CMD_META, '^$1');
function escapeCmdArgument(arg) {
  let a = `${arg}`;
  a = a.replace(/(?=(\\+?)?)\1"/g, '$1$1\\"');
  a = a.replace(/(?=(\\+?)?)\1$/, '$1$1');
  return `"${a}"`.replace(CMD_META, '^$1');
}

// { file, args, options } for spawn(). Arguments are never joined into shell text, except for a
// .cmd/.bat shim on Windows, where cmd.exe is unavoidable and every piece is escaped for it.
function planSpawn(cmd, platform = process.platform) {
  if (platform !== 'win32') return { file: cmd[0], args: cmd.slice(1), options: {} };
  const found = resolveOnWindows(cmd[0]);
  if (found && /\.(cmd|bat)$/i.test(found)) {
    if (cmd.some((a) => /[\r\n\0]/.test(a))) throw new Error('an argument contains a line break, which cmd.exe cannot take as data');
    // A .cmd shim's %* re-parses its arguments, so a double quote can end the quoting and let `&` run as shell text.
    if (cmd.slice(1).some((a) => a.includes('"'))) throw new Error('an argument contains a double quote, which a .cmd shim would re-parse as shell text');
    const line = [escapeCmdCommand(found), ...cmd.slice(1).map(escapeCmdArgument)].join(' ');
    return { file: process.env.ComSpec || 'cmd.exe', args: ['/d', '/s', '/c', `"${line}"`], options: { windowsVerbatimArguments: true } };
  }
  return { file: found || cmd[0], args: cmd.slice(1), options: {} };
}

// The exit code to report, and a message when the command did not exit by itself.
function describeExit(status, signal) {
  if (status !== null && status !== undefined) return { code: status, message: null };
  const n = signal ? os.constants.signals[signal] : 0;
  return { code: n ? 128 + n : 1, message: `command killed by signal ${signal || 'unknown'}` };
}

// On Windows `kill()` ends only cmd.exe, not the npm -> node tree below it: kill the tree with taskkill.
// null elsewhere, where the plain kill is used.
function killTreeCommand(pid, platform = process.platform) {
  return platform === 'win32' ? { file: 'taskkill', args: ['/pid', String(pid), '/T', '/F'] } : null;
}

function killChild(child) {
  const k = child.pid ? killTreeCommand(child.pid) : null;
  if (k) {
    try { spawnSync(k.file, k.args, { stdio: 'ignore' }); return; } catch { /* fall back to the plain kill */ }
  }
  child.kill();
}

function runCommand(cmd, onChild) {
  return new Promise((resolve) => {
    let plan;
    try { plan = planSpawn(cmd); } catch (e) { process.stderr.write(`cannot run ${cmd[0]}: ${e.message}\n`); resolve(2); return; }
    const child = spawn(plan.file, plan.args, { stdio: 'inherit', ...plan.options });
    onChild(child);
    child.on('error', (e) => { process.stderr.write(`cannot run ${cmd[0]}: ${e.message}\n`); resolve(1); });
    child.on('close', (status, signal) => {
      const r = describeExit(status, signal);
      if (r.message) process.stderr.write(`${r.message}\n`);
      resolve(r.code);
    });
  });
}

async function main() {
  const argv = process.argv.slice(2);
  const dash = argv.indexOf('--');
  const head = dash === -1 ? argv : argv.slice(0, dash);
  const cmd = dash === -1 ? [] : argv.slice(dash + 1);
  const opt = (k) => { const i = head.indexOf(k); return i === -1 ? undefined : head[i + 1]; };
  const lock = opt('--lock');
  const heartbeat = opt('--heartbeat');
  if (head[0] !== 'run' || !lock || cmd.length === 0) die(2, 'usage: test-lock.js run --lock <dir> [--heartbeat <file>] -- <command> [args...]');

  const beat = () => {
    if (!heartbeat) return;
    try {
      fs.mkdirSync(path.dirname(path.resolve(heartbeat)), { recursive: true });
      fs.writeFileSync(heartbeat, new Date().toISOString().replace(/\.\d{3}Z$/, 'Z') + '\n');
    } catch { /* a heartbeat that cannot be written must not stop a test run */ }
  };
  beat();
  const timer = setInterval(beat, beatMs());

  fs.mkdirSync(path.dirname(path.resolve(lock)), { recursive: true });
  await acquire(lock);
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    fs.rmSync(lock, { recursive: true, force: true });
  };
  let running = null;
  // The command runs as an async child, so these handlers do run while it does: stop it, release, exit.
  // A hard kill of this process (SIGKILL, power loss) cannot run them; the lock is then broken by the
  // next waiter, because its owner pid is gone.
  process.on('SIGINT', () => { if (running) killChild(running); release(); process.exit(130); });
  process.on('SIGTERM', () => { if (running) killChild(running); release(); process.exit(143); });
  let code = 1;
  try {
    code = await runCommand(cmd, (c) => { running = c; });
  } finally {
    release();
    clearInterval(timer);
  }
  process.exit(code);
}

if (require.main === module) main();

module.exports = { tryTake, judgeStale, breakJudged, describeExit, killTreeCommand };
