#!/usr/bin/env node
// worktree.js — the git side of a Feature run (F4 #45, #46; ADR-0002, ADR-0003). Only the
// orchestrator runs it. Nothing here is ever forced: no --force, no -D, no reset, no push.
//
// Usage:
//   feature --home <dir> --path <p> --branch <b> [--base main]
//       Feature worktree: a sibling folder on a new branch from the base, so home stays on main.
//       Already there on that branch (a resumed run): reused.
//   story --home <dir> --path <p> --branch <b> --from <feature-branch>
//       Story worktree, branched from the Feature branch, so it has every story merged so far.
//   merge --feature-worktree <p> --branch <story-branch> --expect <feature-branch> --test <cmd> --message <m>
//       git merge --no-ff --no-commit, run the tests on the uncommitted result, then commit (green)
//       or git merge --abort (red, or a conflict). A half-done merge left by a crash is aborted first.
//   remove --home <dir> --feature-worktree <p> --path <p> --branch <b>
//       git worktree remove, then git branch -d (checked against the Feature branch). Both refuse
//       rather than lose work: uncommitted changes, or a story not merged into the Feature.
//   check-branch --path <p> --expect <b>
//   scratch --home <dir> --path <p> --from <ref>
//       Prove it's scratch copy: a detached worktree at <ref> (no branch). Refuses an existing path.
//   remove-scratch --home <dir> --path <p>
//       Removes it only when it is detached and clean: a broken line not put back is refused (exit 1).
//
// Output and exit codes:
//   0 ok ("merged <sha>" after a merge)        3 "conflict: <file>" lines, merge aborted
//   1 a git command refused (message printed)  4 "tests-failed: ..." and the test output's tail, merge aborted
//   2 usage error                               5 "branch-moved: ..." (contradiction: the run stops)

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const BRANCH_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;
const TAIL_LINES = 30;

function git(cwd, args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
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

function mergeInProgress(p) {
  const gitDir = git(p, ['rev-parse', '--git-dir']).out;
  return gitDir !== '' && fs.existsSync(path.resolve(p, gitDir, 'MERGE_HEAD'));
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

function cmdStory(o) {
  if (fs.existsSync(o.path)) return existing(o.path, o.branch);
  must(git(o.home, ['worktree', 'add', o.path, '-b', o.branch, o.from]), 'git worktree add');
  out(`created ${o.path} on ${o.branch} from ${o.from}`);
  return 0;
}

function cmdMerge(o) {
  const p = o['feature-worktree'];
  if (mergeInProgress(p)) {
    must(git(p, ['merge', '--abort']), 'git merge --abort');
    out('aborted a half-done merge left by an earlier run; redoing it');
  }
  if (branchMoved(p, o.expect)) return 5;

  const merge = git(p, ['merge', '--no-ff', '--no-commit', o.branch]);
  if (merge.code !== 0) {
    const files = git(p, ['diff', '--name-only', '--diff-filter=U']).out.split('\n').filter(Boolean);
    git(p, ['merge', '--abort']);
    if (files.length === 0) die(1, `git merge failed: ${merge.err || merge.out}`);
    for (const f of files) out(`conflict: ${f}`);
    return 3;
  }

  // The test command comes from the project's own lessons/notes file, so it runs through the shell.
  const t = spawnSync(o.test, { cwd: p, shell: true, encoding: 'utf8' });
  if (t.status !== 0) {
    git(p, ['merge', '--abort']);
    const tail = `${t.stdout || ''}${t.stderr || ''}`.trimEnd().split('\n').slice(-TAIL_LINES);
    out(`tests-failed: exit ${t.status} on the merged result; merge aborted, the Feature branch is unchanged`);
    for (const l of tail) out(`  ${l}`);
    return 4;
  }

  // A merge that brought no changes leaves nothing to commit and no MERGE_HEAD: nothing to do.
  if (mergeInProgress(p)) must(git(p, ['commit', '--no-edit', '-m', o.message]), 'git commit');
  out(`merged ${git(p, ['rev-parse', 'HEAD']).out}`);
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

function cmdRemove(o) {
  must(git(o.home, ['worktree', 'remove', o.path]), 'git worktree remove');
  // From the Feature worktree, so "-d" checks the story is merged into the Feature branch (from home
  // it would check main, and refuse every story until the Feature itself is merged).
  must(git(o['feature-worktree'], ['branch', '-d', o.branch]), 'git branch -d');
  out(`removed ${o.path} and branch ${o.branch}`);
  return 0;
}

const NEEDS = {
  feature: ['home', 'path', 'branch'],
  story: ['home', 'path', 'branch', 'from'],
  merge: ['feature-worktree', 'branch', 'expect', 'test', 'message'],
  remove: ['home', 'feature-worktree', 'path', 'branch'],
  'check-branch': ['path', 'expect'],
  scratch: ['home', 'path', 'from'],
  'remove-scratch': ['home', 'path'],
};

function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (!NEEDS[command]) die(2, 'usage: worktree.js feature|story|merge|remove|check-branch|scratch|remove-scratch ... (see the header of this file)');
  const o = {};
  for (let i = 0; i < rest.length; i += 2) {
    if (!rest[i].startsWith('--') || rest[i + 1] === undefined) die(2, `bad argument: ${rest[i]}`);
    o[rest[i].slice(2)] = rest[i + 1];
  }
  for (const k of NEEDS[command]) if (!o[k]) die(2, `--${k} is required for ${command}`);
  for (const k of ['branch', 'expect', 'from', 'base']) if (o[k] && !BRANCH_RE.test(o[k])) die(2, `bad branch name for --${k}: ${o[k]}`);
  const commands = {
    feature: cmdFeature, story: cmdStory, merge: cmdMerge, remove: cmdRemove,
    'check-branch': (x) => (branchMoved(x.path, x.expect) ? 5 : 0),
    scratch: cmdScratch, 'remove-scratch': cmdRemoveScratch,
  };
  process.exit(commands[command](o));
}

main();
