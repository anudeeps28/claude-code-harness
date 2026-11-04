// Doc-consistency probe for the three ported story agents (Feature 72, story 76). Nothing parses
// agent prose, so a file that loses a sentence does not throw; this probe pins it. Content
// predicates are tested twice: against planted text asserting the OPPOSITE (must be rejected) and
// against the real file (the enforcement).

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
// CRLF on a Windows checkout would break every pattern that spans a line end.
const readFile = (...p) => fs.readFileSync(path.join(REPO_ROOT, ...p), 'utf8').replace(/\r\n/g, '\n');
const flat = (s) => s.replace(/\s+/g, ' ');

const AGENTS = ['story-builder', 'story-reviewer', 'suite-runner'];
const readAgent = (name) => { try { return readFile('agents', `${name}.md`); } catch { return null; } };

// ── predicates ────────────────────────────────────────────────────────

const AGENT_SENTENCE =
  'Your report starts with one line: `STATUS: DONE`, `STATUS: DONE_WITH_CONCERNS`, `STATUS: BLOCKED` or `STATUS: NEEDS_CONTEXT` (`rules/agent-handoff.md`).';
const agentSaysStatusLine = (t) => flat(t).includes(AGENT_SENTENCE);

// Every sentence that mentions git add / commit / push must start with "Do not" or "never".
const gitMentions = (t) => flat(t).split(/(?<=[.!?])\s+|\n/).filter((s) => /\bgit (add|commit|push)\b/i.test(s));
const gitOnlyForbidden = (t) => {
  const s = gitMentions(t);
  return s.length > 0 && s.every((x) => /^\W*(do not|never)\b/i.test(x.trim()));
};
const reportsTestNameCriterionAssertion = (t) =>
  /per test[^.\n]*\bname\b[^.\n]*\b(AC|criterion)\b[^.\n]*assertion line it failed on/i.test(flat(t));
const reReviewJudgesFixDiffOnly = (t) =>
  /Re-review judges each open finding ADDRESSED or NOT ADDRESSED over the fix diff only/.test(flat(t));
const suiteReturnsOnlySummary = (t) =>
  /(^|\s)No passing test names, no logs\.(\s|$)/.test(flat(t)) &&
  /Per failing test: its full name and its first error line/i.test(flat(t));
const toolsLine = (t) => (t.match(/^tools:\s*(.*)$/m) || [])[1];
const hasModel = (t, m) => new RegExp(`^model: ${m}$`, 'm').test(t);
const trackerOnly = (t) => /\baz\b|ado-commands|work item|tasks\/build-commands\.md|journal/i.test(t);

// ── planted opposites ─────────────────────────────────────────────────

const OPPOSITE_BUILDER = 'When the tests are green, run git commit and then git push.\nNever skip the tests.';
const OPPOSITE_TOOLS = 'tools: Read, Write, Edit, Glob, Grep, Bash';
const OPPOSITE_ADO = 'Update the work item with az boards, then add a journal entry.';
const OPPOSITE_AGENT = AGENT_SENTENCE.replace('starts with one line', 'may start with one line');
const OPPOSITE_COUNT = 'Per test give its name, AC id and the assertion it passed on.';
const OPPOSITE_REREVIEW =
  'Re-review does not judge each open finding ADDRESSED or NOT ADDRESSED over the fix diff only; it reviews the whole story again';
const OPPOSITE_SUITE =
  'Per failing test: its full name and its first error line. No passing test names, no logs is not required: include the passing test names and the full log, not only the first error line.';

// ── AC1 / AC2 ─────────────────────────────────────────────────────────

