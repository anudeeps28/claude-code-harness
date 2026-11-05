// Doc-consistency probe for F6 #53 "A Feature review that catches cross-story defects": the four
// reviewers' new checks (#54–#57), loosened-reviewer-agent and a model per panel agent (#58), the
// Feature panel (#59), and Prove it with the PR gate (#60). The scripts these instructions call have
// their own behaviour tests (panel-checks, pr-gate, worktree).

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const read = (...p) => fs.readFileSync(path.join(REPO_ROOT, ...p), 'utf8').replace(/\r/g, '');
const { readRequired } = require('../bin/startup-check.js');
const { GATE_LINE } = require('../bin/pr-gate.js');

const IMPLEMENT = read('skills', 'implement', 'SKILL.md');
const SECURITY = read('agents', 'security-reviewer-agent.md');
const ARCHITECT = read('agents', 'architect-reviewer-agent.md');
const ACCEPTANCE = read('agents', 'acceptance-test-agent.md');
const EVALUATOR = read('agents', 'evaluator-agent.md');

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
const modelOf = (text) => (text.match(/^model: (\S+)$/m) || [])[1];

// ── #54 security ─────────────────────────────────────────────────────

test('Security_ReachabilityPerEnvironment_NoLoginInProdIsABlock', () => {
  mustMatch(SECURITY, /Who can reach it once deployed/, 'the reachability check exists');
  mustMatch(SECURITY, /per environment/i, 'stated per environment');
  mustMatch(SECURITY, /no login that is\s+reachable in prod is a BLOCK finding, never a note/, 'an open prod endpoint is a BLOCK');
  mustMatch(SECURITY, /Fixture Findings/, 'fixtures are read as evidence');
});

test('Security_BuiltInSecurityReviewRunsFromTheWorkFolderOrSaysWhyNot', () => {
  mustMatch(SECURITY, /cd "<work folder>" && claude -p "\/security-review"/, 'the built-in runs headless from the work folder');
  mustMatch(SECURITY, /Proven, not assumed/, 'the spike result is recorded in the agent');
  mustMatch(SECURITY, /Never skip it silently/, 'never skipped silently');
  mustMatch(SECURITY, /unavailable: <why>/, 'the report says when it was unavailable');
  assert.doesNotMatch(read('ARCHITECTURE.md'), /Not yet proven:\*\* whether the built-in respects/, 'ARCHITECTURE.md §2 #9 carries the answer');
});

// ── #55 architect ────────────────────────────────────────────────────

