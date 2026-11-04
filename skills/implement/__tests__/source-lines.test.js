// Tests for skills/implement/bin/source-lines.js: the requirement lines a story was traced to are
// carried verbatim from the source document into the plan's criteria, never dropped or reworded, and a
// coverage table maps every line before anything is created or closed.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCRIPT = path.join(__dirname, '..', 'bin', 'source-lines.js');

const TICKET = [
  '## What this delivers',
  'The weekly review shows who engages.',
  '',
  '## Source requirements',
  'Source: docs/weekly-review-design.md',
  'Coverage: tasks/coverage/weekly-review-design.md',
  '- [D-5b.3] who engages: change from last month',
  '- [D-5b.4] goal not reached → goal-hitters side by side',
  '',
  '## Demo',
  'Seen through: screenshot',
  '1. Open /review: the engagement panel shows last month next to this month.',
].join('\n');

const STRATEGY = [
  '### Test Strategy',
  '',
  '**Acceptance criteria and their proofs:**',
  '1. [D-5b.3] who engages: change from last month',
  '   - Means: each engager row shows this month, last month and the change',
  '   - Proof: integration — Review_Engagers_ShowsMonthOverMonth',
  '   - Seen by: GET /api/review returns lastMonth and change per engager',
  '   - Would lie if: the test seeds only one month',
  '2. [D-5b.4] goal not reached → goal-hitters side by side',
  '   - Proof: ui-automation — review.spec.ts "missed goal shows hitters"',
  '   - Seen by: screenshot of /review with a missed goal',
  '   - Would lie if: the fixture always reaches the goal',
  '3. The panel loads in under a second',
  '   - Proof: e2e — review.spec.ts "loads fast"',
  '   - Seen by: the e2e timing log',
  '   - Would lie if: the test runs against a cached page',
  '',
  '**Integration test scenarios:**',
  '1. N/A',
].join('\n');

const COVERAGE = [
  '# Coverage — docs/weekly-review-design.md',
  'Source: docs/weekly-review-design.md',
  '',
  '| Id | Requirement | Mapped to | Audit |',
  '|---|---|---|---|',
  '| D-5b.3 | who engages: change from last month | story 3 (#205) AC1 | Built |',
  '| D-5b.4 | goal not reached → goal-hitters side by side | story 3 (#205) AC2 | Built |',
  '| D-6 | scripting reads past logs | story 4 (#206) AC1 | Built |',
  '| D-7 | export to PDF | Out of scope — the owner wants it in a later Feature | |',
].join('\n');

function tmp(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'source-lines-'));
  const out = {};
  for (const [name, content] of Object.entries(files)) {
    out[name] = path.join(dir, name);
    fs.writeFileSync(out[name], content);
  }
  return out;
}

function run(args) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout + r.stderr };
}

// ── read ─────────────────────────────────────────────────────────────

test('Read_TicketWithSourceRequirements_PrintsSourceCoverageAndEveryLine', () => {
  const f = tmp({ 'ticket.md': TICKET });
  const r = run(['read', f['ticket.md']]);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^source: docs\/weekly-review-design\.md$/m);
  assert.match(r.out, /^coverage: tasks\/coverage\/weekly-review-design\.md$/m);
  assert.match(r.out, /^line \[D-5b\.3\] who engages: change from last month$/m);
  assert.match(r.out, /^line \[D-5b\.4\] goal not reached → goal-hitters side by side$/m);
});

test('Read_TicketNamingADocWithoutLines_PrintsDocWithoutLines', () => {
  const f = tmp({ 'ticket.md': '## Item\n**Title:** Weekly review part 3\n\nDesign: docs/weekly-review-design.md\n' });
  const r = run(['read', f['ticket.md']]);
  assert.equal(r.code, 0, r.out);
  assert.equal(r.out.trim(), 'doc-without-lines: docs/weekly-review-design.md');
});

test('Read_PlainTicket_PrintsNone', () => {
  const f = tmp({ 'ticket.md': '## Item\nAdd dark mode to settings.\n' });
  const r = run(['read', f['ticket.md']]);
  assert.equal(r.code, 0, r.out);
  assert.equal(r.out.trim(), 'none');
});

test('Read_LineWithoutAnId_FailsNamingTheLine', () => {
  const f = tmp({ 'ticket.md': TICKET.replace('- [D-5b.4] goal', '- goal') });
  const r = run(['read', f['ticket.md']]);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /^bad line: "- goal not reached/m);
});