test('Builder_ReportsTestsWithCriterionAndFailingAssertion_NeverCommits', () => {
  assert.ok(!gitOnlyForbidden(OPPOSITE_BUILDER), 'planted "run git commit when green" must be rejected');
  assert.ok(!reportsTestNameCriterionAssertion(OPPOSITE_COUNT), 'planted "assertion it passed on" must be rejected');

  const t = readAgent('story-builder');
  assert.ok(t, 'AC1: agents/story-builder.md must exist');
  assert.ok(reportsTestNameCriterionAssertion(t), 'AC2: per test the report gives its name, its AC id and the assertion line it failed on');
  assert.ok(gitMentions(t).length > 0, 'AC2: the file must say something about git add / commit / push');
  assert.ok(gitOnlyForbidden(t), 'AC2: every git add / commit / push mention must sit in a sentence starting "Do not" or "never"');
});

// ── AC3 ───────────────────────────────────────────────────────────────

test('Reviewer_EditsNothing_ReReviewIsAddressedOrNotOverTheFixDiff', () => {
  assert.notStrictEqual(toolsLine(OPPOSITE_TOOLS), 'Read, Glob, Grep, Bash', 'planted write-capable tools must be rejected');
  assert.ok(!reReviewJudgesFixDiffOnly(OPPOSITE_REREVIEW), 'planted "re-review the whole story" must be rejected');

  const t = readAgent('story-reviewer');
  assert.ok(t, 'AC3: agents/story-reviewer.md must exist');
  assert.ok(/^tools: Read, Glob, Grep, Bash$/m.test(t), 'AC3: tools must be exactly Read, Glob, Grep, Bash');
  for (const mode of ['Correctness', 'Rules and quality', 'Re-review', 'Cross-story']) {
    assert.ok(t.includes(mode), `AC3: the reviewer must name the mode "${mode}"`);
  }
  assert.ok(reReviewJudgesFixDiffOnly(t), 'AC3: Re-review judges each open finding ADDRESSED or NOT ADDRESSED over the fix diff only');
});

// ── AC4 ───────────────────────────────────────────────────────────────

test('SuiteRunner_ReturnsOnlyTheSummaryAndFirstErrorLine', () => {
  assert.ok(!suiteReturnsOnlySummary(OPPOSITE_SUITE), 'planted "include names and the full log" must be rejected');

  const t = readAgent('suite-runner');
  assert.ok(t, 'AC4: agents/suite-runner.md must exist');
  assert.ok(suiteReturnsOnlySummary(t), 'AC4: must say "No passing test names, no logs" and report each failing test\'s first error line');
});

// ── AC1 / AC5 ─────────────────────────────────────────────────────────

test('StoryAgents_RunOnSonnetAndStartWithStatus', () => {
  assert.ok(!hasModel('model: opus', 'sonnet'), 'planted opus model must be rejected');
  assert.ok(!agentSaysStatusLine(OPPOSITE_AGENT), 'planted text without the sentence must be rejected');

  for (const name of AGENTS) {
    const t = readAgent(name);
    assert.ok(t, `AC1: agents/${name}.md must exist`);
    assert.ok(hasModel(t, 'sonnet'), `AC5: ${name} must have "model: sonnet"`);
    assert.ok(agentSaysStatusLine(t), `AC1: ${name} must carry the STATUS-line sentence`);
  }
});

// ── AC1 ───────────────────────────────────────────────────────────────

test('StoryAgents_NoTrackerOnlySteps', () => {
  assert.ok(trackerOnly(OPPOSITE_ADO), 'planted ADO line must be caught by the predicate');

  for (const name of AGENTS) {
    const t = readAgent(name);
    assert.ok(t, `AC1: agents/${name}.md must exist`);
    assert.ok(!trackerOnly(t), `AC1: ${name} must have no ADO / journal / build-commands steps`);
  }
});

// ── Technical requirement: test-rules reference ───────────────────────

