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

function run(content, extra = [], name = 'test-strategy.md') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'proof-'));
  const file = path.join(dir, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  const r = spawnSync(process.execPath, [SCRIPT, file, ...extra], { encoding: 'utf8' });
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

// ── Feature plan (F72 #77): one plan.md with a "## Story #<sid>" section per story ──────────────

const FEATURE_PLAN = [
  '## Story order',
  '1. #201 then #202',
  '',
  '## Story #201 — Orders',
  '',
  '**Acceptance criteria and their proofs:**',
  '1. Orders list loads',
  '   - Proof: integration — Orders_List_Loads',
  '   - Seen by: GET /api/orders returns rows',
  '   - Would lie if: the test seeds no orders',
  '',
  '**Commands:**',
  '- npm test',
  '',
  '## Story #202 — Status',
  '',
  '**Acceptance criteria and their proofs:**',
  '1. Status shows on the card',
  '   - Proof: ui-automation — status.spec.ts "shows status"',
  '   - Seen by: screenshot of /orders',
  '   - Would lie if: the fixture always has status set',
  '',
].join('\n');

test('ProofCheck_FeaturePlan_ChecksEveryStorySection', () => {
  const ok = run(FEATURE_PLAN);
  assert.equal(ok.code, 0, ok.out);
  assert.equal(ok.out, '', 'a complete two-story plan is silent (companion: both sections are readable)');

  const broken = run(FEATURE_PLAN.replace(/\n {3}- Would lie if: the fixture[^\n]*/, ''));
  assert.equal(broken.code, 1, broken.out);
  assert.match(broken.out, /^#202 criterion 1 \("Status shows on the card"\): no "Would lie if:" line/m);
  assert.doesNotMatch(broken.out, /#201/, 'story 201 is fine and is not named');
});

test('ProofCheck_StoryFlag_ChecksOnlyThatSection', () => {
  const broken = FEATURE_PLAN.replace(/\n {3}- Would lie if: the fixture[^\n]*/, '');
  const mine = run(broken, ['--story', '201']);
  assert.equal(mine.code, 0, mine.out);
  assert.equal(mine.out, '', 'story 201 is complete; story 202 is not checked');

  const other = run(broken, ['--story', '#202']);
  assert.equal(other.code, 1, other.out);
  assert.match(other.out, /^#202 criterion 1 .*no "Would lie if:" line/m);
  assert.doesNotMatch(other.out, /#201/);
});

test('ProofCheck_StoryFlag_MissingSection_IsAProblem', () => {
  const r = run(FEATURE_PLAN, ['--story', '999']);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /no "## Story #999" section/);
});

test('ProofCheck_FeaturePlanWithNoStorySections_SaysSo', () => {
  const r = run('## Story order\n1. #201\n', [], path.join('features', '72', 'plan.md'));
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /no "## Story #<sid>" sections/);
  assert.doesNotMatch(r.out, /the test strategy/);
});

// A single story's task plan is also called plan.md; only a plan under features/ is a Feature plan.
test('ProofCheck_StoryPlanMd_IsNotTakenForAFeaturePlan', () => {
  const r = run('## Story order\n1. #201\n', [], path.join('stories', '9', 'plan.md'));
  assert.equal(r.code, 1, r.out);
  assert.doesNotMatch(r.out, /no "## Story #<sid>" sections/);
});
