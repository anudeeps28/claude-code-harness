// Tests for skills/implement/bin/pr-gate.js (F6 #60): no Feature PR while a criterion is not met,
// partly met, or proven by a test that stayed green when its line was broken — unless it needs a
// person, or is deferred to a tracker item that exists, is open, and is linked from the PR body.
// Evidence is checked for shape: raw values are refused and never echoed back.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCRIPT = path.join(__dirname, '..', 'bin', 'pr-gate.js');

const STRATEGY = (n) => [
  '**Acceptance criteria and their proofs:**',
  ...Array.from({ length: n }, (_, i) => [
    `${i + 1}. Criterion ${i + 1} holds`,
    `   - Proof: unit — test C${i + 1}`,
    '   - Seen by: the test output',
    '   - Would lie if: the assertion is removed',
  ]).flat(),
  '',
].join('\n');

// Feature 1 with stories 201 (two criteria) and 202 (one), both merged, plus a fake tracker in which
// #90 is open and #91 is closed.
function setup({ gate, body = '', stories = 'merged', feature } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-'));
  const fdir = path.join(root, 'tasks', 'features', '1');
  fs.mkdirSync(fdir, { recursive: true });
  fs.writeFileSync(path.join(fdir, 'feature-state.md'), [
    '# Feature state — 1', '', 'feature: 1', '', '## Stories', '',
    `story 201: status=${stories} title=Orders`, 'story 202: status=merged title=Status', '',
  ].join('\n'));
  for (const [sid, n] of [['201', 2], ['202', 1]]) {
    fs.mkdirSync(path.join(root, 'tasks', 'stories', sid), { recursive: true });
    fs.writeFileSync(path.join(root, 'tasks', 'stories', sid, 'test-strategy.md'), STRATEGY(n));
  }
  if (feature) fs.writeFileSync(path.join(fdir, 'test-strategy.md'), STRATEGY(feature));
  if (gate !== undefined) fs.writeFileSync(path.join(fdir, 'prove-it.md'), `# Prove it — Feature 1\n\n## Gate\n\n${gate.join('\n')}\n`);
  fs.writeFileSync(path.join(fdir, 'pr-body.md'), body);
  const tracker = path.join(root, 'tracker');
  fs.mkdirSync(tracker);
  fs.writeFileSync(path.join(tracker, 'get-issue.sh'), [
    'case "$1" in',
    '  90) echo "# Task #90: rounding"; echo "**State:** OPEN";;',
    '  91) echo "# Task #91: old"; echo "**State:** CLOSED";;',
    '  *) echo "no such item" >&2; exit 1;;',
    'esac', '',
  ].join('\n'));
  return { root, tracker };
}

function run(s) {
  const r = spawnSync(process.execPath, [SCRIPT, '--feature', '1', '--root', s.root, '--tracker-dir', s.tracker], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout + r.stderr };
}

const ALL_MET = ['- 201.1: met; broke: red', '- 201.2: met; broke: red', '- 202.1: met; broke: red'];

test('Gate_EveryCriterionMetAndBrokeRed_Opens', () => {
  const r = run(setup({ gate: ALL_MET }));
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^gate: open$/m);
});

test('Gate_TestStayedGreenWhenItsLineWasBroken_ProofLies_Closed', () => {
  const r = run(setup({ gate: ['- 201.1: met; broke: green — test C1', ALL_MET[1], ALL_MET[2]] }));
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /^refused: 201\.1 \("Criterion 1 holds"\): its test stayed green when the line that makes it true was changed; the proof lies$/m);
  assert.match(r.out, /^gate: closed, 1 to fix$/m);
});

test('Gate_NotMetWithNoDeferral_SaysWhichCriterionAndWhy', () => {
  const r = run(setup({ gate: [ALL_MET[0], '- 201.2: not-met — the export has no header row', ALL_MET[2]] }));
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /^refused: 201\.2 \("Criterion 2 holds"\) is not met: the export has no header row$/m);
});