test('Read_SectionInsideACodeFence_IsIgnored', () => {
  const f = tmp({ 'ticket.md': '```\n## Source requirements\n- [X1] fenced example\n```\n' });
  const r = run(['read', f['ticket.md']]);
  assert.equal(r.code, 0, r.out);
  assert.equal(r.out.trim(), 'none');
});

// ── compare ──────────────────────────────────────────────────────────

test('Compare_EveryLineCarriedVerbatim_PlanAddsCriteria_ExitsZero', () => {
  const f = tmp({ 'ticket.md': TICKET, 'test-strategy.md': STRATEGY });
  const r = run(['compare', f['ticket.md'], f['test-strategy.md']]);
  assert.equal(r.code, 0, r.out);
  assert.equal(r.out, '');
});

test('Compare_LineDropped_FailsNamingIt', () => {
  const dropped = STRATEGY.replace(/2\. \[D-5b\.4\][\s\S]*?(?=3\. )/, '');
  const f = tmp({ 'ticket.md': TICKET, 'test-strategy.md': dropped });
  const r = run(['compare', f['ticket.md'], f['test-strategy.md']]);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /^missing \[D-5b\.4\]/m);
});

test('Compare_LineNarrowedInTheCriterion_FailsAsChanged', () => {
  const narrowed = STRATEGY.replace('1. [D-5b.3] who engages: change from last month', '1. [D-5b.3] who engages');
  const f = tmp({ 'ticket.md': TICKET, 'test-strategy.md': narrowed });
  const r = run(['compare', f['ticket.md'], f['test-strategy.md']]);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /^changed \[D-5b\.3\]: .*source says "who engages: change from last month"/m);
});

test('Compare_WhitespaceAndWrappingQuotesDiffer_StillVerbatim', () => {
  const quoted = STRATEGY.replace('1. [D-5b.3] who engages: change from last month', '1. [D-5b.3]   "who engages:  change from last month."');
  const f = tmp({ 'ticket.md': TICKET, 'test-strategy.md': quoted });
  const r = run(['compare', f['ticket.md'], f['test-strategy.md']]);
  assert.equal(r.code, 0, r.out);
});

test('Compare_CriterionTaggedWithAnIdNotInTheSource_Fails', () => {
  const extra = STRATEGY.replace('3. The panel loads', '3. [D-99] The panel loads');
  const f = tmp({ 'ticket.md': TICKET, 'test-strategy.md': extra });
  const r = run(['compare', f['ticket.md'], f['test-strategy.md']]);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /^unknown \[D-99\]/m);
});

test('Compare_TicketWithNoSourceLines_NothingToCompare_ExitsZero', () => {
  const f = tmp({ 'ticket.md': '## Item\nAdd dark mode.\n', 'test-strategy.md': STRATEGY.replace(/\[D-5b\.\d\] /g, '') });
  const r = run(['compare', f['ticket.md'], f['test-strategy.md']]);
  assert.equal(r.code, 0, r.out);
});

// ── coverage ─────────────────────────────────────────────────────────

test('Coverage_EveryRowMapped_ExitsZero', () => {
  const f = tmp({ 'coverage.md': COVERAGE });
  const r = run(['coverage', f['coverage.md']]);
  assert.equal(r.code, 0, r.out);
});

test('Coverage_UnmappedRow_FailsNamingIt', () => {
  const f = tmp({ 'coverage.md': COVERAGE.replace('| story 4 (#206) AC1 |', '| TBD |') });
  const r = run(['coverage', f['coverage.md']]);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /^unmapped \[D-6\]/m);
});

test('Coverage_OutOfScopeWithoutAReason_Fails', () => {
  const f = tmp({ 'coverage.md': COVERAGE.replace('Out of scope — the owner wants it in a later Feature', 'Out of scope') });
  const r = run(['coverage', f['coverage.md']]);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /^out-of-scope without a reason \[D-7\]/m);
});

test('Coverage_DuplicateId_Fails', () => {
  const f = tmp({ 'coverage.md': COVERAGE + '\n| D-6 | scripting reads past logs again | story 5 | |' });
  const r = run(['coverage', f['coverage.md']]);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /^duplicate \[D-6\]/m);
});

test('Coverage_NoTable_Fails', () => {
  const f = tmp({ 'coverage.md': '# Coverage\nnothing here\n' });
  const r = run(['coverage', f['coverage.md']]);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /no coverage table/);
});

