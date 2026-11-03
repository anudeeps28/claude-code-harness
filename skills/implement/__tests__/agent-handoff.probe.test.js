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
const read = (...p) => fs.readFileSync(path.join(REPO_ROOT, ...p), 'utf8').replace(/\r\n/g, '\n');
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
  try { return read('rules', 'agent-handoff.md'); } catch { return null; }
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
// the fixed sentence an agent file carries
const AGENT_SENTENCE =
  'Your report starts with one line: `STATUS: DONE`, `STATUS: DONE_WITH_CONCERNS`, `STATUS: BLOCKED` or `STATUS: NEEDS_CONTEXT` (`rules/agent-handoff.md`).';
const agentSaysStatusLine = (t) => flat(t).includes(AGENT_SENTENCE);
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

const OPPOSITE_AGENT = '## Your report\n\nYour report does not start with a status line; just write prose.\n';

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

// An agent with its own RESULT block keeps its halt, retry and restore rules; the relaunch rows
// must not override them (review finding, story #74).
const resultDrivesRouting = (t) =>
  /own file defines a\s+`RESULT:` block[\s\S]{0,120}is routed by that `RESULT:`/.test(t) &&
  /`STATUS:` line is only the first line/.test(t);

test('Handoff_AgentsWithAResultBlockAreRoutedByIt', () => {
  assert.ok(!resultDrivesRouting('An agent whose own file defines a `RESULT:` block is relaunched like any other.'),
    'planted text that relaunches a RESULT agent must be rejected');
  const rule = readRule();
  assert.ok(rule && resultDrivesRouting(rule),
    'the rule must route story-executor-agent and story-runner-agent by their RESULT block, the STATUS line being only the first line');
});

// ── AC3 / AC5 ─────────────────────────────────────────────────────────

// The set is derived, never listed: every agent /implement requires, plus every agent a skill that
// /implement invokes spawns by name.
function buildAgentSet() {
  const names = new Set(readRequired().filter((r) => r.kind === 'agent').map((r) => r.name));
  for (const skill of ['debug', 'coverage-audit']) {
    const text = read('skills', skill, 'SKILL.md');
    for (const m of text.matchAll(/Spawn a \*\*`([a-z0-9-]+)`\*\*/g)) names.add(m[1]);
  }
  return names;
}

test('Handoff_EveryAgentImplementStartsSaysItsReportStartsWithTheStatusLine', () => {
  assert.ok(!agentSaysStatusLine(OPPOSITE_AGENT), 'planted agent text without the sentence must be rejected');

  const agents = buildAgentSet();
  assert.ok(agents.size >= 10, `the derived agent set must have at least 10 members (got ${agents.size}: ${[...agents].join(', ')})`);
  for (const name of ['story-understand-agent', 'implement-planner-agent', 'evaluator-agent', 'acceptance-test-agent', 'architect-reviewer-agent', 'security-reviewer-agent', 'loosened-reviewer-agent', 'coverage-auditor-agent', 'story-pr-agent', 'debug-agent']) {
    assert.ok(agents.has(name), `the derived agent set must include ${name}`);
  }

  const missing = [];
  for (const name of agents) {
    const file = path.join(REPO_ROOT, 'agents', `${name}.md`);
    assert.ok(fs.existsSync(file), `agent file must exist: agents/${name}.md`);
    if (!agentSaysStatusLine(read('agents', `${name}.md`))) missing.push(name);
  }
  assert.deepStrictEqual(missing, [], `AC3/AC5: these agent files lack the status-line sentence: ${missing.join(', ')}`);
});

// ── AC4 ───────────────────────────────────────────────────────────────

test('Handoff_SkillActsOnTheShortResultAndNeverReReads', () => {
  assert.ok(!neverReReads(OPPOSITE_SKILL), 'planted "re-reads logs" text must be rejected');
  assert.ok(!asksNarrowerQuestion(OPPOSITE_SKILL), 'planted text without a narrower question must be rejected');

  const skill = section(read('skills', 'implement', 'SKILL.md'), '## Work handed to agents');
  assert.ok(skill, 'AC4: SKILL.md must have a "## Work handed to agents" section');
  assert.ok(skill.includes('rules/agent-handoff.md'), 'AC4: the section must point at rules/agent-handoff.md');
  assert.ok(neverReReads(skill), "AC4: the section must say the main session never re-reads an agent's logs or transcript, re-runs its commands, or opens the files it wrote");
  assert.ok(asksNarrowerQuestion(skill), 'AC4: the section must say it asks one narrower question instead');
});
