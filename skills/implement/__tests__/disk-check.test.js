// Tests for skills/implement/bin/disk-check.js (F5 #50): before a Feature run creates any worktree,
// free disk space is compared with what the worktrees will need.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCRIPT = path.join(__dirname, '..', 'bin', 'disk-check.js');
const GB = 1024 ** 3;

// `args` may be a function of the temp home folder, and `setup(dir)` may plant files in it first.
function run(args, { free, lessons, setup } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'disk-'));
  fs.mkdirSync(path.join(dir, 'tasks'));
  if (lessons !== undefined) fs.writeFileSync(path.join(dir, 'tasks', 'lessons.md'), lessons);
  if (setup) setup(dir);
  const env = { ...process.env };
  delete env.HARNESS_FREE_BYTES;
  if (free !== undefined) env.HARNESS_FREE_BYTES = String(free);
  const argv = typeof args === 'function' ? args(dir) : args;
  const r = spawnSync(process.execPath, [SCRIPT, ...argv], { cwd: dir, encoding: 'utf8', env });
  return { code: r.status, out: r.stdout + r.stderr };
}

test('Disk_NotEnough_StopsWithNeededAndFree', () => {
  // The Feature worktree + the Prove-it scratch copy = 2 worktrees × 3 GB = 6 GB.
  const r = run([], { free: 5 * GB });
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /^not enough disk: need 6\.0 GB for 2 worktrees \(the Feature and the Prove-it scratch copy\) at 3 GB each, 5\.0 GB free at /m);
  assert.doesNotMatch(r.out, /max-parallel-stories|stories at once/, 'there is no story width to lower');
});

test('Disk_NotEnoughForThreeWorktrees_SaysThreeWorktrees', () => {
  const r = run(['--worktrees', '3'], { free: 8 * GB });
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /^not enough disk: need 9\.0 GB for 3 worktrees at 3 GB each, 8\.0 GB free at /m);
});

test('Disk_Enough_PassesSilently', () => {
  const r = run([], { free: 50 * GB });
  assert.equal(r.code, 0, r.out);
  assert.equal(r.out, '');
});

test('Disk_FeatureWorktreeAndScratch_NoStoryCount', () => {
  // AC5 of #79: no --stories; the count is always two, and --worktrees overrides it.
  assert.equal(run([], { free: 7 * GB }).code, 0, '2 × 3 GB fits in 7 GB');
  assert.equal(run([], { free: 5 * GB }).code, 1, 'and does not fit in 5 GB');
  assert.equal(run(['--worktrees', '3'], { free: 8 * GB }).code, 1, '3 × 3 GB does not fit in 8 GB');
  assert.equal(run(['--worktrees', '3'], { free: 10 * GB }).code, 0, '3 × 3 GB fits in 10 GB');
});

test('Disk_SizeSettingInLessons_IsUsed', () => {
  const lessons = '# Lessons\n\n## Feature runs\n\n- worktree-size-gb: 1\n';
  assert.equal(run([], { free: 3 * GB, lessons }).code, 0, '2 × 1 GB fits in 3 GB');
  assert.equal(run([], { free: 1 * GB, lessons }).code, 1);
});

test('Disk_RealFreeSpace_IsReadOnThisPlatform', () => {
  const r = run(['--size-gb', '0.001']);
  assert.equal(r.code, 0, r.out);
});

test('Disk_BadInput_ExitsTwo', () => {
  assert.equal(run(['--worktrees', 'many']).code, 2);
});

// ── several Features at once (F73 #82, AC5) ──────────────────────────

// Another Feature under <home>/tasks/features/<fid>: approved, in the testing phase (not coding, so a
// check that only counted coding Features would miss it), with or without its worktree on disk.
function otherFeature(dir, fid, { approved = 'yes', worktreeExists = true, finished = false } = {}) {
  const f = path.join(dir, 'tasks', 'features', fid);
  fs.mkdirSync(f, { recursive: true });
  const wt = path.join(dir, '..', `${path.basename(dir)}-f${fid}`);
  if (worktreeExists) fs.mkdirSync(wt, { recursive: true });
  fs.writeFileSync(path.join(f, 'feature-state.md'),
    `feature: ${fid}\nplan-approved: ${approved}\nphase: testing\nfeature-worktree: ${wt}\n`);
  fs.writeFileSync(path.join(f, 'progress.log'),
    `[harness] ts=2026-11-04T09:00:00Z feature=${fid} story=- event=run-started phase=planning detail="x"\n`
    + (finished ? `[harness] ts=2026-11-04T09:50:00Z feature=${fid} story=- event=run-finished phase=shipping detail="x"\n` : ''));
}

const forFeature = (dir) => ['--feature', '123', '--root', dir];

test('Disk_AnotherFeatureBeingBuilt_CountsItsScratchCopy', () => {
  // Free 8 GB at 3 GB each: this Feature needs 2 worktrees (6 GB) and fits; the other Feature's
  // Prove-it copy makes 3 (9 GB), which does not.
  const r = run(forFeature, { free: 8 * GB, setup: (d) => otherFeature(d, '124') });
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /^not enough disk: need 9\.0 GB for 3 worktrees \(this Feature and its Prove-it copy, plus 1 for #124 being built in other sessions\)/m);
  // Companion: with no other Feature the same free space is enough, so the other one is what was counted.
  assert.equal(run(['--feature', '123'], { free: 8 * GB }).code, 0, 'no other Feature: 2 × 3 GB fits in 8 GB');
  // The other Feature's worktree is not made yet: its worktree counts too (4 worktrees, 12 GB).
  const missing = run(forFeature, { free: 11 * GB, setup: (d) => otherFeature(d, '124', { worktreeExists: false }) });
  assert.equal(missing.code, 1, missing.out);
  assert.match(missing.out, /need 12\.0 GB for 4 worktrees/);
  // An approved plan is required: a Feature still at its plan gate is not being built.
  assert.equal(run(forFeature, { free: 8 * GB, setup: (d) => otherFeature(d, '124', { approved: 'no' }) }).code, 0);
});

test('Disk_FinishedFeature_NotCounted', () => {
  const finished = run(forFeature, { free: 8 * GB, setup: (d) => otherFeature(d, '124', { finished: true }) });
  assert.equal(finished.code, 0, finished.out);
  assert.equal(finished.out, '');
  // Companion: the same Feature without run-finished is counted, so the fixture was read.
  const running = run(forFeature, { free: 8 * GB, setup: (d) => otherFeature(d, '124') });
  assert.equal(running.code, 1, running.out);
  // This Feature's own state is never counted as "another".
  assert.equal(run(forFeature, { free: 8 * GB, setup: (d) => otherFeature(d, '123') }).code, 0, 'only other Features count');
});
