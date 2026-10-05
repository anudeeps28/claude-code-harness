// Doc-consistency probe for F3 #36 "Every Feature has a Demo": the Observe section and its startup
// check (#38), a proof for every criterion decided before any code (#39), and /local-test never
// reporting a Demo as SKIPPED (#40). The scripts these instructions call have their own tests.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const read = (...p) => fs.readFileSync(path.join(REPO_ROOT, ...p), 'utf8');

const IMPLEMENT = read('skills', 'implement', 'SKILL.md');
const PLANNER = read('agents', 'implement-planner-agent.md');
const LOCAL_TEST = read('skills', 'local-test', 'SKILL.md');
const PHILOSOPHY = read('rules', 'test-philosophy.md');
const { NEEDS, parseObserve } = require('../bin/observe-check.js');
const { PROOF_KINDS } = require('../bin/proof-check.js');

function section(content, heading) {
  const lines = content.split('\n');
  const start = lines.findIndex((l) => l.startsWith(heading));
  if (start === -1) return null;
  let inFence = false;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith('```')) inFence = !inFence;
    else if (!inFence && /^#{2,3} /.test(lines[i])) { end = i; break; }
  }
  return lines.slice(start, end).join('\n');
}

function mustMatch(content, re, message) { assert.ok(content && re.test(content), message); }

// ── #38 the Observe section ──────────────────────────────────────────

const OBSERVE_ENTRIES = [...new Set(Object.values(NEEDS).flat().map(([entry]) => entry)), 'Prod allowed'];

for (const template of [['templates', 'tasks', 'lessons.md'], ['templates', 'tasks-solo', 'notes.md']]) {
  test(`Observe_TemplateDeclaresEveryEntry_${template[1]}`, () => {
    const text = read(...template);
    const observe = section(text, '## Observe');
    assert.ok(observe, `${template.join('/')} must have a "## Observe" section`);
    for (const e of OBSERVE_ENTRIES) {
      mustMatch(observe, new RegExp(`^- ${e}:`, 'm'), `${template.join('/')} Observe must declare "${e}"`);
    }
    mustMatch(observe, /local or test/i, 'the environment is local or test only');
    mustMatch(observe, /name of|names? the variable|never (its|the) value/i, 'credentials are named, never their value');
    mustMatch(observe, /read-only (database )?user|enforced by the credential/i, 'read-only is enforced by the credential');
    // An untouched template is all placeholders: nothing in it may count as declared.
    assert.equal(parseObserve(text).entries.size, 0, 'the template\'s placeholder values must read as unset');
  });
}

test('Observe_StartupCheckRunsAfterTheTicketRead', () => {
  const s = section(IMPLEMENT, '### Check the Demo against Observe');
  assert.ok(s, 'expected a "### Check the Demo against Observe" subsection');
  assert.ok(IMPLEMENT.indexOf('### Read the whole ticket') < IMPLEMENT.indexOf('### Check the Demo against Observe'),
    'the Observe check needs ticket.md, so it comes after the ticket read');
  mustMatch(s, /observe-check\.js"? --demo tasks\/stories\/<id>\/ticket\.md/, 'it runs observe-check.js on ticket.md');
  mustMatch(s, /\*\*stop\*\*/i, 'a missing or refused line stops the run');
  mustMatch(s, /never (its|the) value/i, 'only the variable name is shown');
  mustMatch(s, /Probes to build/, 'probe lines go to the planner as "Probes to build"');
  mustMatch(s, /not\s+self-answer/i, 'missing access is not self-answered under --autonomous');
});

test('Observe_PlannerBuildsTheProbes', () => {
  mustMatch(section(IMPLEMENT, '### Phase 1c — Plan'), /Probes to build/, 'the planner prompt carries the probe lines');
  mustMatch(PLANNER, /Build the probe: <entry>/, 'the planner names each probe task "Build the probe: <entry>"');
});

// ── #39 a proof for every criterion ──────────────────────────────────

test('Proof_PlannerWritesThreeLinesPerCriterion', () => {
  const s = section(PLANNER, '### Test Strategy');
  mustMatch(s, /\*\*Acceptance criteria and their proofs:\*\*/, 'the planner writes the proof list');
  for (const f of ['Proof:', 'Seen by:', 'Would lie if:']) assert.ok(s.includes(f), `the planner must write a "${f}" line`);
  for (const k of PROOF_KINDS) assert.ok(s.includes(k), `the planner must list the "${k}" proof kind`);
  mustMatch(s, /named mutation|missing assertion/i, '"Would lie if" must be concrete');
});

test('Proof_PlannerRestatesTheDemoNeverWeaker', () => {
  const s = section(PLANNER, '### Demo');
  assert.ok(s, 'expected a "### Demo" subsection in the planner');
  mustMatch(s, /## Demo/, 'the plan carries a ## Demo section');
  mustMatch(s, /never weaker/i, 'the Demo may be more precise, never weaker');
});

test('Proof_PlanApprovalRunsAllThreeChecks', () => {
  // Phase 1c runs to Phase 2; it has subheadings of its own ("### Implementation plan").
  const s = IMPLEMENT.slice(IMPLEMENT.indexOf('### Phase 1c — Plan'), IMPLEMENT.indexOf('## Phase 2 — Execute'));
  mustMatch(s, /demo\.js"? compare tasks\/stories\/<id>\/ticket\.md tasks\/stories\/<id>\/plan\.md/, 'Demo never weaker');
  mustMatch(s, /proof-check\.js"? tasks\/stories\/<id>\/test-strategy\.md/, 'a proof for every criterion');
  mustMatch(s, /observe-check\.js"? --demo tasks\/stories\/<id>\/plan\.md --plan tasks\/stories\/<id>\/plan\.md/, 'the probes are planned');
  mustMatch(s, /rejected|back to the planner/i, 'a plan failing a check goes back to the planner');
});

test('Proof_SignOffCriterionEndsAtNeedsPerson', () => {
  mustMatch(IMPLEMENT, /needs-person:`? [\s\S]{0,700}set-status\.sh <id> needs-person/, 'a sign-off criterion moves the card to needs-person');
});

test('Proof_TestPhilosophyMatches', () => {
  const s = section(PHILOSOPHY, '## Test Strategy Is a Planning Artifact');
  for (const f of ['Proof', 'Seen by', 'Would lie if']) assert.ok(s.includes(f), `test-philosophy must name "${f}"`);
  mustMatch(s, /Demo/, 'test-philosophy must mention the Demo restatement');
});

// ── #40 never SKIPPED ────────────────────────────────────────────────

test('NotSetUp_ReplacesSkippedForTheE2eGate', () => {
  const e2e = section(LOCAL_TEST, '### e2e');
  mustMatch(e2e, /NOT SET UP/, 'no e2e command reports NOT SET UP');
  mustMatch(e2e, /NOT SET UP[\s\S]{0,300}fail/i, 'NOT SET UP counts as a fail');
  mustMatch(e2e, /Observe → E2E command/, 'NOT SET UP names the Observe entry that is needed');
  assert.ok(!/SKIPPED/.test(e2e), 'the e2e gate never reports SKIPPED');
  mustMatch(e2e, /AWAITING HUMAN SIGN-OFF/, 'a structured human check still waits for a sign-off');
  mustMatch(e2e, /shape/i, 'a human check shows the shape of the evidence, never PHI');
});

test('NotSetUp_ImplementTreatsItAsRed', () => {
  mustMatch(IMPLEMENT, /NOT SET UP[\s\S]{0,200}(red|fail)/, '/implement treats NOT SET UP as a red gate');
});
