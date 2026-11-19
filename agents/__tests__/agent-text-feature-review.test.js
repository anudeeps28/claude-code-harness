'use strict';
// The agents' own text, moved out of skills/implement/__tests__/feature-review.probe.test.js (story
// #6j2mgpH6529FcgJ2, check 5): the four reviewers' checks (#54-#57), loosened-reviewer-agent, the evaluator's
// parts and the prover's report. The probe keeps what it says about /implement's own SKILL.md; the agent
// sentences are asserted here, under the same test names and assertion messages.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const { AGENTS_DIR, readAgent, mustMatch } = require('./helpers.js');
const readArchitecture = () => fs.readFileSync(path.join(REPO_ROOT, 'ARCHITECTURE.md'), 'utf8').replace(/\r/g, '');
const readTemplate = (...p) => fs.readFileSync(path.join(REPO_ROOT, 'templates', ...p), 'utf8').replace(/\r/g, '');
const { GATE_LINE } = require('../../skills/implement/bin/pr-gate.js');

const SECURITY = readAgent('security-reviewer-agent.md');
const ARCHITECT = readAgent('architect-reviewer-agent.md');
const ACCEPTANCE = readAgent('acceptance-test-agent.md');
const EVALUATOR = readAgent('evaluator-agent.md');

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
  assert.doesNotMatch(readArchitecture(), /Not yet proven:\*\* whether the built-in respects/, 'ARCHITECTURE.md §2 #9 carries the answer');
});

// ── #55 architect ────────────────────────────────────────────────────

test('Architect_MigrationsCheckedAgainstAnExistingDatabase', () => {
  mustMatch(ARCHITECT, /Does it work on a database that already exists\?/, 'the check exists');
  mustMatch(ARCHITECT, /migration-check\.js" --base <base>/, 'it runs migration-check.js');
  mustMatch(ARCHITECT, /never assume one/i, 'the ledger convention is read, not assumed');
  mustMatch(ARCHITECT, /Migrate forward:/, 'forward migration comes from lessons/notes');
  mustMatch(ARCHITECT, /could not migrate forward/, 'otherwise it says it could not');
  const templates = {
    'templates/tasks/lessons.md': readTemplate('tasks', 'lessons.md'),
    'templates/tasks-solo/notes.md': readTemplate('tasks-solo', 'notes.md'),
  };
  for (const [t, text] of Object.entries(templates)) {
    mustMatch(text, /^- Migrate forward: `/m, `${t} has the Migrate forward line`);
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

// ── from #58 loosened-reviewer-agent and models ──────────────────────

test('CoverageAuditor_StaysOpus', () => {
  const text = readAgent('coverage-auditor-agent.md');
  assert.equal(modelOf(text), 'opus', 'AC4: coverage-auditor-agent stays model: opus');
  assert.ok(modelOf('---\nmodel: sonnet\n---') !== 'opus', 'a sonnet file is told apart from opus');
});

test('Loosened_IsANamedRegisteredAgentOnTheFasterModel', () => {
  const text = readAgent('loosened-reviewer-agent.md');
  mustMatch(text, /^name: loosened-reviewer-agent$/m, 'agent name');
  assert.equal(modelOf(text), 'sonnet');
  mustMatch(text, /loosened-scan\.js/, 'it runs the scan');
  mustMatch(text, /no reason, no owner or no re-check is a finding/i, 'a missing reason, owner or re-check is a finding');
  mustMatch(text, /cost money or change operations/i, 'it lists operational cost');
});

test('Models_EveryPanelAgentStatesOneAndThePanelPassesThem', () => {
  for (const a of ['security-reviewer-agent', 'architect-reviewer-agent', 'acceptance-test-agent', 'evaluator-agent']) {
    assert.equal(modelOf(readAgent(`${a}.md`)), 'opus', `${a} states the strongest model`);
  }
});

// ── from the Prove it tests ──────────────────────────────────────────

test('ProveIt_ProverReportLines_AreTheGatesOwnVocabulary', () => {
  const report = section(readAgent('prover.md'), '## Your report');
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
});

test('ProveIt_BriefsNameWhatEachCalleeNeeds', () => {
  const prover = readAgent('prover.md');
  mustMatch(prover, /Feature's `plan\.md`/, 'prover.md: the brief gives the Feature plan.md path');
});

test('ProveIt_ProverOnSonnet_DiagnosisOnOpus', () => {
  const file = readAgent('prover.md');
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
  assert.ok(fs.existsSync(path.join(AGENTS_DIR, 'prover.md')), 'companion: agents/ holds the new agent, prover.md');
});