test('Coverage_EscapedPipeInsideARequirement_IsOneCell', () => {
  const f = tmp({ 'coverage.md': COVERAGE.replace('export to PDF', 'export to PDF \\| CSV') });
  const r = run(['coverage', f['coverage.md']]);
  assert.equal(r.code, 0, r.out);
});

// ── audit ────────────────────────────────────────────────────────────

test('Audit_EveryInScopeRowBuilt_PrintsComplete', () => {
  const f = tmp({ 'coverage.md': COVERAGE });
  const r = run(['audit', f['coverage.md']]);
  assert.equal(r.code, 0, r.out);
  assert.equal(r.out.trim(), 'complete');
});

test('Audit_PartlyAndMissingRows_FailListingEach', () => {
  const f = tmp({ 'coverage.md': COVERAGE.replace('AC2 | Built |', 'AC2 | Partly |').replace('(#206) AC1 | Built |', '(#206) AC1 | Missing |') });
  const r = run(['audit', f['coverage.md']]);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /^open \[D-5b\.4\]: Partly$/m);
  assert.match(r.out, /^open \[D-6\]: Missing$/m);
});

test('Audit_InScopeRowNotYetAudited_FailsAsUnaudited', () => {
  const f = tmp({ 'coverage.md': COVERAGE.replace('(#206) AC1 | Built |', '(#206) AC1 | |') });
  const r = run(['audit', f['coverage.md']]);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /^unaudited \[D-6\]$/m);
});

test('Audit_ItemsFilter_ChecksOnlyRowsMappedToThoseItems', () => {
  const f = tmp({ 'coverage.md': COVERAGE.replace('(#206) AC1 | Built |', '(#206) AC1 | Missing |') });
  const only205 = run(['audit', f['coverage.md'], '--items', '205']);
  assert.equal(only205.code, 0, only205.out);
  const only206 = run(['audit', f['coverage.md'], '--items', '206']);
  assert.equal(only206.code, 1, only206.out);
  assert.match(only206.out, /^open \[D-6\]: Missing$/m);
});

// ── usage ────────────────────────────────────────────────────────────

test('Usage_UnknownCommand_ExitsTwo', () => {
  const r = run(['nonsense']);
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /usage:/);
});

// ── Feature plan (F72 #77): compare reads only the named story's section ────────────────────────

const FEATURE_PLAN = [
  '## Story order',
  '1. #205 then #206',
  '',
  '## Story #205 — Weekly review panel',
  '',
  '**Acceptance criteria and their proofs:**',
  '1. [D-5b.3] who engages: change from last month',
  '   - Proof: integration — Review_Engagers_ShowsMonthOverMonth',
  '   - Seen by: GET /api/review',
  '   - Would lie if: one month seeded',
  '2. [D-5b.4] goal not reached → goal-hitters side by side',
  '   - Proof: e2e — review.spec.ts',
  '   - Seen by: screenshot',
  '   - Would lie if: goal always reached',
  '',
  '## Story #206 — Scripting',
  '',
  '**Acceptance criteria and their proofs:**',
  '1. [D-6] scripting reads past logs',
  '   - Proof: unit — Scripting_ReadsLogs',
  '   - Seen by: test output',
  '   - Would lie if: the log is empty',
  '',
].join('\n');

test('Compare_FeaturePlanStorySection_OnlyThatStory', () => {
  const f = tmp({ 'ticket.md': TICKET, 'plan.md': FEATURE_PLAN });
  const ok = run(['compare', f['ticket.md'], f['plan.md'], '--story', '205']);
  assert.equal(ok.code, 0, ok.out);
  assert.equal(ok.out, '');

  // The line sits in another story's section only: story 205's section must be reported as dropping it.
  const moved = FEATURE_PLAN.replace(/2\. \[D-5b\.4\][\s\S]*?(?=\n## Story #206)/, '')
    .replace('1. [D-6] scripting reads past logs', '1. [D-6] scripting reads past logs\n2. [D-5b.4] goal not reached → goal-hitters side by side');
  const g = tmp({ 'ticket.md': TICKET, 'plan.md': moved });
  const bad = run(['compare', g['ticket.md'], g['plan.md'], '--story', '205']);
  assert.equal(bad.code, 1, bad.out);
  assert.match(bad.out, /^missing \[D-5b\.4\]/m);
});
