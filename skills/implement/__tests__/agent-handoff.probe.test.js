// Doc-consistency probe for the agent handoff contract (Feature 72, story 74). Every build agent
// reports one STATUS line and /implement's main session routes on it without re-reading the work.
// Nothing parses this prose, so a file that loses the sentence does not throw; this probe pins it.
// Content predicates are tested twice: against planted text asserting the OPPOSITE (must be
// rejected, proving the check can fail) and against the real file (the enforcement).

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
// CRLF on a Windows checkout would break every pattern that spans a line end.
const readRuleFile = (name) => fs.readFileSync(path.join(REPO_ROOT, 'rules', name), 'utf8').replace(/\r\n/g, '\n');
const readOwn = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8').replace(/\r\n/g, '\n');
const flat = (s) => s.replace(/\s+/g, ' ');
const { readRequired } = require('../bin/startup-check.js');

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

function readRule() {
  try { return readRuleFile('agent-handoff.md'); } catch { return null; }
}

// The table rows of the rule that name a status: the per-status predicates run against these only,
// so a sentence elsewhere in the file cannot satisfy them.
const rowsFor = (text, status) =>
  text.split('\n').filter((l) => l.trimStart().startsWith('|') && l.includes(status)).join(' ');

const STATUSES = ['STATUS: DONE', 'STATUS: DONE_WITH_CONCERNS', 'STATUS: BLOCKED', 'STATUS: NEEDS_CONTEXT'];

// ── predicates (each matches the claim, not its vocabulary) ───────────

const hasAllFourStatuses = (t) => STATUSES.every((s) => t.includes(s));
// DONE: check cheaply that the commit or file it names exists
const doneChecksCheaply = (t) => /\bDONE\b[^.\n]*\bcheck[^.\n]*\b(commit|file)\b[^.\n]*\bexists?\b/i.test(flat(t));
// BLOCKED for missing context: relaunch with the context
const blockedContextRelaunches = (t) => /\bBLOCKED\b[^.\n]*missing context[^.\n]*\brelaunch[^.\n]*\bcontext\b/i.test(flat(t));
// BLOCKED needing more reasoning: relaunch fresh on opus
const blockedReasoningGoesOpus = (t) => /\bBLOCKED\b[^.\n]*more reasoning[^.\n]*\brelaunch[^.\n]*\bfresh\b[^.\n]*\bopus\b/i.test(flat(t));
// a second BLOCKED: stop and ask
const secondBlockedStops = (t) => /\bsecond\b[^.\n]*\bBLOCKED\b[^.\n]*\bstop\b[^.\n]*\bask\b/i.test(flat(t));
// no status line counts as DONE_WITH_CONCERNS
const noStatusIsConcerns = (t) =>
  /\b(no|without|missing)\b[^.\n]*status line[^.\n]*\b(counts as|treated as|is treated as)\b[^.\n]*DONE_WITH_CONCERNS/i.test(flat(t));
// never relaunch the same brief unchanged on the same model
const neverSameBriefSameModel = (t) => /\bnever\b[^.\n]*relaunch[^.\n]*same brief[^.\n]*same model[^.\n]*unchanged/i.test(flat(t));
// the main session never re-reads logs/transcript, re-runs commands, opens files (in that order)
const neverReReads = (t) => {
  const sentences = flat(t).split(/(?<=\.)\s/);
  return sentences.some((s) => {
    const i = s.search(/\bnever\b/i);
    if (i === -1) return false;
    const rest = s.slice(i);
    const a = rest.search(/re-reads?[^,]*logs or transcript/i);
    const b = rest.search(/re-runs?[^,]*commands/i);
    const c = rest.search(/opens? the files/i);
    return a !== -1 && b > a && c > b;
  });
};
const asksNarrowerQuestion = (t) => /\bone narrower question\b/i.test(flat(t));

// ── planted opposites: the predicates must reject these ───────────────

const OPPOSITE_RULE = [
  'There are only two outcomes: `STATUS: DONE` and `STATUS: BLOCKED`.',
  '| `STATUS: DONE` | Trust it as it is; it never needs a check of the commit or file it names. |',
  '| `STATUS: BLOCKED` | The main session never relaunches a BLOCKED agent with the context, and never relaunches it fresh on opus. A second BLOCKED is relaunched again; it never stops to ask. |',
  'A report with no status line is treated as DONE.',
  'Always relaunch the same brief on the same model unchanged.',
].join('\n');

