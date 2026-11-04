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
    'story 201: status=committed title=Add the orders table started=2026-10-06T10:00:00Z finished=2026-10-06T10:25:30Z attempts=1 findings=2 agents=9 tokens=812000',
    'story 202: status=committed title=Show orders started=2026-10-06T10:26:00Z finished=2026-10-06T11:00:00Z attempts=2 findings=0 agents=12 tokens=1100500',
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
  assert.match(r.out, /^\| #201 Add the orders table \| committed \| 25m 30s \| 1 \| 2 \| 9 \| 812,000 \| not measured \|$/m);
  assert.match(r.out, /^\| #202 Show orders \| committed \| 34m 0s \| 2 \| 0 \| 12 \| 1,100,500 \| not measured \|$/m);
  assert.match(r.out, /^\| \*\*Total\*\* \| \| 59m 30s \| 3 \| 2 \| 21 \| 1,912,500 \| not measured \|$/m);
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
  assert.match(r.out, /^\| #202 Show orders \| committed \| 34m 0s \| 2 \| 0 \| not measured \| not measured \| not measured \|$/m);
  assert.match(r.out, /^\| \*\*Total\*\* \| .* \| 9 \(1 story not measured\) \| 812,000 \(1 story not measured\) \| not measured \|$/m);
});

test('RunReport_NoDecisions_SaysNone', () => {
  const dir = setup();
  fs.rmSync(path.join(dir, 'tasks', 'stories'), { recursive: true });
  assert.match(run(dir).out, /^## Decisions made on your behalf\n\nNone\.$/m);
});

// F72 #78 AC6: per story, the agents started, their tokens and which models ran them. Stories are
// committed (not merged) and carry models=<name>:<n>,... ; the Feature's own log holds the decisions.
function setupCommitted() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-c-'));
  const f = path.join(dir, 'tasks', 'features', '123');
  fs.mkdirSync(f, { recursive: true });
  fs.writeFileSync(path.join(f, 'feature-state.md'), [
    '# Feature state — 123', '', 'feature: 123', 'feature-branch: feature/123-orders', '', '## Stories', '',
    'story 201: status=committed title=Add the orders table started=2026-10-06T10:00:00Z finished=2026-10-06T10:25:30Z attempts=1 findings=2 agents=9 tokens=812000 models=sonnet:7,opus:2',
    'story 202: status=committed title=Show orders started=2026-10-06T10:26:00Z finished=2026-10-06T11:00:00Z attempts=2 findings=0 agents=11 tokens=1100500 models=sonnet:10,haiku:1',
    'story 203: status=committed title=Export orders started=2026-10-06T11:01:00Z finished=2026-10-06T11:10:00Z attempts=1 findings=0 agents=3 tokens=90000',
    '',
  ].join('\n'));
  return { dir, f };
}

test('RunReport_AgentsByModelPerStory', () => {
  const { dir } = setupCommitted();
  const r = run(dir);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^\| Story \|.*\| By model \|$/m, 'the table has a By model column');
  assert.match(r.out, /^\| #201 Add the orders table \| committed \| 25m 30s \| 1 \| 2 \| 9 \| 812,000 \| sonnet 7, opus 2 \|$/m);
  assert.match(r.out, /^\| #202 Show orders \| committed \| 34m 0s \| 2 \| 0 \| 11 \| 1,100,500 \| sonnet 10, haiku 1 \|$/m);
  assert.match(r.out, /^\| #203 Export orders \| committed .* \| not measured \|$/m, 'companion: no models= shows not measured');
  assert.match(r.out, /^\| \*\*Total\*\* .* \| sonnet 17, opus 2, haiku 1 \|$/m, 'the total adds each model across stories');
});

test('RunReport_DecisionsFromTheFeatureLog', () => {
  const { dir, f } = setupCommitted();
  fs.writeFileSync(path.join(f, 'decisions-log.md'), [
    '- Plan self-approved → yes (reversible; no open questions)',
    '- #201: Use a numeric id? → yes (reversible; matches the other tables)',
    '- #202: Page size? → 20 (reversible; the default elsewhere)',
    '',
  ].join('\n'));
  fs.mkdirSync(path.join(dir, 'tasks', 'stories', '201'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'tasks', 'stories', '201', 'decisions-log.md'),
    '- #201: Cache the total? → no (reversible; nothing reads it twice)\n');
  const r = run(dir);
  assert.match(r.out, /^## Decisions made on your behalf$/m);
  assert.equal(r.out.split('\n').filter((l) => l.includes('Cache the total?')).length, 1, 'a story-log line already starting #201: appears exactly once');
  assert.match(r.out, /^- #201: Cache the total\?/m, 'and is not prefixed again');
  assert.match(r.out, /^- #201: Use a numeric id\? → yes/m, 'a story line from the Feature log is shown as written');
  assert.match(r.out, /^- #202: Page size\? → 20/m);
  assert.match(r.out, /^- Plan self-approved → yes/m, 'the orchestrator\'s own line is shown without a story prefix');
  assert.doesNotMatch(r.out, /#201: #201:/, 'a line already carrying its story id is not prefixed twice');
  assert.doesNotMatch(r.out, /^None\.$/m);
});

test('RunReport_NoState_Fails', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-empty-'));
  assert.equal(run(dir).code, 1);
});
