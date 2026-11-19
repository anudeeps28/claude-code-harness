// Doc-consistency probe for F6 #53 "A Feature review that catches cross-story defects": the four
// reviewers' new checks (#54–#57), loosened-reviewer-agent and a model per panel agent (#58), the
// Feature panel (#59), and Prove it with the PR gate (#60). The scripts these instructions call have
// their own behaviour tests (panel-checks, pr-gate, worktree).

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const readOwn = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8').replace(/\r/g, '');
const readReadme = () => fs.readFileSync(path.join(REPO_ROOT, 'README.md'), 'utf8').replace(/\r/g, '');
const { readRequired } = require('../bin/startup-check.js');

const IMPLEMENT = readOwn('SKILL.md');
// What each agent's own file says (the four reviewers' checks, the evaluator's parts, the prover's report)
// is asserted in agents/__tests__/agent-text-feature-review.test.js: an agent's own text is checked there.

function section(content, heading) {
  const lines = content.split('\n');
  const start = lines.findIndex((l) => l.startsWith(heading));
  if (start === -1) return null;
  const level = heading.match(/^#+/)[0].length;
  let inFence = false;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith('```')) inFence = !inFence;
    else if (!inFence) {
      const h = lines[i].match(/^(#+) /);
      if (h && h[1].length <= level) { end = i; break; }
    }
  }
  return lines.slice(start, end).join('\n');
}

function mustMatch(content, re, message) { assert.ok(content && re.test(content), message); }


test('CoverageAuditor_StaysOpus', () => {
  // The agent file's own model line is asserted in agents/__tests__/agent-text-feature-review.test.js.
  const rows = IMPLEMENT.split('\n').filter((l) => /^\| `coverage-auditor-agent` \|/.test(l));
  assert.equal(rows.length, 1, 'one table row for the auditor');
  assert.ok(/\| opus \|$/.test(rows[0].trim()), 'its table row says opus');
});

// ── #58 loosened-reviewer-agent and models ───────────────────────────

test('Loosened_IsANamedRegisteredAgentOnTheFasterModel', () => {
  // The agent's own file is asserted in agents/__tests__/agent-text-feature-review.test.js, and the installer's
  // required list in install/__tests__/required-agents.test.js.
  const required = readRequired().filter((r) => r.kind === 'agent').map((r) => r.name);
  assert.ok(required.includes('loosened-reviewer-agent'), 'the startup check names it');
  mustMatch(readReadme(), /`loosened-reviewer-agent` \| sonnet/, 'README lists it');
});

test('Models_EveryPanelAgentStatesOneAndThePanelPassesThem', () => {
  // Each agent's own model line is asserted in agents/__tests__/agent-text-feature-review.test.js.
  const panel = section(IMPLEMENT, '### The Feature panel');
  assert.ok(panel, 'expected "### The Feature panel"');
  assert.deepStrictEqual(panelProblems(panel), [], 'the panel passes each of its seven checks the factory\'s model');
});

// The seven panel checks and the model each runs on (the factory's table). A key is the agent, plus
// ":<part>" for the evaluator's parts.
const PANEL_EXPECTED = new Map([
  ['security-reviewer-agent', 'opus'],
  ['architect-reviewer-agent', 'opus'],
  ['acceptance-test-agent', 'opus'],
  ['evaluator-agent:made-false', 'opus'],
  ['evaluator-agent:complexity', 'sonnet'],
  ['evaluator-agent:dead-code', 'sonnet'],
  ['loosened-reviewer-agent', 'sonnet'],
]);
// → the panel table's rows, derived by scanning for "| `agent`[, part `p`] | `model` |" lines.
function panelRows(panel) {
  const rows = [];
  for (const line of panel.split('\n')) {
    const m = line.match(/^\s*\|\s*`([^`]+)`(?:,\s*part\s*`([^`]+)`)?\s*\|\s*`(opus|sonnet|haiku)`\s*\|/);
    if (m) rows.push({ key: m[2] ? `${m[1]}:${m[2]}` : m[1], model: m[3], line });
  }
  return rows;
}
// → problems: a row missing, a row on the wrong model (right agent, wrong model), a duplicate, an extra.
function panelProblems(panel) {
  const rows = panelRows(panel);
  const bad = [];
  for (const [key, model] of PANEL_EXPECTED) {
    const mine = rows.filter((r) => r.key === key);
    if (mine.length === 0) bad.push(`${key}: no row`);
    else if (mine.length > 1) bad.push(`${key}: ${mine.length} rows`);
    else if (mine[0].model !== model) bad.push(`${key}: row says ${mine[0].model}, expected ${model}`);
  }
  for (const r of rows) if (!PANEL_EXPECTED.has(r.key)) bad.push(`${r.key}: not one of the seven`);
  return bad;
}
const PLANTED_PANEL = [
  '| Agent | Model | Also gets |', '|---|---|---|',
  '| `security-reviewer-agent` | `opus` | — |',
  '| `architect-reviewer-agent` | `opus` | — |',
  '| `acceptance-test-agent` | `opus` | x |',
  '| `evaluator-agent`, part `made-false` | `opus` | — |',
  '| `evaluator-agent`, part `complexity` | `sonnet` | x |',
  '| `evaluator-agent`, part `dead-code` | `sonnet` | — |',
  '| `loosened-reviewer-agent` | `sonnet` | — |',
].join('\n');