const OPPOSITE_SKILL = [
  "The main session always re-reads the agent's logs and transcript, always re-runs its commands and always opens the files it wrote.",
  'It asks the agent to repeat the whole report.',
].join('\n');

// ── AC1 ───────────────────────────────────────────────────────────────

test('Handoff_RuleDefinesTheFourStatusesAndWhatTheMainSessionDoes', () => {
  // the predicates can fail
  assert.ok(!hasAllFourStatuses(OPPOSITE_RULE), 'planted text with two statuses must be rejected');
  assert.ok(!doneChecksCheaply(rowsFor(OPPOSITE_RULE, 'STATUS: DONE`')), 'planted "trusted without checking" must be rejected');
  assert.ok(!blockedContextRelaunches(rowsFor(OPPOSITE_RULE, 'STATUS: BLOCKED')), 'planted "dropped, never add context" must be rejected');
  assert.ok(!blockedReasoningGoesOpus(rowsFor(OPPOSITE_RULE, 'STATUS: BLOCKED')), 'planted "same model" must be rejected');
  assert.ok(!secondBlockedStops(rowsFor(OPPOSITE_RULE, 'STATUS: BLOCKED')), 'planted "relaunched again; do not stop" must be rejected');

  // the real file
  const rule = readRule();
  assert.ok(rule, 'AC1: rules/agent-handoff.md must exist');
  assert.ok(hasAllFourStatuses(rule), 'AC1: the rule must define all four statuses');
  assert.ok(doneChecksCheaply(rowsFor(rule, 'STATUS: DONE`')), 'AC1: DONE is checked cheaply: the commit or file it names exists');
  assert.ok(blockedContextRelaunches(rowsFor(rule, 'STATUS: BLOCKED')), 'AC1: BLOCKED for missing context relaunches with the context');
  assert.ok(blockedReasoningGoesOpus(rowsFor(rule, 'STATUS: BLOCKED')), 'AC1: BLOCKED that needs more reasoning relaunches fresh on opus');
  assert.ok(secondBlockedStops(rowsFor(rule, 'STATUS: BLOCKED')), 'AC1: a second BLOCKED stops and asks');
});

// ── AC2 ───────────────────────────────────────────────────────────────

test('Handoff_NoStatusLineIsDoneWithConcerns_NeverSameBriefSameModel', () => {
  assert.ok(!noStatusIsConcerns(OPPOSITE_RULE), 'planted "no status line is treated as DONE" must be rejected');
  assert.ok(!neverSameBriefSameModel(OPPOSITE_RULE), 'planted "always relaunch the same brief" must be rejected');

  const rule = readRule();
  assert.ok(rule, 'AC2: rules/agent-handoff.md must exist');
  assert.ok(noStatusIsConcerns(rule), 'AC2: a report with no status line is treated as DONE_WITH_CONCERNS');
  assert.ok(neverSameBriefSameModel(rule), 'AC2: the same brief is never relaunched unchanged on the same model');
});

// F73 #83: the executor was the one agent with its own `RESULT:` block, so the rule's "routed by that
// RESULT:" paragraph is gone with it. Every agent now routes by its STATUS line alone.
test('Handoff_NoAgentIsRoutedByAResultBlock', () => {
  const routedByResult = (t) => /is routed by that `RESULT:`|`STATUS:` line is only the first line/.test(t);
  assert.ok(routedByResult('An agent whose own file defines a `RESULT:` block is routed by that `RESULT:`.'), 'the check finds the old paragraph');
  const rule = readRule();
  assert.ok(rule && /STATUS/.test(rule), 'companion: the handoff rule was read');
  assert.ok(!routedByResult(rule), 'the rule no longer routes an agent by a RESULT block');
});

// ── AC3 / AC5 ─────────────────────────────────────────────────────────

// The set is derived, never listed: every agent /implement requires (its "## Required tools" list names the
// agents /debug and /coverage-audit spawn for it too). The sentence each agent file carries is asserted in
// agents/__tests__/agent-text-handoff.test.js, because an agent's own text is checked there.
function buildAgentSet() {
  return new Set(readRequired().filter((r) => r.kind === 'agent').map((r) => r.name));
}

