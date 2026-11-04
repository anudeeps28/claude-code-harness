// Doc-consistency probe for the plan-to-PR flow (2026-11-03). A design doc built through five
// /implement runs from one-line tickets "passed" every run while 21 requirements fell between them,
// and one autonomous run logged a narrowed requirement as a "reversible decision". The fix is five
// rules spread over many files; nothing parses this prose, so two files disagreeing does not throw —
// it makes Claude pick one. This probe pins the contract in every file that states it:
//   1. /plan-features maps every requirement line of a document (coverage table) before creating
//   2. a story's source lines are its finish line, verbatim, in the plan and in the reviews
//   3. never shrink scope — not self-answerable, in any mode
//   4. one plan gate by default (single story and Feature alike), then straight to the PR
//   5. a closing check reads the whole document against the code with a fresh agent

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
// CRLF on a Windows checkout (core.autocrlf=true) would break every pattern that spans a line end.
const read = (...p) => fs.readFileSync(path.join(REPO_ROOT, ...p), 'utf8').replace(/\r\n/g, '\n');

const IMPLEMENT = read('skills', 'implement', 'SKILL.md');
const PLAN_FEATURES = read('skills', 'plan-features', 'SKILL.md');
const AUTONOMOUS = read('rules', 'autonomous-mode.md');
const DEFERRALS = read('rules', 'deferrals.md');
const PLANNER = read('agents', 'implement-planner-agent.md');
const UNDERSTAND = read('agents', 'story-understand-agent.md');
const ACCEPTANCE = read('agents', 'acceptance-test-agent.md');
const EVALUATOR = read('agents', 'evaluator-agent.md');
const BUILDER = read('agents', 'story-builder.md');
const AUDIT_SKILL = read('skills', 'coverage-audit', 'SKILL.md');
const AUDITOR = read('agents', 'coverage-auditor-agent.md');
const SYNC = read('skills', 'sync-tracker', 'SKILL.md');
const { readRequired } = require('../bin/startup-check.js');