// One whole-claim check per bold lead-in of test-rules.md, keyed by the lead-in's opening words.
const RULE_CHECKS = {
  'Write the tests before the implementation': /Write the tests before the implementation\.\*\* Write them from the criteria text and nothing else/,
  'A criterion about a screen also gets an end-to-end test that drives the screen': /A criterion about a screen also gets an end-to-end test that drives the screen\*\*, when the project has an end-to-end test command/,
  'A red test must fail on its assertion': /Add the smallest stub the test needs to compile[^.]*run it again, and show it failing on the assertion/,
  'The expected value never comes from the code under test': /The expected value never comes from the code under test\.\*\* Write it as a literal or a hand-checked fixture/,
  'No assertion on a mock': /No assertion on a mock\.\*\* A check that a mock[^.]*tests the mock, not the code/,
  'Wait for a condition, never for a time': /poll for the condition with a timeout[^.]*rather than sleeping/,
  'A test that asserts an absence can pass while proving nothing': /every absence assertion gets a companion in the same test that proves the thing it is searching was actually there/,
  'A test over content can match the words instead of the claim': /The negation of Y contains all of Y's words/,
  "Do not let a test's data be a list of what you touched": /Work out the set instead: scan for the condition the rule describes and let the scan find the members/,
  'No test that cannot fail': /name the change to the code that would turn it red[\s\S]*?the test proves nothing: fix it or delete it/,
};
const leadIns = (t) => [...t.matchAll(/^\*\*(.+?)\*\*/gm)].map((m) => m[1].replace(/[.,]$/, ''));
const ruleHolds = (t, lead) => RULE_CHECKS[lead] instanceof RegExp && RULE_CHECKS[lead].test(flat(t));
// One planted same-word negation per rule; each must be rejected by that rule's check.
const RULE_PLANTS = [
  ['Write the tests before the implementation', '**Write the tests before the implementation.** Write them from the code, not the criteria text and nothing else.'],
  ['A criterion about a screen also gets an end-to-end test that drives the screen', '**A criterion about a screen also gets an end-to-end test that drives the screen**, never when the project has an end-to-end test command.'],
  ['A red test must fail on its assertion', 'Add the smallest stub the test needs to compile, run it again, and never show it failing on the assertion.'],
  ['The expected value never comes from the code under test', '**The expected value always comes from the code under test.** Write it as a literal or a hand-checked fixture.'],
  ['No assertion on a mock', '**No assertion on a mock.** A check that a mock was set up tests the code, not the mock.'],
  ['Wait for a condition, never for a time', 'In any test, never poll for the condition with a timeout; sleep rather than polling.'],
  ['A test that asserts an absence can pass while proving nothing', 'no absence assertion gets a companion in the same test that proves the thing it is searching was actually there'],
  ['A test over content can match the words instead of the claim', "The negation of Y contains none of Y's words"],
  ["Do not let a test's data be a list of what you touched", 'Work out the set instead: scan for the condition the rule describes and never let the scan find the members.'],
  ['No test that cannot fail', 'name the change to the code that would turn it red. If none exists, the test proves nothing: keep it.'],
];

test('TestRules_CarriedAcross', () => {
  assert.deepStrictEqual(RULE_PLANTS.map(([k]) => k).sort(), Object.keys(RULE_CHECKS).sort(), 'every rule check needs a planted opposite');
  for (const [key, plant] of RULE_PLANTS) {
    assert.ok(!ruleHolds(plant, key), `planted opposite of "${key}" must be rejected`);
  }

  let t = null;
  try { t = readFile('skills', 'implement', 'reference', 'test-rules.md'); } catch { /* absent */ }
  assert.ok(t, 'skills/implement/reference/test-rules.md must exist');
  const leads = leadIns(t);
  assert.ok(leads.length >= 9, `test-rules.md must carry at least 9 bold rules, found ${leads.length}`);
  for (const lead of leads) {
    const key = Object.keys(RULE_CHECKS).find((k) => lead === k);
    assert.ok(key, `rule "${lead}" has no check in this probe`);
    assert.ok(RULE_CHECKS[key].test(flat(t)), `test-rules.md must carry the whole claim of: ${key}`);
  }
  for (const key of Object.keys(RULE_CHECKS)) {
    assert.ok(leads.includes(key), `test-rules.md lost the rule: ${key}`);
  }
  assert.ok(!/playwright|SoftwareFactory/i.test(flat(t)), 'test-rules.md must drop Playwright video and factory paths');
});
