#!/usr/bin/env node
// disk-check.js — before a Feature run creates any worktree, check there is room for them (F5 #50;
// ARCHITECTURE.md §5, §8). Each worktree, with its dependencies restored, takes about 1–3 GB.
//
// Usage: node disk-check.js --stories <n> [--size-gb <gb>] [--path <dir>]
//   --stories  how many stories can run at once (the story cap); the Feature worktree adds one more
//   --size-gb  per worktree; default the "worktree-size-gb" setting in lessons/notes, else 3
//   --path     where the worktrees go; default the folder above this one (they are its siblings)
//
// Prints nothing and exits 0 when there is room; prints "not enough disk: ..." and exits 1 when not.
// HARNESS_FREE_BYTES overrides the measured free space (tests).

const fs = require('node:fs');
const path = require('node:path');
const { readSettings } = require('./settings.js');

const DEFAULT_GB = 3;
const GB = 1024 ** 3;

function freeBytes(dir) {
  if (process.env.HARNESS_FREE_BYTES) return Number(process.env.HARNESS_FREE_BYTES);
  const s = fs.statfsSync(dir);
  return Number(s.bavail) * Number(s.bsize);
}

function main() {
  const argv = process.argv.slice(2);
  const opt = (k) => { const i = argv.indexOf(k); return i === -1 ? undefined : argv[i + 1]; };
  const stories = Number(opt('--stories'));
  const size = Number(opt('--size-gb') ?? readSettings()['worktree-size-gb'] ?? DEFAULT_GB);
  const where = path.resolve(opt('--path') || '..');
  if (!Number.isInteger(stories) || stories < 1 || !(size > 0)) {
    process.stderr.write('usage: disk-check.js --stories <n> [--size-gb <gb>] [--path <dir>]\n');
    process.exit(2);
  }
  const worktrees = stories + 1;
  const need = worktrees * size * GB;
  const free = freeBytes(where);
  if (free < need) {
    process.stdout.write(`not enough disk: need ${(need / GB).toFixed(1)} GB for ${worktrees} worktrees (${stories} ${stories === 1 ? 'story' : 'stories'} at once + the Feature) at ${size} GB each, ${(free / GB).toFixed(1)} GB free at ${where}. Free some space, or lower max-parallel-stories or worktree-size-gb in lessons/notes.\n`);
    process.exit(1);
  }
}

main();