function section(content, heading) {
  const lines = content.replace(/\r/g, '').split('\n');
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

// ── 1. /plan-features: the coverage table ─────────────────────────────

test('PlanFeatures_NumbersEveryRequirementAndRefusesWhileUnmapped', () => {
  const phase = section(PLAN_FEATURES, '## Phase 2.5');
  assert.ok(phase, '/plan-features must have a Phase 2.5 that numbers the requirements of a document');
  mustMatch(phase, /sub-bullet/i, 'every sub-bullet is its own requirement');
  mustMatch(phase, /exactly one owner/i, 'each line maps to exactly one owner');
  mustMatch(phase, /Out of scope — <reason>/, 'out of scope carries a reason the person approves');
  mustMatch(phase, /tasks\/coverage\/<doc-slug>\.md/, 'the table is stored where later runs read it');
  mustMatch(phase, /source-lines\.js"? coverage/, 'the coverage gate is the script, not a reading');
  mustMatch(phase, /nothing is created while a line is unmapped/i, 'nothing is created while a line is unmapped');
});

test('PlanFeatures_StoriesCarryTheirLinesVerbatimAndTheApprovalShowsCoverage', () => {
  mustMatch(PLAN_FEATURES, /## Source requirements\n/, 'the story body has a Source requirements section');
  mustMatch(PLAN_FEATURES, /\*\*Source requirements\*\*[^\n]*verbatim/, 'the story field says verbatim');
  mustMatch(PLAN_FEATURES, /## Coverage\n/, 'the Feature body carries its coverage rows');
  mustMatch(section(PLAN_FEATURES, '## Phase 4'), /\*\*Coverage\*\*[\s\S]{0,400}Out of scope/, 'Phase 4 shows coverage and every out-of-scope line for approval');
  mustMatch(PLAN_FEATURES, /--gaps/, 'gaps found by the closing check become stories through the same table');
  mustMatch(read('skills', 'plan-features', 'references', 'story-template.md'), /never replaces or narrows the quote/, 'the template keeps the quote ahead of the Given/When/Then');
});

// ── 2. the source lines are the finish line ───────────────────────────

test('Implement_SourceLinesAreReadAndBecomeCriteriaVerbatim', () => {
  const ticket = section(IMPLEMENT, '### Read the whole ticket');
  mustMatch(ticket, /source-lines\.js"? read/, 'the ticket read extracts the source lines');
  mustMatch(ticket, /doc-without-lines/, 'a ticket naming a doc without lines is handled');
  const goal = section(IMPLEMENT, '### Phase 1.5');
  mustMatch(goal, /every one is an acceptance criterion, verbatim/i, 'Goal Definition makes every line a criterion verbatim');
  mustMatch(goal, /never drop, merge away or soften/i, 'the goal may add, never drop');
  const plan = IMPLEMENT.slice(IMPLEMENT.indexOf('### Phase 1c — Plan'), IMPLEMENT.indexOf('## Phase 2 — Execute'));
  mustMatch(plan, /source-lines\.js"? compare/, 'the plan check compares the lines with the test strategy');
  mustMatch(PLANNER, /starts with its id and quotes the line verbatim/, 'the planner writes each line as an id-tagged criterion');
});

test('Implement_ReviewersCheckTheLinesAsWritten', () => {
  const phase3 = section(IMPLEMENT, '## Phase 3 — Evaluate + PR');
  assert.equal((phase3.match(/Source requirements:/g) || []).length, 2, 'the evaluator and the acceptance agent both get the source requirements');
  mustMatch(ACCEPTANCE, /line exactly as the source requirements state it/, 'the acceptance agent judges the line as written');
  mustMatch(ACCEPTANCE, /PARTIAL\*\*, never PASS/, 'a line done in part is never PASS');
  mustMatch(EVALUATOR, /Source lines \| ✅ PASS/, 'the evaluator has a source-lines hard gate');
});

test('Implement_PlainDescriptionNamingADocumentGoesToPlanFeatures', () => {
  mustMatch(IMPLEMENT, /plain description that points at a document is not planned from one line/i, 'the routing rule is stated');
  mustMatch(IMPLEMENT, /\/plan-features <doc>` first/, 'it routes to /plan-features first');
});

// ── 3. never shrink scope ──────────────────────────────────────────────

test('NeverShrinkScope_IsNotSelfAnswerableAnywhere', () => {
  const rule = section(AUTONOMOUS, '## Never shrink scope');
  assert.ok(rule, 'rules/autonomous-mode.md must have a "Never shrink scope" section');
  for (const kind of [/more narrowly than it is written/, /part of a requirement and deferring the rest/, /between two readings/]) {
    mustMatch(rule, kind, `the rule names ${kind}`);
  }
  mustMatch(rule, /at the plan gate/, 'such questions are asked at the plan gate');
  mustMatch(rule, /with or without `--autonomous`/, 'it holds in every mode');
  mustMatch(section(AUTONOMOUS, '## Pause-anyway triggers'), /\*\*Scope narrowing\*\*/, 'mid-build it is a pause-anyway trigger');
  mustMatch(DEFERRALS, /not the run's to defer/, 'deferrals.md: a requirement is never the run\'s to defer');
  mustMatch(IMPLEMENT, /\*\*Never shrink scope\.\*\*/, '/implement states it');
  mustMatch(BUILDER, /Never shrink scope/, 'the story builder states it');
  mustMatch(BUILDER, /Never shrink scope[\s\S]{0,500}?`STATUS: (NEEDS_CONTEXT|BLOCKED)`[\s\S]{0,200}?never (answer|settle|decide)/i,
    'on a scope question the builder reports NEEDS_CONTEXT or BLOCKED and never answers it itself');
  const scopeCheck = (t) => /Never shrink scope[\s\S]{0,500}?`STATUS: (NEEDS_CONTEXT|BLOCKED)`[\s\S]{0,200}?never (answer|settle|decide)/i.test(t);
  assert.ok(!scopeCheck('Never shrink scope. When unsure which reading is meant, decide it yourself and carry on; report `STATUS: DONE`.'), 'planted opposite: a builder that settles the reading itself is rejected');
  mustMatch(PLANNER, /never plan the narrow\s+reading/, 'the planner asks instead of planning the narrow reading');
  mustMatch(UNDERSTAND, /Never settle a scope reading yourself/, 'the understand agent collects scope readings as questions');
});

test('NeverShrinkScope_ReviewFindingsOnALineAreAlwaysFixed', () => {
  mustMatch(section(IMPLEMENT, '## Phase 3 — Evaluate + PR'), /always fixed, never skipped or deferred by the run/, '/implement never skips a source-line finding');
  mustMatch(AUTONOMOUS, /source requirement line\*\* is unmet or met only in part is never\s+skipped/, 'the fix-vs-skip rule carves out source lines');
});

// ── 4. one gate by default ─────────────────────────────────────────────

test('OneGate_TheDefaultRunStopsOnceAtThePlanGate', () => {
  assert.doesNotMatch(IMPLEMENT, /Each phase ends with a STOP checkpoint/, 'the old per-phase rule must be gone');
  assert.doesNotMatch(IMPLEMENT, /"go A"|go B|mode A \(wave-by-wave\)/, 'the wave-by-wave execution-mode question must be gone');
  assert.doesNotMatch(IMPLEMENT, /Do NOT proceed until YOUR_NAME responds/, 'no phase waits for a response outside the plan gate and --step');
  const gate = section(IMPLEMENT, '### The plan gate');
  assert.ok(gate, '/implement must have a "### The plan gate" section');
  for (const part of [/\*\*Coverage\*\*/, /Before I finalize this plan I need/, /recommended answer/, /scope readings/]) {
    mustMatch(gate, part, `the plan gate shows ${part}`);
  }
  mustMatch(gate, /--autonomous[\s\S]{0,200}empty[\s\S]{0,200}approves itself/, 'under --autonomous only an empty gate approves itself');
  for (const stop of ['STOP 1 (`--step` only)', 'STOP 1.5 (`--step` only)', 'STOP 3 (`--step` only)']) {
    assert.ok(IMPLEMENT.includes(stop), `${stop} — the old stops survive only under --step`);
  }
  mustMatch(IMPLEMENT, /`--step` →/, '--step is a documented flag');
  mustMatch(IMPLEMENT, /`--auto` → kept for old commands/, '--auto is kept and says what it does now');
});

test('OneGate_AfterApprovalTheRunGoesStraightToThePR', () => {
  mustMatch(IMPLEMENT, /\*\*Ship it — no stop\.\*\*/, 'the PR step commits, pushes and opens the PR without a stop');
  mustMatch(AUTONOMOUS, /approving `\/implement`'s\s+plan gate/, 'approving the plan gate is an explicit autonomous entry point');
  mustMatch(AUTONOMOUS, /once the plan gate is approved/, 'the durable marker is written at the gate');
  for (const trigger of ['contradiction', 'irreversible action', 'scope change', 'scope narrowing', 'missing dependency', '3-failed-attempts']) {
    mustMatch(section(IMPLEMENT, '## Autonomous mode'), new RegExp(trigger, 'i'), `/implement lists the ${trigger} trigger`);
  }
});

test('OneGate_FeatureModeUsesTheSameGateFormat', () => {
  const plan = section(section(IMPLEMENT, '## Feature mode'), '### Plan the Feature');
  mustMatch(plan, /the plan gate/i, 'the Feature approval is the plan gate');
  mustMatch(plan, /\*\*coverage\*\*/, 'it shows coverage');
  mustMatch(plan, /\*\*scope readings\*\*/, 'it asks scope readings');
  mustMatch(plan, /a recommended answer/, 'each question has a recommended answer');
  const run = section(section(IMPLEMENT, '## Feature mode'), '### Run the stories');
  mustMatch(run, /scope[\s\S]{0,300}?(pause|stop|ask the person)/i, 'a scope question met while building a story is a pause, not an answer');
  assert.doesNotMatch(run, /self-answer[^.\n]{0,60}scope/i, 'and it is never self-answered');
});

// ── 5. the closing check ───────────────────────────────────────────────

test('ClosingCheck_AFreshAgentReadsTheDocumentAgainstTheCode', () => {
  mustMatch(AUDIT_SKILL, /coverage-auditor-agent/, '/coverage-audit spawns the auditor');
  mustMatch(AUDIT_SKILL, /Give it nothing else: not the coverage table's mapping, not plans/, 'the auditor is not given the plans');
  mustMatch(AUDITOR, /^tools: Read, Glob, Grep, Bash$/m, 'the auditor cannot edit');
  mustMatch(AUDITOR, /Anything under `tasks\/`/, 'the auditor never reads the story state');
  mustMatch(AUDITOR, /Partly is never rounded up to Built/, 'Partly is never rounded up');
  mustMatch(AUDIT_SKILL, /never self-answered, in any mode/, 'what becomes of a gap is the person\'s call');
  mustMatch(AUDIT_SKILL, /source-lines\.js"? audit/, 'completion is checked by the script');
});

test('ClosingCheck_RunsWhereTheLastItemCloses', () => {
  mustMatch(section(section(IMPLEMENT, '## Feature mode'), '### The closing check'), /coverage-audit[\s\S]{0,400}--building/, 'a Feature that completes the table runs it before the PR gate');
  mustMatch(IMPLEMENT, /\*\*The closing check \(only when this story completes a coverage table\)\.\*\*/, 'a single story that completes the table runs it');
  mustMatch(section(SYNC, '## Step 6.3'), /\/coverage-audit/, '/sync-tracker runs it when the last item closes');
  mustMatch(SYNC, /held: coverage lines open/, '/sync-tracker never closes an item whose lines are open');
  const required = readRequired().map((r) => `${r.kind} ${r.name}`);
  assert.ok(required.includes('skill coverage-audit'), 'the startup check requires /coverage-audit');
  mustMatch(read('install', 'lib', 'updater.js'), /'agents\/coverage-auditor-agent\.md'/, 'the installer verifies the auditor');
});
