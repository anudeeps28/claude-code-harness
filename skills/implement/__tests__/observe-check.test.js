// Tests for skills/implement/bin/observe-check.js (F3 #38): at startup /implement compares the item's
// Demo with the project's Observe section. A missing code-level tool becomes a "build the probe" task;
// missing access stops the run, naming what is missing (a variable's name, never its value); a prod
// environment is refused unless the Observe section explicitly allows it.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCRIPT = path.join(__dirname, '..', 'bin', 'observe-check.js');
const { parseObserve } = require(SCRIPT);

const FULL_OBSERVE = [
  '# Lessons',
  '',
  '## Observe',
  '',
  '- Environment: local',
  '- Start the app: `npm run dev`',
  '- App URL: http://localhost:3000',
  '- Screenshot: `node scripts/screenshot.js <route> <out.png>`',
  '- API base URL: http://localhost:5000',
  '- API credential variable: OBS_API_TOKEN',
  '- Database credential variable: OBS_DB_URL',
  '- Read-only queries: `SELECT id, status FROM orders WHERE id = $1`',
  '- E2E command: `npm run test:e2e`',
  '',
  '## Next section',
].join('\n');

const demo = (kinds) => `# Task\n\n## Demo\nSeen through: ${kinds}\n1. Look at it.\n`;

function files(observe, demoText) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'observe-'));
  fs.writeFileSync(path.join(dir, 'lessons.md'), observe);
  fs.writeFileSync(path.join(dir, 'ticket.md'), demoText);
  return { dir, observe: path.join(dir, 'lessons.md'), demo: path.join(dir, 'ticket.md') };
}

// Fake values: the check must never print either of them.
const FAKE_DB_URL = 'postgres://reader:fakepw@db/app';
const FAKE_TOKEN = 'fake-token-value';
function run(f, extra = [], env = {}) {
  const r = spawnSync(process.execPath, [SCRIPT, '--demo', f.demo, '--observe', f.observe, ...extra], {
    encoding: 'utf8',
    env: { ...process.env, OBS_API_TOKEN: FAKE_TOKEN, OBS_DB_URL: FAKE_DB_URL, ...env },
  });
  return { code: r.status, out: r.stdout + r.stderr };
}

test('parseObserve_ReadsEntriesAndStripsBackticks', () => {
  const o = parseObserve(FULL_OBSERVE);
  assert.equal(o.found, true);
  assert.equal(o.entries.get('environment'), 'local');
  assert.equal(o.entries.get('start the app'), 'npm run dev');
  assert.equal(o.entries.get('e2e command'), 'npm run test:e2e');
});

test('parseObserve_TemplatePlaceholdersCountAsUnset', () => {
  const o = parseObserve('## Observe\n- Screenshot: `<!-- e.g. a Playwright script -->`\n- E2E command: not applicable\n');
  assert.equal(o.entries.has('screenshot'), false);
  assert.equal(o.entries.has('e2e command'), false);
});

test('ObserveCheck_AllNeedsMet_PassesSilently', () => {
  const r = run(files(FULL_OBSERVE, demo('screenshot, api, database, test')));
  assert.equal(r.code, 0, r.out);
  assert.equal(r.out, '');
});

test('ObserveCheck_NoScreenshotCommand_IsAProbe', () => {
  const observe = FULL_OBSERVE.replace(/^- Screenshot:.*$/m, '');
  const r = run(files(observe, demo('screenshot')));
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^probe Screenshot: needed by the Demo's screenshot/m);
});

test('ObserveCheck_ProbeWithPlanTask_IsSatisfied', () => {
  const observe = FULL_OBSERVE.replace(/^- Screenshot:.*$/m, '');
  const f = files(observe, demo('screenshot'));
  const plan = path.join(f.dir, 'plan.md');
  fs.writeFileSync(plan, '<tasks>\n  <task id="1"><name>Build the probe: Screenshot</name></task>\n</tasks>\n');
  const r = run(f, ['--plan', plan]);
  assert.equal(r.code, 0, r.out);
  assert.equal(r.out, '');
});

