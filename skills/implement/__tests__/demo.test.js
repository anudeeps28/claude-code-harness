// Tests for skills/implement/bin/demo.js (F3 #37, #39): reads an item's "## Demo" section, checks
// it says how the change is seen, and checks a plan's Demo is never weaker than the ticket's.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCRIPT = path.join(__dirname, '..', 'bin', 'demo.js');
const { parseDemo } = require(SCRIPT);

const UI_DEMO = [
  '# Task #7: Dark mode',
  '',
  '## Demo',
  'Seen through: screenshot, api',
  '1. Open /settings: a "Dark mode" switch sits at the top right of the header.',
  '2. Turn it on: the page background turns near-black.',
  '',
  '## Source',
  '- grill-summary.md',
].join('\n');

function tmpFile(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-'));
  const file = path.join(dir, 'item.md');
  fs.writeFileSync(file, content);
  return file;
}

function run(...args) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout + r.stderr };
}

test('parseDemo_ReadsSeenThroughAndSteps', () => {
  const d = parseDemo(UI_DEMO);
  assert.deepEqual(d.seenThrough, ['screenshot', 'api']);
  assert.deepEqual(d.unknown, []);
  assert.equal(d.steps.length, 2);
  assert.match(d.steps[0], /Open \/settings/);
});

test('parseDemo_NoDemoSection_ReturnsNull', () => {
  assert.equal(parseDemo('# Task\n\n## Description\nsomething\n'), null);
});

test('parseDemo_IgnoresADemoHeadingInsideACodeBlock', () => {
  assert.equal(parseDemo('# Task\n\n```\n## Demo\nSeen through: test\n1. x\n```\n'), null);
});

test('parseDemo_AcceptsBoldLabelAndAnyCase', () => {
  const d = parseDemo('## Demo\n**Seen through:** Database, TEST\n1. Query the rows.\n');
  assert.deepEqual(d.seenThrough, ['database', 'test']);
});

test('parseDemo_UnknownKind_IsReported', () => {
  const d = parseDemo('## Demo\nSeen through: screenshot, vibes\n1. Look at it.\n');
  assert.deepEqual(d.seenThrough, ['screenshot']);
  assert.deepEqual(d.unknown, ['vibes']);
});

test('Check_GoodDemo_ExitsZero', () => {
  const r = run('check', tmpFile(UI_DEMO));
  assert.equal(r.code, 0, r.out);
});

test('Check_NoDemo_FailsAndSaysSo', () => {
  const r = run('check', tmpFile('# Task\n\n## What this delivers\nA refactor.\n'));
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /no "## Demo" section/);
});

test('Check_NoSeenThroughLine_Fails', () => {
  const r = run('check', tmpFile('## Demo\n1. Open the page.\n'));
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /Seen through/);
});

test('Check_NoSteps_Fails', () => {
  const r = run('check', tmpFile('## Demo\nSeen through: screenshot\nIt looks nicer.\n'));
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /numbered step/);
});

test('Check_UnknownKind_FailsAndListsTheKinds', () => {
  const r = run('check', tmpFile('## Demo\nSeen through: vibes\n1. Look.\n'));
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /vibes/);
  assert.match(r.out, /screenshot, api, database, test, log, person/);
});

test('Compare_SameOrMoreSpecific_ExitsZero', () => {
  const plan = UI_DEMO.replace('2. Turn it on', '2. Turn it on (the switch shows "On")') +
    '\n3. Reload: the dark background is kept.\n';
  const r = run('compare', tmpFile(UI_DEMO), tmpFile(plan));
  assert.equal(r.code, 0, r.out);
});

test('Compare_PlanDropsAWayOfSeeing_Fails', () => {
  const plan = UI_DEMO.replace('Seen through: screenshot, api', 'Seen through: screenshot');
  const r = run('compare', tmpFile(UI_DEMO), tmpFile(plan));
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /drops "api"/);
});

test('Compare_PlanDropsAStep_Fails', () => {
  const plan = UI_DEMO.replace(/\n2\. Turn it on[^\n]*/, '');
  const r = run('compare', tmpFile(UI_DEMO), tmpFile(plan));
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /fewer steps/);
});

test('Compare_PlanHasNoDemo_Fails', () => {
  const r = run('compare', tmpFile(UI_DEMO), tmpFile('# Plan\n\nno demo here\n'));
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /plan has no "## Demo"/);
});

test('Compare_TicketHasNoDemo_OnlyChecksThePlan', () => {
  // Items written before F3 have no Demo: the plan writes one, and only its own shape is checked.
  assert.equal(run('compare', tmpFile('# Task\n'), tmpFile(UI_DEMO)).code, 0);
  assert.equal(run('compare', tmpFile('# Task\n'), tmpFile('# Plan\n')).code, 1);
});

test('Cli_BadUsage_ExitsTwo', () => {
  assert.equal(run('nonsense').code, 2);
});