test('Architect_MigrationsCheckedAgainstAnExistingDatabase', () => {
  mustMatch(ARCHITECT, /Does it work on a database that already exists\?/, 'the check exists');
  mustMatch(ARCHITECT, /migration-check\.js" --base <base>/, 'it runs migration-check.js');
  mustMatch(ARCHITECT, /never assume one/i, 'the ledger convention is read, not assumed');
  mustMatch(ARCHITECT, /Migrate forward:/, 'forward migration comes from lessons/notes');
  mustMatch(ARCHITECT, /could not migrate forward/, 'otherwise it says it could not');
  for (const t of ['templates/tasks/lessons.md', 'templates/tasks-solo/notes.md']) {
    mustMatch(read(...t.split('/')), /^- Migrate forward: `/m, `${t} has the Migrate forward line`);
  }
});

// ── #56 acceptance ───────────────────────────────────────────────────

test('Acceptance_AsksWhetherEachTestCouldLie', () => {
  mustMatch(ACCEPTANCE, /Could the test pass with the criterion unmet\?/, 'the step exists');
  mustMatch(ACCEPTANCE, /Would lie if/, 'it checks the plan\'s "Would lie if" line');
  mustMatch(ACCEPTANCE, /carried over from other or closed stories/i, 'carried-over criteria are verified');
  mustMatch(ACCEPTANCE, /claims-check\.js/, 'it runs the claims scan');
  mustMatch(ACCEPTANCE, /\| Could it pass unmet\? \|/, 'the report has the column');
});

// ── #57 evaluator ────────────────────────────────────────────────────

// The evaluator's Part inputs, as one bullet per part: "- `<part>` — ... Steps 1, 4 and 5.5 ...".
// Returns Map part -> { text, steps } where steps is the set of step numbers the bullet names after
// "Step(s)" (a list of numbers joined by commas / "and").
function evaluatorParts(text) {
  const parts = new Map();
  const inputs = section(text, '## Inputs') || '';
  let cur = null;
  for (const l of inputs.split('\n')) {
    const m = l.match(/^\s*- `([a-z-]+)` — /);
    if (m) { cur = m[1]; parts.set(cur, l); continue; }
    if (cur && /^\s{4,}\S/.test(l)) parts.set(cur, `${parts.get(cur)} ${l.trim()}`); else cur = null;
  }
  const out = new Map();
  for (const [name, bullet] of parts) {
    const m = bullet.match(/Steps? (\d+(?:\.\d+)?(?:(?:,| and|, and) \d+(?:\.\d+)?)*)/);
    out.set(name, { text: bullet, steps: m ? new Set(m[1].match(/\d+(?:\.\d+)?/g)) : new Set() });
  }
  return out;
}
const EVALUATOR_PARTS = {
  complexity: ['1', '4', '4.5', '5', '5.5'],
  'dead-code': ['1', '5.6'],
  'made-false': ['1', '5.7'],
};
const sameSet = (a, list) => a.size === list.length && list.every((x) => a.has(x));
// → problems; empty means the three parts exist with exactly their steps, complexity runs no build,
// and no other part (the old `list`) is left.
function evaluatorPartProblems(text) {
  const parts = evaluatorParts(text);
  const bad = [];
  for (const [name, steps] of Object.entries(EVALUATOR_PARTS)) {
    const p = parts.get(name);
    if (!p) { bad.push(`part ${name} missing`); continue; }
    if (!sameSet(p.steps, steps)) bad.push(`${name} names steps ${[...p.steps].join(', ') || 'none'}, expected ${steps.join(', ')}`);
  }
  const c = parts.get('complexity');
  if (c && !/No build/.test(c.text)) bad.push('complexity does not say "No build" (suite-runner ran the build and tests)');
  for (const name of parts.keys()) if (!(name in EVALUATOR_PARTS)) bad.push(`unexpected part ${name}`);
  return bad;
}

test('Evaluator_ComplexityDeadCodeMadeFalse_ThreeParts', () => {
  const GOOD = [
    '## Inputs', '',
    '- **Part** (optional, Feature panel only) —',
    '  - `complexity` — Steps 1, 4, 4.5, 5 and 5.5. No build or tests: suite-runner ran them.',
    '  - `dead-code` — Steps 1 and 5.6.',
    '  - `made-false` — Steps 1 and 5.7.', '',
    '## Next',
  ].join('\n');
  assert.deepStrictEqual(evaluatorPartProblems(GOOD), [], 'the checker accepts the intended text');
  // planted opposites: right part names, wrong steps; a build in complexity; the old list part
  assert.ok(evaluatorPartProblems(GOOD.replace('`made-false` — Steps 1 and 5.7', '`made-false` — Steps 1, 5.6 and 5.7')).length > 0, 'made-false that also runs the dead-code list must be rejected');
  assert.ok(evaluatorPartProblems(GOOD.replace('`dead-code` — Steps 1 and 5.6', '`dead-code` — Steps 1, 2, 3 and 5.6')).length > 0, 'dead-code that runs the build and tests must be rejected');
  assert.ok(evaluatorPartProblems(GOOD.replace('No build or tests: suite-runner ran them.', 'Runs the build.')).length > 0, 'complexity without "No build" must be rejected');
  assert.ok(evaluatorPartProblems(GOOD.replace('  - `dead-code`', '  - `list` — Steps 1 and 5.6.\n  - `dead-code`')).length > 0, 'a leftover `list` part must be rejected');

  const parts = evaluatorParts(EVALUATOR);
  assert.ok(parts.size > 0, 'companion: the evaluator must declare its parts as bullets under ## Inputs');
  assert.deepStrictEqual(evaluatorPartProblems(EVALUATOR), [], 'AC2: the evaluator has exactly the parts complexity, dead-code and made-false, each with its steps');
  mustMatch(EVALUATOR, /## Step 5\.5 — Complexity/, 'complexity step');
  mustMatch(EVALUATOR, /exactly one caller/, 'one-caller abstractions');
  mustMatch(EVALUATOR, /## Step 5\.6 — Dead code: the list/, 'mechanical dead-code list');
  mustMatch(EVALUATOR, /## Step 5\.7 — Dead code: what did this change make false\?/, 'the made-false question');
  mustMatch(EVALUATOR, /With no part given, run every step/, 'standalone Phase 3 runs everything');
  assert.equal(modelOf(EVALUATOR), 'opus', 'the file stays opus');
});

test('CoverageAuditor_StaysOpus', () => {
  const text = read('agents', 'coverage-auditor-agent.md');
  assert.equal(modelOf(text), 'opus', 'AC4: coverage-auditor-agent stays model: opus');
  assert.ok(modelOf('---\nmodel: sonnet\n---') !== 'opus', 'a sonnet file is told apart from opus');
  const rows = read('skills', 'implement', 'SKILL.md').split('\n').filter((l) => /^\| `coverage-auditor-agent` \|/.test(l));
  assert.equal(rows.length, 1, 'one table row for the auditor');
  assert.ok(/\| opus \|$/.test(rows[0].trim()), 'its table row says opus');
});

// ── #58 loosened-reviewer-agent and models ───────────────────────────

test('Loosened_IsANamedRegisteredAgentOnTheFasterModel', () => {
  const text = read('agents', 'loosened-reviewer-agent.md');
  mustMatch(text, /^name: loosened-reviewer-agent$/m, 'agent name');
  assert.equal(modelOf(text), 'sonnet');
  mustMatch(text, /loosened-scan\.js/, 'it runs the scan');
  mustMatch(text, /no reason, no owner or no re-check is a finding/i, 'a missing reason, owner or re-check is a finding');
  mustMatch(text, /cost money or change operations/i, 'it lists operational cost');
  const required = readRequired().filter((r) => r.kind === 'agent').map((r) => r.name);
  assert.ok(required.includes('loosened-reviewer-agent'), 'the startup check names it');
  mustMatch(read('install', 'lib', 'updater.js'), /'agents\/loosened-reviewer-agent\.md'/, 'the installer requires it');
  mustMatch(read('README.md'), /`loosened-reviewer-agent` \| sonnet/, 'README lists it');
});

test('Models_EveryPanelAgentStatesOneAndThePanelPassesThem', () => {
  for (const a of ['security-reviewer-agent', 'architect-reviewer-agent', 'acceptance-test-agent', 'evaluator-agent']) {
    assert.equal(modelOf(read('agents', `${a}.md`)), 'opus', `${a} states the strongest model`);
  }
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

// The skip lines of the evaluator's steps, checked against each part's step list: a part runs a step
// unless that step's "Skip ..." line names it (or says "a part is given", which skips all three).
function evaluatorSkipProblems(text) {
  const bad = [];
  const steps = text.split(/^## Step /m).slice(1).map((b) => ({ n: b.match(/^(\d+(?:\.\d+)?)/)[1], body: b }));
  for (const [part, expected] of Object.entries(EVALUATOR_PARTS)) {
    const runs = [];
    for (const s of steps) {
      if (s.n === '6') continue;
      const skip = (s.body.match(/\*\*Skip[^*]*\*\*/) || [''])[0];
      const skipped = /a part is given/.test(skip) || skip.includes(`\`${part}\``);
      if (!skipped) runs.push(s.n);
    }
    if (!sameSet(new Set(runs), expected)) bad.push(`${part} runs steps ${runs.join(', ')} by its skip lines, expected ${expected.join(', ')}`);
  }
  return bad;
}

test('Evaluator_SkipLines_MatchEachPartsStepList', () => {
  assert.deepStrictEqual(evaluatorSkipProblems(EVALUATOR), [], 'the skip lines leave each part exactly its steps');
  const planted = EVALUATOR.replace('part is `complexity` or `made-false`.** Mechanical', 'part is `made-false`.** Mechanical');
  assert.notStrictEqual(planted, EVALUATOR, 'companion: the planted edit applied');
  assert.ok(evaluatorSkipProblems(planted).length > 0, 'a missing skip line (complexity would run the dead-code list) must be caught');
  const noBuildSkip = EVALUATOR.replace('**Skip when a part is given** (`complexity`, `dead-code` or `made-false`)', '(no skip)');
  assert.ok(evaluatorSkipProblems(noBuildSkip).length > 0, 'a part that would run the build must be caught');
});

test('Evaluator_PartReport_SaysNotRunPanelAndNeverClaimsGatesPassed', () => {
  const step6 = section(EVALUATOR, '## Step 6');
  assert.ok(step6, 'expected "## Step 6"');
  const flat = step6.replace(/\s+/g, ' ');
  mustMatch(flat, /With a part given[^|]{0,200}`not run \(panel\)`/, 'with a part, the Hard Gates rows may read "not run (panel)"');
  mustMatch(flat, /`CLEAR — <part> found nothing`/, 'with a part, the verdict line is part-aware');
  mustMatch(flat, /With a part given[^|]{0,300}never "hard gates passed"/, 'a part report never says hard gates passed');
  mustMatch(flat, /With a part given[^|]{0,300}never "Can this PR proceed\?"/, 'a part report never answers "Can this PR proceed?"');
  mustMatch(flat, /Without a part[^|]{0,200}unchanged|With no part given[^|]{0,200}unchanged/, 'without a part the template is unchanged');
});

test('ProveIt_ProverReportLines_AreTheGatesOwnVocabulary', () => {
  const report = section(read('agents', 'prover.md'), '## Your report');
  assert.ok(report, 'prover.md has "## Your report"');
  const lines = (text) => text.split('\n').filter((l) => /^- [A-Za-z0-9]+\.\d+:/.test(l));
  const rejected = (l) => !GATE_LINE.test(l);
  // planted wrong vocabulary: the old words, and a state the gate does not know
  assert.ok(rejected('- 201.1: partly met; broke: red — x'), 'the old "partly met" must be rejected');
  assert.ok(rejected('- 201.1: not met; broke: red — x'), 'the old "not met" must be rejected');
  assert.ok(rejected('- 201.1: met; break: red — x'), 'the old "break:" key must be rejected');
  assert.ok(!rejected('- 201.1: met; broke: red — x'), 'the gate takes a good line');

  const examples = lines(report);
  assert.ok(examples.length >= 4, `the prover's report shows example gate lines (got ${examples.length})`);
  for (const l of examples) assert.ok(GATE_LINE.test(l), `prover.md example must match pr-gate.js's own line pattern: ${l}`);
  const statuses = new Set(examples.map((l) => l.match(GATE_LINE)[2].toLowerCase()));
  for (const s of ['met', 'partly', 'not-met', 'needs-person']) assert.ok(statuses.has(s), `an example shows ${s}`);
  const needsPerson = examples.find((l) => /needs-person/.test(l));
  assert.equal(needsPerson.match(GATE_LINE)[4], 'n/a', 'a needs-person criterion reports broke: n/a');
  assert.doesNotMatch(report, /partly met|not met|\bbreak: red/, 'no old vocabulary left in the report section');

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
  const prover = read('agents', 'prover.md');
  mustMatch(prover, /Feature's `plan\.md`/, 'prover.md: the brief gives the Feature plan.md path');
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

  const file = read('agents', 'prover.md');
  mustMatch(file, /^name: prover$/m, 'agents/prover.md names itself prover');
  assert.equal(modelOf(file), 'sonnet', 'prover runs on sonnet');
  mustMatch(file, /second case/i, 'a tool is run on a second case');
  mustMatch(file, /[Bb]reak/, 'it breaks one line once');
  mustMatch(file, /scratch/i, 'in the scratch copy');
  mustMatch(file, /fixes nothing|does not fix|never fix/i, 'it fixes nothing');
  assert.doesNotMatch(file, /\[Dev\]|\[Prod\]/, 'the factory\'s [Dev]/[Prod] labels are stripped');
  assert.doesNotMatch(file, /video/i, 'no video requirement');
  mustMatch(file, /Your report starts with one line: `STATUS: DONE`, `STATUS: DONE_WITH_CONCERNS`, `STATUS: BLOCKED` or `STATUS: NEEDS_CONTEXT` \(`rules\/agent-handoff\.md`\)\./, 'the exact STATUS sentence');
  assert.doesNotMatch(file, /\bADO\b|Hydra|qa-environment|work-feature/, 'the factory\'s names are stripped');

  const prove = section(IMPLEMENT, '### Prove it');
  assert.ok(prove, 'expected "### Prove it"');
  const f = prove.replace(/\s+/g, ' ');
  mustMatch(f, /`prover`[^.]{0,200}model: `sonnet`/, 'Prove it calls prover with model sonnet');
  mustMatch(f, /`prover`[^.]{0,120}job `diagnose`[^.]{0,120}model: `opus`/, 'judging a failure is a prover call in job diagnose on opus');
  mustMatch(f, /worktree\.js" scratch/, 'the main session still runs the scratch copy');
  mustMatch(f, /prove-it\.md/, 'and still writes prove-it.md');

  assert.ok(readRequired().filter((r) => r.kind === 'agent').map((r) => r.name).includes('prover'), 'the startup check names prover');
  mustMatch(read('install', 'lib', 'updater.js'), /'agents\/prover\.md'/, 'the installer requires it');
  const readme = read('README.md');
  mustMatch(readme, /`prover` \| sonnet \|/, 'README lists prover on sonnet');
  const count = fs.readdirSync(path.join(REPO_ROOT, 'agents')).filter((n) => n.endsWith('.md')).length;
  assert.ok(fs.existsSync(path.join(REPO_ROOT, 'agents', 'prover.md')), 'companion: agents/ holds the new agent, prover.md');
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