test('Panel_SevenChecksInOneMessageWithTheirModels', () => {
  assert.deepStrictEqual(panelProblems(PLANTED_PANEL), [], 'the checker accepts the intended seven rows');
  assert.ok(panelProblems(PLANTED_PANEL.replace('`evaluator-agent`, part `complexity` | `sonnet`', '`evaluator-agent`, part `complexity` | `opus`')).length > 0, 'complexity on opus (right agent, wrong model) must be rejected');
  assert.ok(panelProblems(PLANTED_PANEL.replace('`loosened-reviewer-agent` | `sonnet`', '`loosened-reviewer-agent` | `opus`')).length > 0, 'loosened on opus must be rejected');
  assert.ok(panelProblems(PLANTED_PANEL.replace('part `dead-code`', 'part `list`')).length > 0, 'the old `list` part must be rejected');
  assert.ok(panelProblems(`${PLANTED_PANEL}\n| \`story-executor-agent\` | \`sonnet\` | — |`).length > 0, 'an eighth row must be rejected');
  assert.ok(panelProblems(PLANTED_PANEL.split('\n').filter((l) => !l.includes('made-false')).join('\n')).length > 0, 'a missing row must be rejected');

  const panel = section(IMPLEMENT, '### The Feature panel');
  assert.ok(panel, 'expected "### The Feature panel"');
  const rows = panelRows(panel);
  assert.equal(rows.length, 7, 'companion: the panel table has seven rows');
  assert.deepStrictEqual(panelProblems(panel), [], 'AC1: the seven rows, each with its model');
  mustMatch(panel, /all seven checks in one message, each in the foreground/, 'one message, foreground');
  mustMatch(panel, /seven calls/, 'says seven calls');
  assert.doesNotMatch(panel, /five reviewers/, 'no "five reviewers" left');
  const acceptance = rows.find((r) => r.key === 'acceptance-test-agent');
  mustMatch(acceptance && acceptance.line, /plan\.md[^\n]*F\.<n>/, 'acceptance gets the Feature plan.md and F.<n>');
});

// ── the panel's fix loop ─────────────────────────────────────────────

