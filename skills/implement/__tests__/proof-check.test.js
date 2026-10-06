// Tests for skills/implement/bin/proof-check.js (F3 #39): every acceptance criterion in a plan's
// test-strategy.md has a proof, a way of seeing the real result, and a "what would make it lie" line.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCRIPT = path.join(__dirname, '..', 'bin', 'proof-check.js');

const GOOD = [
  '### Test Strategy',
  '',
  '**Acceptance criteria and their proofs:**',
  '1. Turning the switch on darkens the page',
  '   - Proof: ui-automation — tests/e2e/dark-mode.spec.ts "switch darkens page"',
  '   - Seen by: screenshot of /settings after the click',
  '   - Would lie if: the test checks the switch state but never the background colour',
  '2. The choice survives a reload',
  '   - Proof: integration — SettingsApi_Save_PersistsTheme',
  '   - Seen by: GET /api/settings returns theme=dark',
  '   - Would lie if: the test reads from the in-memory cache instead of the database',
  '',
  '**Integration test scenarios:**',
  '1. N/A',
].join('\n');

function run(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'proof-'));
  const file = path.join(dir, 'test-strategy.md');
  fs.writeFileSync(file, content);
  const r = spawnSync(process.execPath, [SCRIPT, file], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout + r.stderr };
}

test('ProofCheck_EveryCriterionHasAllThreeLines_ExitsZero', () => {
  const r = run(GOOD);
  assert.equal(r.code, 0, r.out);
  assert.equal(r.out, '');
});

test('ProofCheck_MissingWouldLieLine_FailsNamingTheCriterion', () => {
  const r = run(GOOD.replace(/\n {3}- Would lie if: the test reads[^\n]*/, ''));
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /^criterion 2 \("The choice survives a reload"\): no "Would lie if:" line/m);
});

test('ProofCheck_MissingProofLine_Fails', () => {
  const r = run(GOOD.replace(/\n {3}- Proof: ui-automation[^\n]*/, ''));
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /^criterion 1 .*no "Proof:" line/m);
});

test('ProofCheck_PlaceholderLines_DoNotCount', () => {
  const r = run(GOOD.replace('screenshot of /settings after the click', 'TBD')
    .replace('the test checks the switch state but never the background colour', 'n/a'));
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /criterion 1 .*"Seen by:" is empty or a placeholder/);
  assert.match(r.out, /criterion 1 .*"Would lie if:" is empty or a placeholder/);
});

test('ProofCheck_UnknownProofKind_FailsAndListsTheKinds', () => {
  const r = run(GOOD.replace('Proof: integration', 'Proof: vibes'));
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /unit, integration, e2e, ui-automation, graded-eval, sign-off/);
});

test('ProofCheck_SignOffCriterion_IsReportedAsNeedingAPerson', () => {
  const r = run(GOOD.replace('Proof: integration — SettingsApi_Save_PersistsTheme', 'Proof: sign-off — the designer approves the contrast'));
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^needs-person: criterion 2 \("The choice survives a reload"\) is proven by a sign-off/m);
});

test('ProofCheck_NoCriteriaList_Fails', () => {
  const r = run('### Test Strategy\n\n**Regression guardrails:**\n1. nothing\n');
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /no "\*\*Acceptance criteria and their proofs:\*\*" list/);
});

test('ProofCheck_MissingFile_ExitsTwo', () => {
  const r = spawnSync(process.execPath, [SCRIPT, path.join(os.tmpdir(), 'no-such-strategy.md')], { encoding: 'utf8' });
  assert.equal(r.status, 2);
});
