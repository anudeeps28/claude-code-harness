#!/usr/bin/env node
// worktree.js — the git side of a run, Feature or single story (F4 #45, #46; F72 #79). Only the orchestrator runs
// it. Its own commands (feature, scratch, ...) never force, delete a branch or reset. The `git`
// command runs a small fixed set of the run's own git commands (add, commit -F, restore, push -u
// origin <branch>) and refuses everything else; the safety hook judges it as the git command it runs.// Stories are built one after another on the Feature branch, so there is no story worktree, story
// merge or story removal.
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
//   git -- [-C <dir>] add [-N] -- <paths> | commit -F <file> | restore [--staged] [--worktree]
//        [--source=HEAD] -- <paths> | push -u origin <branch>
//       One of those git commands (the story commit and staging, the restore, the push), retried when
//       another session holds a lock file. add and restore take named files only (no `.`, `..`, `:`
//       pathspec, glob or folder, a tracked folder missing from disk included); push takes only the branch
//       checked out in the folder git runs in, never main, master, HEAD or a ref (so a feature/, implement/,
//       fix/ or chore/ branch of the run, or a --rework head). Any other command or flag: exit 2, "refused", git not run.
//       A git failure exits 1 with git's message.
//
// Output and exit codes:
//   0 ok
//   1 a git command failed (git's message printed)
//   2 usage error, or a git command refused
//   5 "branch-moved: ..." (contradiction: the run stops)

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const BRANCH_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;

// Another session's git command may hold a lock file for a moment (F73 #82): a lock-file failure is
// retried 3 times, 2 seconds apart. Only this machine's own `Unable to create '<path>.lock': File
// exists` counts; a line the remote printed (`remote: ...`) or any other "cannot lock ref" failure
// does not. Still locked: say which lock; this script never deletes one.
const LOCK_MESSAGE = /Unable to create '([^']*\.lock)': File exists/;
const RETRIES = 3;
const RETRY_WAIT_MS = 2000;

function lockHeld(stderr) {
  for (const line of (stderr || '').split(/\r?\n/)) {
    if (/^\s*remote:/.test(line)) continue;
    const m = line.match(LOCK_MESSAGE);
    if (m) return m[1];
  }
  return null;
}