test('ObserveCheck_ProbeWithNoPlanTask_Stops', () => {
  const observe = FULL_OBSERVE.replace(/^- Screenshot:.*$/m, '');
  const f = files(observe, demo('screenshot'));
  const plan = path.join(f.dir, 'plan.md');
  fs.writeFileSync(plan, '<tasks>\n  <task id="1"><name>Add the switch</name></task>\n</tasks>\n');
  const r = run(f, ['--plan', plan]);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /^missing probe task: Build the probe: Screenshot/m);
});

test('ObserveCheck_DbVariableUnset_StopsNamingItOnly', () => {
  const r = run(files(FULL_OBSERVE, demo('database')), [], { OBS_DB_URL: '' });
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /^missing variable OBS_DB_URL: named in Observe → Database credential variable, not set/m);
  assert.ok(!r.out.includes(FAKE_DB_URL), 'the value must never be printed');
});

test('ObserveCheck_VariableSet_ValueNeverPrinted', () => {
  const r = run(files(FULL_OBSERVE.replace(/^- Read-only queries:.*$/m, ''), demo('database')));
  assert.equal(r.code, 1, r.out);
  assert.ok(!r.out.includes(FAKE_DB_URL) && !r.out.includes(FAKE_TOKEN), r.out);
});

test('ObserveCheck_ValueInsteadOfName_StopsWithoutEchoingIt', () => {
  const observe = FULL_OBSERVE.replace('OBS_DB_URL', FAKE_DB_URL);
  const r = run(files(observe, demo('database')));
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /Database credential variable: must name an environment variable, not hold its value/);
  assert.ok(!r.out.includes('fakepw'), 'a credential pasted into Observe must never be printed');
});

test('ObserveCheck_ApiWithNoBaseUrl_Stops', () => {
  const r = run(files(FULL_OBSERVE.replace(/^- API base URL:.*$/m, ''), demo('api')));
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /^missing API base URL: needed by the Demo's api/m);
});

test('ObserveCheck_ApiCredentialNone_NeedsNoVariable', () => {
  const observe = FULL_OBSERVE.replace('OBS_API_TOKEN', 'none');
  assert.equal(run(files(observe, demo('api')), [], { OBS_API_TOKEN: '' }).code, 0);
});

test('ObserveCheck_Prod_IsRefused', () => {
  const r = run(files(FULL_OBSERVE.replace('Environment: local', 'Environment: prod'), demo('screenshot')));
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /^refused: Observe → Environment is prod/m);
});

test('ObserveCheck_ProdAllowedExplicitly_Passes', () => {
  const observe = FULL_OBSERVE.replace('Environment: local', 'Environment: production\n- Prod allowed: yes');
  assert.equal(run(files(observe, demo('screenshot'))).code, 0);
});

test('ObserveCheck_UnknownEnvironment_IsRefused', () => {
  const r = run(files(FULL_OBSERVE.replace('Environment: local', 'Environment: staging-eu'), demo('api')));
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /^refused: Observe → Environment is "staging-eu"/m);
});

test('ObserveCheck_NoObserveSection_NamesEachGap', () => {
  const r = run(files('# Lessons\n\n## Test Commands\n', demo('screenshot, database')));
  assert.equal(r.code, 1, r.out);
  for (const e of ['Environment', 'Start the app', 'Database credential variable', 'Read-only queries']) {
    assert.match(r.out, new RegExp(`^missing ${e}:`, 'm'), `expected ${e} to be named`);
  }
  assert.match(r.out, /^probe Screenshot:/m);
});

test('ObserveCheck_TestAndPersonDemos_NeedNoEnvironment', () => {
  // A Demo seen only through a test run, or a person's sign-off, touches no running system.
  const r = run(files('## Observe\n- E2E command: `npm test`\n', demo('test, person')));
  assert.equal(r.code, 0, r.out);
});

test('ObserveCheck_NoDemo_IsUncheckedNotAStop', () => {
  const r = run(files(FULL_OBSERVE, '# Task\n\n## Description\nold item\n'));
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^unchecked: no "## Demo"/m);
});

test('ObserveCheck_DefaultObserveFile_FallsBackToNotes', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'observe-root-'));
  fs.mkdirSync(path.join(dir, 'tasks'));
  fs.writeFileSync(path.join(dir, 'tasks', 'notes.md'), FULL_OBSERVE);
  fs.writeFileSync(path.join(dir, 'ticket.md'), demo('test'));
  const r = spawnSync(process.execPath, [SCRIPT, '--demo', 'ticket.md'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});
