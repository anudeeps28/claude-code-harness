// Tests for skills/implement/bin/run-report.js (F4 #47): the run report and the combined decisions
// log for a Feature's one PR.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCRIPT = path.join(__dirname, '..', 'bin', 'run-report.js');

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-'));
  const f = path.join(dir, 'tasks', 'features', '123');
  fs.mkdirSync(f, { recursive: true });
  fs.writeFileSync(path.join(f, 'feature-state.md'), [
    '# Feature state — 123',
    '',
    'feature: 123',
    'feature-branch: feature/123-orders',
    '',
    '## Stories',
    '',
    'story 201: status=merged title=Add the orders table started=2026-10-06T10:00:00Z finished=2026-10-06T10:25:30Z attempts=1 findings=2 agents=9 tokens=812000',
    'story 202: status=merged title=Show orders started=2026-10-06T10:26:00Z finished=2026-10-06T11:00:00Z attempts=2 findings=0 agents=12 tokens=1100500',
    '',
  ].join('\n'));
  for (const [sid, lines] of [['201', ['- Use a numeric id? → yes (reversible; matches the other tables)']], ['202', ['- Page size? → 20 (reversible; the default elsewhere)', '- Sort order? → newest first (reversible)']]]) {
    fs.mkdirSync(path.join(dir, 'tasks', 'stories', sid), { recursive: true });
    fs.writeFileSync(path.join(dir, 'tasks', 'stories', sid, 'decisions-log.md'), lines.join('\n') + '\n');
  }
  return dir;
}

function run(dir) {
  const r = spawnSync(process.execPath, [SCRIPT, '--feature', '123', '--root', dir], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout + r.stderr };
}

test('RunReport_PerStoryAndTotalAgentsAndTokens', () => {
  const r = run(setup());
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^\| #201 Add the orders table \| merged \| 25m 30s \| 1 \| 2 \| 9 \| 812,000 \|$/m);
  assert.match(r.out, /^\| #202 Show orders \| merged \| 34m 0s \| 2 \| 0 \| 12 \| 1,100,500 \|$/m);
  assert.match(r.out, /^\| \*\*Total\*\* \| \| 59m 30s \| 3 \| 2 \| 21 \| 1,912,500 \|$/m);
});

test('RunReport_EveryDecisionPrefixedWithItsStory', () => {
  const r = run(setup());
  assert.match(r.out, /^## Decisions made on your behalf$/m);
  assert.match(r.out, /^- #201: Use a numeric id\? → yes/m);
  assert.match(r.out, /^- #202: Page size\? → 20/m);
  assert.match(r.out, /^- #202: Sort order\? → newest first/m);
});

test('RunReport_MissingMeasurementsShowAsNotMeasured', () => {
  const dir = setup();
  const file = path.join(dir, 'tasks', 'features', '123', 'feature-state.md');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(' agents=12 tokens=1100500', ''));
  const r = run(dir);
  assert.match(r.out, /^\| #202 Show orders \| merged \| 34m 0s \| 2 \| 0 \| not measured \| not measured \|$/m);
  assert.match(r.out, /^\| \*\*Total\*\* \| .* \| 9 \(1 story not measured\) \| 812,000 \(1 story not measured\) \|$/m);
});

test('RunReport_NoDecisions_SaysNone', () => {
  const dir = setup();
  fs.rmSync(path.join(dir, 'tasks', 'stories'), { recursive: true });
  assert.match(run(dir).out, /^## Decisions made on your behalf\n\nNone\.$/m);
});

test('RunReport_NoState_Fails', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-empty-'));
  assert.equal(run(dir).code, 1);
});