function git(cwd, args) {
  let r;
  for (let attempt = 0; ; attempt++) {
    r = spawnSync('git', args, { cwd, encoding: 'utf8' });
    const lock = r.status === 0 ? null : lockHeld(r.stderr);
    if (!lock) break;
    if (attempt === RETRIES) {
      die(1, `${lock} is held: another git command is running, or one stopped and left it; check that no other git process is running`);
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

// `git -- <args...>` runs only the run's own fixed shapes, each optionally preceded by `-C <dir>`:
//   add [-N] -- <paths>            commit -F <file>
//   restore [--staged] [--worktree] [--source=HEAD] -- <paths>
//   push -u origin <branch>        (the checked-out branch; see pushableBranch)
// Everything else is refused (exit 2) before git runs, so this wrapper cannot carry a force push, a
// config override or any other command past the safety hook, which judges it as the git command it runs.
const REFUSED_FLAG = /^(--force(-with-lease|-if-includes)?(=.*)?|-f|\+.*|--mirror|--delete|-d|-c|--upload-pack(=.*)?|--receive-pack(=.*)?|--exec(=.*)?)$/;
const RESTORE_OPTS = new Set(['--staged', '--worktree', '--source=HEAD']);

// A path for add/restore must name a file: not a pathspec that sweeps (`.`, `..`, `:/`, `:(magic)`, a glob)
// and not a folder, which would stage or restore everything under it. `base` is where git runs.
function broadPath(p, base) {
  if (p === '.' || p === '..' || p === ':/' || p.startsWith(':')) return `${p} is a pathspec that names more than a file`;
  if (/[*?[]/.test(p)) return `${p} has a glob character; name the files`;
  try {
    if (fs.statSync(path.resolve(base, p)).isDirectory()) return `${p} is a folder; name the files in it`;
  } catch {
    // Not on disk: a deleted or new file, which git judges itself, unless git tracks files under it (a moved-away folder).
    const dir = p.replace(/\/+$/, '');
    if (git(base, ['ls-files', '--', `${dir}/`]).out) return `${p} is a tracked folder; name the files in it`;
  }
  return null;
}

// A branch may be pushed only when it is the one checked out in the folder git runs in, and is not
// main, master, HEAD, a full ref, or a refspec (`:`, `@{`, `..`).
function pushableBranch(b, base) {
  if (!BRANCH_RE.test(b)) return `${b} is not a plain branch name`;
  if (['main', 'master', 'HEAD'].includes(b) || b.startsWith('refs/') || b.includes(':') || b.includes('@{') || b.includes('..')) {
    return `${b} is never pushed through this command`;
  }
  const here = currentBranch(base);
  if (here !== b) return `${b} is not the branch checked out in ${base} (${here || 'detached'}); only the checked-out branch is pushed`;
  return null;
}

function refusal(args) {
  let rest = args;
  let base = process.cwd();
  if (rest[0] === '-C') {
    if (!rest[1] || rest[1].startsWith('-')) return '-C needs a folder';
    base = path.resolve(base, rest[1]);
    rest = rest.slice(2);
  }
  const sub = rest[0];
  const dd = rest.indexOf('--');
  // Flags are looked for before `--` (after it everything is a path), and in every argument of a push.
  const scanned = sub === 'add' || sub === 'restore' ? rest.slice(0, dd === -1 ? rest.length : dd) : rest;
  const flag = scanned.find((a) => REFUSED_FLAG.test(a));
  if (flag) return `${flag} is never run through this command`;
  const shape = `git ${sub || '(nothing)'}${rest.slice(1, 2).length ? ' ' + rest[1] : ''} is not one of the run's own shapes (add [-N] -- <paths>, commit -F <file>, restore [--staged] [--worktree] [--source=HEAD] -- <paths>, push -u origin <branch>)`;
  if (sub === 'add') {
    const opts = rest.slice(1, dd);
    if (!(dd !== -1 && rest.length > dd + 1 && opts.every((o) => o === '-N') && opts.length <= 1)) return shape;
    return rest.slice(dd + 1).map((p) => broadPath(p, base)).find(Boolean) || null;
  }
  if (sub === 'restore') {
    const opts = rest.slice(1, dd);
    if (!(dd !== -1 && rest.length > dd + 1 && opts.every((o) => RESTORE_OPTS.has(o)))) return shape;
    return rest.slice(dd + 1).map((p) => broadPath(p, base)).find(Boolean) || null;
  }
  if (sub === 'commit') return rest.length === 3 && rest[1] === '-F' && !rest[2].startsWith('-') ? null : shape;
  if (sub === 'push') {
    if (!(rest.length === 4 && rest[1] === '-u' && rest[2] === 'origin' && BRANCH_RE.test(rest[3]))) return shape;
    return pushableBranch(rest[3], base);
  }
  return shape;
}

// Arguments go to git as an array, never as shell text.
function cmdGit(args) {
  if (args.length === 0) die(2, 'usage: worktree.js git -- <git arguments...>');
  const why = refusal(args);
  if (why) die(2, `refused: ${why}`);
  const r = git(process.cwd(), args);
  if (r.out) out(r.out);
  if (r.code !== 0) die(1, r.err || `git ${args[0]} failed`);
  if (r.err) process.stderr.write(r.err + '\n');
  return 0;
}

function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (command === 'git') {
    if (rest[0] !== '--') die(2, 'usage: worktree.js git -- <git arguments...>');
    process.exit(cmdGit(rest.slice(1)));
  }
  if (!NEEDS[command]) die(2, 'usage: worktree.js feature|check-branch|scratch|remove-scratch|git ... (see the header of this file)');
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