test('Gate_PartlyMet_Closed', () => {
  const r = run(setup({ gate: [ALL_MET[0], ALL_MET[1], '- 202.1: partly'] }));
  assert.equal(r.code, 1);
  assert.match(r.out, /202\.1 .* is only partly met/);
});

test('Gate_CriterionMissingFromProveIt_Closed', () => {
  const r = run(setup({ gate: [ALL_MET[0], ALL_MET[1]] }));
  assert.equal(r.code, 1);
  assert.match(r.out, /^refused: 202\.1 .* has no line in prove-it\.md's Gate list$/m);
});

test('Gate_NeedsPerson_PassesAndIsListed', () => {
  const r = run(setup({ gate: [ALL_MET[0], ALL_MET[1], '- 202.1: needs-person — sign-off from finance'] }));
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^needs-person: 202\.1$/m);
});

test('Gate_DeferredToAnOpenLinkedItem_Passes', () => {
  const r = run(setup({ gate: [ALL_MET[0], '- 201.2: deferred #90', ALL_MET[2]], body: 'Deferred: rounding — #90\n' }));
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^deferred: 201\.2 → #90$/m);
});

test('Gate_DeferralNotLinkedFromThePR_Closed', () => {
  const r = run(setup({ gate: [ALL_MET[0], '- 201.2: deferred #90', ALL_MET[2]], body: 'nothing here\n' }));
  assert.equal(r.code, 1);
  assert.match(r.out, /deferred to #90, but pr-body\.md does not link it/);
});

test('Gate_DeferralToAMissingOrClosedItem_Closed', () => {
  const missing = run(setup({ gate: [ALL_MET[0], '- 201.2: deferred #99', ALL_MET[2]], body: '#99' }));
  assert.match(missing.out, /deferred to #99, which does not exist/);
  const closed = run(setup({ gate: [ALL_MET[0], '- 201.2: deferred #91', ALL_MET[2]], body: '#91' }));
  assert.match(closed.out, /deferred to #91, which is closed/);
  const none = run(setup({ gate: [ALL_MET[0], '- 201.2: deferred', ALL_MET[2]] }));
  assert.match(none.out, /deferred with no tracker item; a deferral is an item, not a note/);
});

test('Gate_FeatureLevelCriteriaAreGatedToo', () => {
  const r = run(setup({ gate: ALL_MET, feature: 1 }));
  assert.equal(r.code, 1);
  assert.match(r.out, /refused: F\.1 .* has no line/);
});

test('Gate_AStoryNotMerged_Closed', () => {
  const r = run(setup({ gate: ALL_MET, stories: 'stuck' }));
  assert.equal(r.code, 1);
  assert.match(r.out, /story 201 is stuck, not merged/);
});

test('Gate_NoProveIt_Closed', () => {
  const r = run(setup({}));
  assert.equal(r.code, 1);
  assert.match(r.out, /no prove-it\.md: Prove it has not run/);
});

test('Gate_RawEvidence_RefusedWithoutEchoingTheValue', () => {
  // Made-up values, assembled so this file holds no literal personal data.
  const email = ['pat', 'example.com'].join('@');
  const row = ['{"member"', ' "Pat Doe"}'].join(':');
  const s = setup({ gate: ALL_MET });
  fs.appendFileSync(path.join(s.root, 'tasks', 'features', '1', 'prove-it.md'), `\nObserved: ${email}\n${row}\nrows: 3, status: 200\n`);
  const r = run(s);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /^refused: prove-it\.md:\d+ holds an email address; record its shape only/m);
  assert.match(r.out, /^refused: prove-it\.md:\d+ holds a field with its value/m);
  assert.ok(!r.out.includes(email) && !r.out.includes('Pat Doe'), 'the value itself is never printed');
  assert.doesNotMatch(r.out, /rows: 3/, 'counts and status codes are shape, and fine');
});
