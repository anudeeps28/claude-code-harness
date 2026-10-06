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
  // 3 stories at once + the Feature worktree = 4 worktrees × 3 GB = 12 GB.
  const r = run(['--stories', '3'], { free: 10 * GB });
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /^not enough disk: need 12\.0 GB for 4 worktrees \(3 stories at once \+ the Feature\) at 3 GB each, 10\.0 GB free at /m);
});

test('Disk_Enough_PassesSilently', () => {
  const r = run(['--stories', '3'], { free: 50 * GB });
  assert.equal(r.code, 0, r.out);
  assert.equal(r.out, '');
});

test('Disk_SizeSettingInLessons_IsUsed', () => {
  const lessons = '# Lessons\n\n## Feature runs\n\n- worktree-size-gb: 1\n';
  assert.equal(run(['--stories', '3'], { free: 5 * GB, lessons }).code, 0, '4 × 1 GB fits in 5 GB');
  assert.equal(run(['--stories', '3'], { free: 3 * GB, lessons }).code, 1);
});

test('Disk_RealFreeSpace_IsReadOnThisPlatform', () => {
  const r = run(['--stories', '1', '--size-gb', '0.001']);
  assert.equal(r.code, 0, r.out);
});

test('Disk_BadInput_ExitsTwo', () => {
  assert.equal(run(['--stories', 'many']).code, 2);
});
