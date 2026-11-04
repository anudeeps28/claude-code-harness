#!/usr/bin/env node
// disk-check.js — before a Feature run creates any worktree, check there is room for them (F5 #50;
// ARCHITECTURE.md §5, §8). Each worktree, with its dependencies restored, takes about 1–3 GB.
//
// Usage: node disk-check.js [--worktrees <n>] [--size-gb <gb>] [--path <dir>] [--feature <fid> [--root <home>]]
//   --worktrees  default 2: the Feature worktree plus the Prove-it scratch copy
//   --feature  this Feature's id: every OTHER Feature under <root>/tasks/features with plan-approved: yes and
//     no run-finished in its progress.log adds its Prove-it copy, and its worktree when not made yet
//     (F73 #82, several sessions at once). --root default the current directory.
//   --size-gb  per worktree; default the "worktree-size-gb" setting in lessons/notes, else 3
//   --path     where the worktrees go; default the folder above this one (they are its siblings)
//
// Prints nothing and exits 0 when there is room; prints "not enough disk: ..." and exits 1 when not.
// HARNESS_FREE_BYTES overrides the measured free space (tests).

const fs = require('node:fs');
const path = require('node:path');
const { readSettings } = require('./settings.js');
const { readState } = require('./feature-state.js');

const DEFAULT_GB = 3;
const DEFAULT_WORKTREES = 2;
const GB = 1024 ** 3;

function freeBytes(dir) {
  if (process.env.HARNESS_FREE_BYTES) return Number(process.env.HARNESS_FREE_BYTES);
  const s = fs.statfsSync(dir);
  return Number(s.bavail) * Number(s.bsize);
}

// Every OTHER Feature of this home folder that has an approved plan and has not finished: it will still
// create its Prove-it scratch copy (1), and its Feature worktree (1 more) when that folder is not there yet.
function otherFeatures(root, fid) {
  const dir = path.join(root, 'tasks', 'features');
  if (!fs.existsSync(dir)) return [];
  const found = [];
  for (const name of fs.readdirSync(dir).sort()) {
    if (name === fid) continue;
    const state = readState(root, name);
    if (!state || state.header['plan-approved'] !== 'yes') continue;
    const log = path.join(dir, name, 'progress.log');
    if (fs.existsSync(log) && / event=run-finished\b/.test(fs.readFileSync(log, 'utf8'))) continue;
    const wt = state.header['feature-worktree'];
    found.push({ fid: name, count: 1 + (wt && fs.existsSync(wt) ? 0 : 1) });
  }
  return found;
}

function main() {
  const argv = process.argv.slice(2);
  const opt = (k) => { const i = argv.indexOf(k); return i === -1 ? undefined : argv[i + 1]; };
  const worktrees = Number(opt('--worktrees') ?? DEFAULT_WORKTREES);
  const size = Number(opt('--size-gb') ?? readSettings()['worktree-size-gb'] ?? DEFAULT_GB);
  const where = path.resolve(opt('--path') || '..');
  if (!Number.isInteger(worktrees) || worktrees < 1 || !(size > 0)) {
    process.stderr.write('usage: disk-check.js [--worktrees <n>] [--size-gb <gb>] [--path <dir>] [--feature <fid> [--root <home>]]\n');
    process.exit(2);
  }
  const feature = opt('--feature');
  const others = feature ? otherFeatures(path.resolve(opt('--root') || '.'), feature) : [];
  const extra = others.reduce((n, o) => n + o.count, 0);
  const total = worktrees + extra;
  const need = total * size * GB;
  const free = freeBytes(where);
  if (free < need) {
    let what = worktrees === DEFAULT_WORKTREES ? ' (the Feature and the Prove-it scratch copy)' : '';
    if (extra > 0) what = ` (this Feature and its Prove-it copy, plus ${extra} for ${others.map((o) => `#${o.fid}`).join(', ')} being built in other sessions)`;
    process.stdout.write(`not enough disk: need ${(need / GB).toFixed(1)} GB for ${total} worktrees${what} at ${size} GB each, ${(free / GB).toFixed(1)} GB free at ${where}. Free some space, or lower worktree-size-gb in lessons/notes.\n`);
    process.exit(1);
  }
}

main();
