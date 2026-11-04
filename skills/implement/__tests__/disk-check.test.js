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

function run(args, { free, lessons } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'disk-'));
  fs.mkdirSync(path.join(dir, 'tasks'));
  if (lessons !== undefined) fs.writeFileSync(path.join(dir, 'tasks', 'lessons.md'), lessons);
  const env = { ...process.env };
  delete env.HARNESS_FREE_BYTES;
  if (free !== undefined) env.HARNESS_FREE_BYTES = String(free);
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd: dir, encoding: 'utf8', env });
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