// Step 6 of the panel: from the line starting "6. " to the end of the section.
const fixStep = (panel) => { const m = panel.match(/\n6\. [\s\S]*$/); return m ? m[0] : ''; };
const DIMENSION_MAP = [
  [/endpoint/, 'security'], [/migration/, 'architect'], [/test or (?:a )?criterion/, 'acceptance'],
  [/code shape/, 'complexity'], [/any code/, 'dead-code'], [/label/, 'made-false'], [/skip/, 'loosened'],
];
// → problems for a fix-loop text: the builder, suite-runner re-run, the commit, and each trigger
// pointing at its own dimension (a swapped pair is caught, not just the words).
function fixLoopProblems(step) {
  const f = step.replace(/\s+/g, ' ');
  const bad = [];
  if (!/`story-builder`/.test(f)) bad.push('no story-builder');
  if (!/`suite-runner`/.test(f)) bad.push('no suite-runner re-run');
  if (!/refactor: address review findings for Feature #<fid>/.test(f)) bad.push('no fix commit message');
  if (!/test-first when test-first mode is on/.test(f)) bad.push('not test-first when the mode is on');
  for (const [trigger, dim] of DIMENSION_MAP) {
    const re = new RegExp(`${trigger.source}[^;→]{0,40}→\\s*(?:evaluator )?\`?${dim}\`?(?![\\w-])`);
    if (!re.test(f)) bad.push(`${trigger.source} does not lead to ${dim}`);
  }
  if (/story-executor-agent|fix-plan\.md|\bwaves?\b/.test(f)) bad.push('still fixes by executor waves / fix-plan.md');
  return bad;
}

test('Panel_FixesByStoryBuilderSuiteRunnerReRunsOnlyTouchedDimensions', () => {
  const GOOD = '\n6. **The fix loop.** `story-builder` (model: `sonnet`), test-first when test-first mode is on; `suite-runner` re-runs the suites; commit `refactor: address review findings for Feature #<fid>`. Re-review: an endpoint, auth or config → security; a migration, a boundary → architect; a test or a criterion → acceptance; code shape → complexity; any code → dead-code; a doc, comment or label → made-false; a skip, a gate or a baseline → loosened.';
  assert.deepStrictEqual(fixLoopProblems(GOOD), [], 'the checker accepts the intended text');
  assert.ok(fixLoopProblems(GOOD.replace('any code → dead-code', 'any code → complexity').replace('code shape → complexity', 'code shape → dead-code')).length > 0, 'swapped complexity / dead-code must be rejected');
  assert.ok(fixLoopProblems(GOOD.replace('`story-builder`', '`story-executor-agent` waves in fix-plan.md')).length > 0, 'executor waves must be rejected');
  assert.ok(fixLoopProblems(GOOD.replace('`suite-runner` re-runs the suites', 'the build is re-run')).length > 0, 'no suite-runner must be rejected');

  const panel = section(IMPLEMENT, '### The Feature panel');
  assert.ok(panel, 'expected "### The Feature panel"');
  const step = fixStep(panel);
  assert.ok(step.length > 0, 'companion: the panel has a step 6');
  assert.deepStrictEqual(fixLoopProblems(step), [], 'AC3: the fix loop goes through story-builder and suite-runner and re-runs only the touched dimensions');
  const step1 = (panel.match(/\n1\. [\s\S]*?(?=\n2\. )/) || [''])[0];
  mustMatch(step1, /`suite-runner`/, 'step 1 (build and tests) runs through suite-runner');
  assert.doesNotMatch(panel, /story-executor-agent|fix-plan\.md/, 'the panel has no executor waves and no fix-plan.md');
  mustMatch(panel, /Re-review only what changed/, 'partial re-review');
});

test('ProveIt_ProverReportLines_AreTheGatesOwnVocabulary', () => {
  // The prover's report lines are matched against the gate's pattern in agents/__tests__/agent-text-feature-review.test.js.
  const prove = section(IMPLEMENT, '### Prove it').replace(/\s+/g, ' ');
  mustMatch(prove, /[Tt]he prover's lines go into the gate list as they are/, 'SKILL.md step 6: the prover lines are copied verbatim');
});

test('ProveIt_BriefsNameWhatEachCalleeNeeds', () => {
  const prove = section(IMPLEMENT, '### Prove it').replace(/\s+/g, ' ');
  const call = (re, msg) => mustMatch(prove, re, msg);
  call(/`prover` \(job `prove`, model: `sonnet`\)[^.]{0,400}Feature's `plan\.md`/, 'the prover brief names the Feature plan.md');
  call(/Proof[^.]{0,80}Seen by[^.]{0,80}Would lie if/, 'and says the three lines live there');
  call(/job `diagnose` \(model: `opus`\)[^.]{0,300}criterion's id[^.]{0,200}three records/, 'the diagnose brief names the criterion id and its three records');
  call(/`story-builder` \(job `fix`, model: `sonnet`\)[\s\S]{0,500}reference\/test-rules\.md/, 'the fix call says job fix and passes test-rules.md');
  const panel = section(IMPLEMENT, '### The Feature panel').replace(/\s+/g, ' ');
  mustMatch(panel, /`story-builder`\s+\(job `fix`, model: `sonnet`\)[\s\S]{0,500}reference\/test-rules\.md/, 'the panel fix loop says job fix and passes test-rules.md');
  // The prover's own file (its brief gives the Feature plan.md path) is asserted in agents/__tests__/agent-text-feature-review.test.js.
});

test('ProveIt_ProverOnSonnet_DiagnosisOnOpus', () => {
  const rowsOk = (text) => {
    const rows = text.split('\n').filter((l) => /^\| `prover` \|/.test(l));
    const diagnose = rows.filter((l) => /diagnos/.test(l));
    const others = rows.filter((l) => !/diagnos/.test(l));
    return rows.length === 2 && diagnose.length === 1 && /\| opus \|$/.test(diagnose[0].trim()) && others.length === 1 && /\| sonnet \|$/.test(others[0].trim());
  };
  assert.ok(!rowsOk('| `prover` | proofs | opus |\n| `prover` | diagnose | sonnet |'), 'prover on opus by default and sonnet for diagnosis must be rejected');
  const table = section(IMPLEMENT, '## Which model each job runs on');
  assert.ok(table, 'the model table exists');
  assert.ok(rowsOk(table), 'AC5: the model table has `prover` on sonnet, and a diagnose row on opus');

  // The prover's own file is asserted in agents/__tests__/agent-text-feature-review.test.js.
  const prove = section(IMPLEMENT, '### Prove it');
  assert.ok(prove, 'expected "### Prove it"');
  const f = prove.replace(/\s+/g, ' ');
  mustMatch(f, /`prover`[^.]{0,200}model: `sonnet`/, 'Prove it calls prover with model sonnet');
  mustMatch(f, /`prover`[^.]{0,120}job `diagnose`[^.]{0,120}model: `opus`/, 'judging a failure is a prover call in job diagnose on opus');
  mustMatch(f, /worktree\.js" scratch/, 'the main session still runs the scratch copy');
  mustMatch(f, /prove-it\.md/, 'and still writes prove-it.md');

  assert.ok(readRequired().filter((r) => r.kind === 'agent').map((r) => r.name).includes('prover'), 'the startup check names prover');
  // The installer's required list is asserted in install/__tests__/required-agents.test.js.
  const readme = readReadme();
  mustMatch(readme, /`prover` \| sonnet \|/, 'README lists prover on sonnet');
  const count = fs.readdirSync(path.join(REPO_ROOT, 'agents')).filter((n) => n.endsWith('.md')).length;
  mustMatch(readme, new RegExp(`\\b${count} agents\\b`), `README states the agent count (${count})`);
});

// ── #59 the Feature panel ────────────────────────────────────────────

test('Panel_SevenChecksInOneMessageOnTheFeatureBranch', () => {
  const panel = section(IMPLEMENT, '### The Feature panel');
  assert.ok(panel, 'expected "### The Feature panel"');
  mustMatch(panel, /all seven checks in one message, each in the foreground/, 'one message, foreground');
  mustMatch(panel, /<base>\.\.\.feature\/<fid>/, 'on <base>...feature/<fid>');
  mustMatch(panel, /Commit first, then leave the tree alone/, 'commit first');
  mustMatch(panel, /No file in the Feature worktree changes until the\s+last has returned/, 'hold edits while they read');
  mustMatch(panel, /panel-head/, 'the commit read is recorded and re-checked');
  mustMatch(panel, /Re-review only what changed/, 'partial re-review');
  mustMatch(panel, /independently[\s\S]{0,100}weight\s+it up/, 'two independent findings are weighted up');
  mustMatch(panel, /two defensible\s+forms[\s\S]{0,600}stops under `--autonomous` too/, 'a finding that is not ours goes to the person');
  mustMatch(panel, /test-first when test-first mode\s+is on/, 'fixes are test-first when the mode is on');
  mustMatch(IMPLEMENT, /`done` → every story is committed: go to \*\*The Feature panel\*\*/, 'done leads to the panel');
});

// ── #60 Prove it and the PR gate ─────────────────────────────────────

test('ProveIt_RealSystemSecondCaseBreakOneLine_InAScratchCopy', () => {
  const prove = section(IMPLEMENT, '### Prove it');
  assert.ok(prove, 'expected "### Prove it"');
  mustMatch(prove, /worktree\.js" scratch/, 'a scratch copy');
  mustMatch(prove, /worktree\.js" remove-scratch/, 'removed only when clean');
  mustMatch(prove, /intended[\s\S]{0,40}built[\s\S]{0,40}observed/i, 'intended, built, observed');
  mustMatch(prove, /If the Feature makes a tool/, 'a tool runs on a second case');
  mustMatch(prove, /Break it once/, 'break one line');
  mustMatch(prove, /broke: green/, 'a test that stays green is recorded');
  mustMatch(prove, /Shape only/, 'evidence by shape only');
  mustMatch(prove, /No blind re-runs/, 'diagnose from evidence');
});

test('Gate_NoPRUntilPrGateOpens_OnlyAPersonDefers', () => {
  const gate = section(IMPLEMENT, '### The PR gate');
  assert.ok(gate, 'expected "### The PR gate"');
  mustMatch(gate, /pr-gate\.js" --feature <fid>/, 'the gate runs pr-gate.js');
  mustMatch(gate, /gate: open/, 'open leads to the PR');
  mustMatch(gate, /Only a person defers a criterion/, 'only a person defers');
  mustMatch(gate, /--autonomous` too this is a stop/, 'not self-answered');
  mustMatch(gate, /create-issue\.sh/, 'a deferral is a tracker item');
  const pr = section(IMPLEMENT, '### The Feature\'s PR');
  assert.doesNotMatch(pr, /come in a\s+later Feature \(F6\)/, 'the F4 placeholder is gone');
  mustMatch(pr, /Costs money or changes operations/, 'the PR carries the loosened review\'s list');
});
