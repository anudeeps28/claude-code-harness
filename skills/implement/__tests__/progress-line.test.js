// Tests for skills/implement/bin/progress.js (#24): one sanitised [harness] line per step, printed
// and appended to tasks/stories/<id>/progress.log. Format: ARCHITECTURE.md §7.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCRIPT = path.join(__dirname, '..', 'bin', 'progress.js');
const LINE_RE = /^\[harness\] ts=\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z story=([^ ]+) event=([a-z-]+) phase=([a-z]+) detail="([^"]*)"$/;

function withRoot(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'progress-line-'));
  try { return fn(root); } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

function run(root, args) {
  const r = spawnSync(process.execPath, [SCRIPT, '--root', root, ...args], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

const logPath = (root, id) => path.join(root, 'tasks', 'stories', id, 'progress.log');

test('Progress_ValidStep_PrintsOneLineAndAppendsItToTheLog', () => withRoot((root) => {
  const r = run(root, ['42', 'step', 'coding', 'Wave 1/3 done']);
  assert.equal(r.code, 0, r.err);
  const printed = r.out.trimEnd();
  const m = printed.match(LINE_RE);
  assert.ok(m, `line does not match the contract: ${printed}`);
  assert.deepEqual(m.slice(1), ['42', 'step', 'coding', 'Wave 1/3 done']);
  assert.equal(fs.readFileSync(logPath(root, '42'), 'utf8'), printed + '\n');
}));

test('Progress_TwoSteps_AppendsTwoLines', () => withRoot((root) => {
  run(root, ['42', 'run-started', 'planning', 'start']);
  run(root, ['42', 'phase', 'coding', 'Phase 2']);
  const lines = fs.readFileSync(logPath(root, '42'), 'utf8').trimEnd().split('\n');
  assert.equal(lines.length, 2);
  for (const l of lines) assert.match(l, LINE_RE);
}));

test('Progress_DetailWithNewlinesAndControlChars_IsOneCleanLine', () => withRoot((root) => {
  const r = run(root, ['42', 'step', 'coding', 'first\r\nsecond\x1b[31m red\x07 "quoted" detail="forged"']);
  assert.equal(r.code, 0, r.err);
  const printed = r.out.trimEnd();
  assert.equal(printed.split('\n').length, 1);
  const m = printed.match(LINE_RE);
  assert.ok(m, `line does not match the contract: ${JSON.stringify(printed)}`);
  assert.equal(m[4], "first second[31m red 'quoted' detail='forged'");
  // eslint-disable-next-line no-control-regex
  assert.doesNotMatch(printed, /[\x00-\x1f\x7f]/);
}));

test('Progress_LongDetail_IsCutTo200Characters', () => withRoot((root) => {
  const r = run(root, ['42', 'step', 'coding', 'x'.repeat(500)]);
  assert.equal(r.code, 0, r.err);
  assert.equal(r.out.trimEnd().match(LINE_RE)[4].length, 200);
}));

test('Progress_StoryIdWithPathCharacters_IsRefusedAndNothingIsWritten', () => withRoot((root) => {
  const r = run(root, ['../escape', 'step', 'coding', 'x']);
  assert.equal(r.code, 1);
  assert.equal(fs.existsSync(path.join(root, 'tasks')), false);
}));

test('Progress_UnknownEventOrPhase_IsRefused', () => withRoot((root) => {
  assert.equal(run(root, ['42', 'made-up', 'coding', 'x']).code, 1);
  assert.equal(run(root, ['42', 'step', 'proving-things', 'x']).code, 1);
  assert.equal(fs.existsSync(logPath(root, '42')), false);
}));