test('Handoff_EveryAgentImplementStartsSaysItsReportStartsWithTheStatusLine', () => {
  const boundaries = require('../../../scripts/lib/boundaries.js');
  const agents = buildAgentSet();
  assert.ok(agents.size >= 10, `the derived agent set must have at least 10 members (got ${agents.size}: ${[...agents].join(', ')})`);
  for (const name of ['story-understand-agent', 'implement-planner-agent', 'evaluator-agent', 'acceptance-test-agent', 'architect-reviewer-agent', 'security-reviewer-agent', 'loosened-reviewer-agent', 'coverage-auditor-agent', 'story-pr-agent', 'debug-agent', 'prover']) {
    assert.ok(agents.has(name), `the derived agent set must include ${name}`);
  }
  for (const gone of ['story-executor-agent', 'troubleshoot-investigator']) {
    assert.ok(!agents.has(gone), `the derived agent set must not include the retired ${gone}`);
  }

  // The agent's file is found through its Interface block (interfaceOf throws when the file is missing); the
  // sentence in its body is asserted in agents/__tests__/agent-text-handoff.test.js.
  for (const name of agents) {
    assert.doesNotThrow(() => boundaries.interfaceOf(REPO_ROOT, `agents/${name}`), `agent file must exist: agents/${name}.md`);
  }
});

// ── AC4 ───────────────────────────────────────────────────────────────

test('Handoff_SkillActsOnTheShortResultAndNeverReReads', () => {
  assert.ok(!neverReReads(OPPOSITE_SKILL), 'planted "re-reads logs" text must be rejected');
  assert.ok(!asksNarrowerQuestion(OPPOSITE_SKILL), 'planted text without a narrower question must be rejected');

  const skill = section(readOwn('SKILL.md'), '## Work handed to agents');
  assert.ok(skill, 'AC4: SKILL.md must have a "## Work handed to agents" section');
  assert.ok(skill.includes('rules/agent-handoff.md'), 'AC4: the section must point at rules/agent-handoff.md');
  assert.ok(neverReReads(skill), "AC4: the section must say the main session never re-reads an agent's logs or transcript, re-runs its commands, or opens the files it wrote");
  assert.ok(asksNarrowerQuestion(skill), 'AC4: the section must say it asks one narrower question instead');
});

// ── AC1 / AC2 / AC5 (F2 story #6j2mgpH6529FcgJ2): the promise is read from the Interface blocks ────

test("every agent's Interface Outputs starts with a STATUS line", () => {
  const boundaries = require('../../../scripts/lib/boundaries.js');
  const fixture = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'handoff-'));
  try {
    const block = (outputs) => `---\nname: x\nowner: shared\n---\n\n## Interface\n\n**Inputs:** a brief\n**Outputs:** ${outputs}\n**Callable parts:** none\n**Never breaks:** nothing\n\nSTATUS: DONE is in the body only.\n`;
    fs.mkdirSync(path.join(fixture, 'agents'));
    fs.writeFileSync(path.join(fixture, 'agents', 'good-agent.md'), block('Starts with the `STATUS:` line.'));
    fs.writeFileSync(path.join(fixture, 'agents', 'bad-agent.md'), block('a free-text report'));
    const planted = boundaries.checkAgentOutputs(fixture);
    assert.equal(planted.length, 1, `exactly the agent without the promise is named, got ${JSON.stringify(planted)}`);
    assert.ok(planted[0].includes('bad-agent.md'), 'the failure must name the agent whose Outputs lack STATUS:');
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }

  // The real agents this skill starts: the ones its own SKILL.md requires, never a list kept here. The check is the
  // boundary family's own (checkAgentOutputs), asked about each required agent by name. The sweep over every agent
  // in agents/ is its repo test (scripts/__tests__).
  const names = readRequired().filter((r) => r.kind === 'agent').map((r) => r.name);
  assert.ok(names.length >= 10, `the agents /implement requires were read (got ${names.length})`);
  const problems = boundaries.checkAgentOutputs(REPO_ROOT);
  for (const name of names) {
    assert.doesNotThrow(() => boundaries.interfaceOf(REPO_ROOT, `agents/${name}`), `companion: agents/${name}.md exists`);
    assert.deepStrictEqual(problems.filter((p) => p.startsWith(`agents/${name}.md:`)), [], `agents/${name} Interface Outputs must start with a STATUS line`);
  }
});
