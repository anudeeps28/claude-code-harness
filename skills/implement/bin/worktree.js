#!/usr/bin/env node
// worktree.js — the git side of a Feature run (F4 #45, #46; F72 #79). Only the orchestrator runs
// it. Nothing here is ever forced: no --force, no -D, no reset, no push. Stories are built one after
// another on the Feature branch, so there is no story worktree, story merge or story removal.
//
// Usage:
//   feature --home <dir> --path <p> --branch <b> [--base main]
//       Feature worktree: a sibling folder on a new branch from the base, so home stays on main.
//       Already there on that branch (a resumed run): reused.
//   check-branch --path <p> --expect <b>
//   scratch --home <dir> --path <p> --from <ref>
//       Prove it's scratch copy: a detached worktree at <ref> (no branch). Refuses an existing path.
//   remove-scratch --home <dir> --path <p>
//       Removes it only when it is detached and clean: a broken line not put back is refused (exit 1).
//
// Output and exit codes:
//   0 ok
//   1 a git command refused (message printed)
//   2 usage error
//   5 "branch-moved: ..." (contradiction: the run stops)

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const BRANCH_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;

// Another session's git command may hold a lock file for a moment (F73 #82): a lock-file failure is
// retried 3 times, 2 seconds apart. Still locked: say which lock; this script never deletes one.
const LOCK_MESSAGE = /\.lock': File exists|Unable to create '[^']*\.lock'|cannot lock ref/;
const RETRIES = 3;
const RETRY_WAIT_MS = 2000;

function git(cwd, args) {
  let r;
  for (let attempt = 0; ; attempt++) {
    r = spawnSync('git', args, { cwd, encoding: 'utf8' });
    if (r.status === 0 || !LOCK_MESSAGE.test(r.stderr || '')) break;
    if (attempt === RETRIES) {
      const named = (r.stderr || '').match(/Unable to create '([^']*\.lock)'/);
      die(1, `${named ? named[1] : 'a git lock file'} is held: another git command is running, or one stopped and left it; check, then remove it`);
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, RETRY_WAIT_MS);
  }
  return { code: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
}

function out(line) { process.stdout.write(line + '\n'); }
function die(code, message) {
  if (message) process.stderr.write(message + '\n');
  process.exit(code);
}
function must(r, what) {
  if (r.code !== 0) die(1, `${what} failed: ${r.err || r.out}`);
  return r;
}

function currentBranch(p) { return git(p, ['branch', '--show-current']).out; }

function branchMoved(p, expect) {
  const found = currentBranch(p);
  if (found === expect) return false;
  out(`branch-moved: ${p}: expected ${expect}, found ${found || '(detached)'}. Another session may be using this folder; the run stops.`);
  return true;
}

// True when `p` is itself the top of a git worktree, not merely a folder (perhaps inside another repo).
function isWorktreeRoot(p) {
  const top = git(p, ['rev-parse', '--show-toplevel']);
  if (top.code !== 0) return false;
  const norm = (x) => { const r = fs.realpathSync.native(path.resolve(x)); return process.platform === 'win32' ? r.toLowerCase() : r; };
  try { return norm(top.out) === norm(p); } catch { return false; }
}

// A path that already exists is reused only when it is a worktree on the expected branch (a resumed
// run). Anything else is refused, never overwritten.
function existing(p, branch) {
  if (!isWorktreeRoot(p)) die(1, `${p} exists and is not a git worktree; move it away (nothing was changed), then run again`);
  if (currentBranch(p) !== branch) die(5, `branch-moved: ${p} exists but is not on ${branch}`);
  out(`reusing ${p} on ${branch}`);
  return 0;
}

function cmdFeature(o) {
  if (fs.existsSync(o.path)) return existing(o.path, o.branch);
  must(git(o.home, ['worktree', 'add', o.path, '-b', o.branch, o.base || 'main']), 'git worktree add');
  out(`created ${o.path} on ${o.branch}`);
  return 0;
}

// Prove it's scratch copy (F6 #60): a detached worktree at the Feature branch's commit, so a broken
// line or a tool's output never touches the Feature worktree and no branch is created.
function cmdScratch(o) {
  if (fs.existsSync(o.path)) die(1, `${o.path} already exists; remove it with remove-scratch first (nothing was changed)`);
  must(git(o.home, ['worktree', 'add', '--detach', o.path, o.from]), 'git worktree add --detach');
  out(`created scratch ${o.path} at ${git(o.path, ['rev-parse', 'HEAD']).out}`);
  return 0;
}

// Removed only when it is clean, which is the check that every broken line was put back. Output a
// tool made is committed on the detached HEAD first (never pushed, no branch: git collects it later).
function cmdRemoveScratch(o) {
  if (!isWorktreeRoot(o.path)) die(1, `${o.path} is not a git worktree; nothing was changed`);
  if (currentBranch(o.path) !== '') die(1, `${o.path} is on a branch, so it is not a scratch copy; nothing was changed`);
  const dirty = git(o.path, ['status', '--porcelain']).out;
  if (dirty) {
    out('not-clean: the scratch copy still has changes; put each broken line back (or commit tool output there) first:');
    for (const l of dirty.split('\n')) out(`  ${l}`);
    return 1;
  }
  must(git(o.home, ['worktree', 'remove', o.path]), 'git worktree remove');
  out(`removed scratch ${o.path}`);
  return 0;
}

const NEEDS = {
  feature: ['home', 'path', 'branch'],
  'check-branch': ['path', 'expect'],
  scratch: ['home', 'path', 'from'],
  'remove-scratch': ['home', 'path'],
};

function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (!NEEDS[command]) die(2, 'usage: worktree.js feature|check-branch|scratch|remove-scratch ... (see the header of this file)');
  const o = {};
  for (let i = 0; i < rest.length; i += 2) {
    if (!rest[i].startsWith('--') || rest[i + 1] === undefined) die(2, `bad argument: ${rest[i]}`);
    o[rest[i].slice(2)] = rest[i + 1];
  }
  for (const k of NEEDS[command]) if (!o[k]) die(2, `--${k} is required for ${command}`);
  for (const k of ['branch', 'expect', 'from', 'base']) if (o[k] && !BRANCH_RE.test(o[k])) die(2, `bad branch name for --${k}: ${o[k]}`);
  const commands = {
    feature: cmdFeature,
    'check-branch': (x) => (branchMoved(x.path, x.expect) ? 5 : 0),
    scratch: cmdScratch, 'remove-scratch': cmdRemoveScratch,
  };
  process.exit(commands[command](o));
}

main();
