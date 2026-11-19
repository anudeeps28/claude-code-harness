// Doc-consistency probe for the three ported story agents (Feature 72, story 76). Nothing parses
// agent prose, so a file that loses a sentence does not throw; this probe pins it. Content
// predicates are tested twice: against planted text asserting the OPPOSITE (must be rejected) and
// against the real file (the enforcement).
//
// What the story agents' own files say (their report line, tools, model and git rules) is asserted in
// agents/__tests__/agent-text.test.js, under the same test names: a test of /implement may not read an
// agent's file (rules/modules.md, "Tests check the interface"). This file keeps what /implement itself
// carries: the test-rules reference.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const OWN = path.join(__dirname, '..');
// CRLF on a Windows checkout would break every pattern that spans a line end.
const readFile = (...p) => fs.readFileSync(path.join(OWN, ...p), 'utf8').replace(/\r\n/g, '\n');
const flat = (s) => s.replace(/\s+/g, ' ');

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
  try { t = readFile('reference', 'test-rules.md'); } catch { /* absent */ }
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
