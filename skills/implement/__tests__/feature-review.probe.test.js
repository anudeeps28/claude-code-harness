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

test('Evaluator_ComplexityDeadCodeAndMadeFalse_InTwoParts', () => {
  mustMatch(EVALUATOR, /## Step 5\.5 — Complexity/, 'complexity step');
  mustMatch(EVALUATOR, /exactly one caller/, 'one-caller abstractions');
  mustMatch(EVALUATOR, /## Step 5\.6 — Dead code: the list/, 'mechanical dead-code list');
  mustMatch(EVALUATOR, /## Step 5\.7 — Dead code: what did this change make false\?/, 'the made-false question');
  mustMatch(EVALUATOR, /`list` — on a faster model/, 'part list on a faster model');
  mustMatch(EVALUATOR, /`made-false` — on the default model/, 'part made-false on the default model');
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
  for (const [agent, model] of [['security-reviewer-agent', 'opus'], ['architect-reviewer-agent', 'opus'], ['acceptance-test-agent', 'opus'],
    ['evaluator-agent`, part `list', 'sonnet'], ['evaluator-agent`, part `made-false', 'opus'], ['loosened-reviewer-agent', 'sonnet']]) {
    mustMatch(panel, new RegExp(`\\| \`${agent.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\` \\| \`${model}\` \\|`), `the panel passes ${model} to ${agent}`);
  }
});

// ── #59 the Feature panel ────────────────────────────────────────────

test('Panel_FiveReviewersInOneMessageOnTheFeatureBranch', () => {
  const panel = section(IMPLEMENT, '### The Feature panel');
  assert.ok(panel, 'expected "### The Feature panel"');
  mustMatch(panel, /all five reviewers in one message, each in the foreground/, 'one message, foreground');
  mustMatch(panel, /main\.\.\.feature\/<fid>/, 'on main...feature/<fid>');
  mustMatch(panel, /Commit first, then leave the tree alone/, 'commit first');
  mustMatch(panel, /No file in the Feature worktree changes until the\s+last has returned/, 'hold edits while they read');
  mustMatch(panel, /panel-head/, 'the commit read is recorded and re-checked');
  mustMatch(panel, /Re-review only what changed/, 'partial re-review');
  mustMatch(panel, /independently[\s\S]{0,100}weight\s+it up/, 'two independent findings are weighted up');
  mustMatch(panel, /two defensible\s+forms[\s\S]{0,600}stops under `--autonomous` too/, 'a finding that is not ours goes to the person');
  mustMatch(panel, /test-first when test-first mode\s+is on/, 'fixes are test-first when the mode is on');
  mustMatch(IMPLEMENT, /`done` → every story has merged: go to \*\*The Feature panel\*\*/, 'done leads to the panel');
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
