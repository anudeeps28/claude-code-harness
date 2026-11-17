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

// What the other modules say lives in their own tests (a test of /implement may not read another module's
// body, rules/modules.md "Tests check the interface"): /plan-features in skills/plan-features/__tests__/
// coverage-table.probe.test.js, /coverage-audit and /sync-tracker in their closing-check probes, the
// installer in install/__tests__/auditor-verified.test.js, and every agent's own text in
// agents/__tests__/agent-text.test.js. This probe keeps what /implement and rules/ say.
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
// CRLF on a Windows checkout (core.autocrlf=true) would break every pattern that spans a line end.
const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8').replace(/\r\n/g, '\n');
const readRule = (name) => fs.readFileSync(path.join(REPO_ROOT, 'rules', name), 'utf8').replace(/\r\n/g, '\n');

const IMPLEMENT = read('SKILL.md');
const AUTONOMOUS = readRule('autonomous-mode.md');
const DEFERRALS = readRule('deferrals.md');
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

// PlanFeatures_NumbersEveryRequirementAndRefusesWhileUnmapped and
// PlanFeatures_StoriesCarryTheirLinesVerbatimAndTheApprovalShowsCoverage read /plan-features's own files:
// they live in skills/plan-features/__tests__/coverage-table.probe.test.js.

// ── 2. the source lines are the finish line ───────────────────────────

test('Implement_SourceLinesAreReadAndBecomeCriteriaVerbatim', () => {
  const ticket = section(IMPLEMENT, '### Read the whole ticket');
  mustMatch(ticket, /source-lines\.js"? read/, 'the ticket read extracts the source lines');
  mustMatch(ticket, /doc-without-lines/, 'a ticket naming a doc without lines is handled');
  const goal = section(IMPLEMENT, '### Phase 1.5');
  mustMatch(goal, /every one is an acceptance criterion, verbatim/i, 'Goal Definition makes every line a criterion verbatim');
  mustMatch(goal, /never drop, merge away or soften/i, 'the goal may add, never drop');
  // F73 #83: Phase 2 is "Build the story". A missing heading would make the slice run to the end of
  // the file, so the heading must exist.
  assert.ok(IMPLEMENT.includes('## Phase 2 — Build the story'), 'SKILL.md has "## Phase 2 — Build the story"');
  const plan = IMPLEMENT.slice(IMPLEMENT.indexOf('### Phase 1c — Plan'), IMPLEMENT.indexOf('## Phase 2 — Build the story'));
  mustMatch(plan, /source-lines\.js"? compare/, 'the plan check compares the lines with the test strategy');
  // The planner's own side (Implement_SourceLinesAreReadAndBecomeCriteriaVerbatim_Planner) is in agents/__tests__/agent-text.test.js.
});

test('Implement_ReviewersCheckTheLinesAsWritten', () => {
  const phase3 = section(IMPLEMENT, '## Phase 3 — Evaluate + PR');
  assert.equal((phase3.match(/Source requirements:/g) || []).length, 2, 'the evaluator and the acceptance agent both get the source requirements');
  // The acceptance agent's and the evaluator's own sides (Implement_ReviewersCheckTheLinesAsWritten_Agents)
  // are in agents/__tests__/agent-text.test.js.
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
  // The builder's, planner's and understand agent's own sides (NeverShrinkScope_IsNotSelfAnswerableAnywhere_Agents)
  // are in agents/__tests__/agent-text.test.js.
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
  // F73 #83: the story steps moved to "## The story loop"; the scope pause is read from both places.
  const run = [section(section(IMPLEMENT, '## Feature mode'), '### Run the stories'), section(IMPLEMENT, '## The story loop')].filter(Boolean).join('\n');
  mustMatch(run, /scope[\s\S]{0,300}?(pause|stop|ask the person)/i, 'a scope question met while building a story is a pause, not an answer');
  assert.doesNotMatch(run, /self-answer[^.\n]{0,60}scope/i, 'and it is never self-answered');
});

// ── 5. the closing check ───────────────────────────────────────────────

// ClosingCheck_AFreshAgentReadsTheDocumentAgainstTheCode reads /coverage-audit's and the auditor's own
// files: it lives in skills/coverage-audit/__tests__/closing-check.probe.test.js and
// agents/__tests__/agent-text.test.js (..._Auditor).

test('ClosingCheck_RunsWhereTheLastItemCloses', () => {
  mustMatch(section(section(IMPLEMENT, '## Feature mode'), '### The closing check'), /coverage-audit[\s\S]{0,400}--building/, 'a Feature that completes the table runs it before the PR gate');
  mustMatch(IMPLEMENT, /\*\*The closing check \(only when this story completes a coverage table\)\.\*\*/, 'a single story that completes the table runs it');
  // /sync-tracker's side is in skills/sync-tracker/__tests__/closing-check.probe.test.js and the
  // installer's in install/__tests__/auditor-verified.test.js, both under this test's name.
  const required = readRequired().map((r) => `${r.kind} ${r.name}`);
  assert.ok(required.includes('skill coverage-audit'), 'the startup check requires /coverage-audit');
});
