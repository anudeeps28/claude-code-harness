'use strict';
// The agents' own text, moved out of skills/implement/__tests__/agent-handoff.probe.test.js (story
// #6j2mgpH6529FcgJ2, check 5): every agent /implement starts says that its report starts with the STATUS line.
// The probe keeps the rule and its own skill; the sentence in each agent file is asserted here, under the same
// test name and assertion messages. The set is derived from the agents' own frontmatter, never listed:
// /implement's agents are the ones owned by `implement`, plus the `shared` ones it starts through /debug,
// /coverage-audit and its review panel.

const test = require('node:test');
const assert = require('node:assert');

const { readAgent, agentFiles, flat, ownerOf } = require('./helpers.js');
const AGENT_SENTENCE =
  'Your report starts with one line: `STATUS: DONE`, `STATUS: DONE_WITH_CONCERNS`, `STATUS: BLOCKED` or `STATUS: NEEDS_CONTEXT` (`rules/agent-handoff.md`).';
const agentSaysStatusLine = (t) => flat(t).includes(AGENT_SENTENCE);
const OPPOSITE_AGENT = '## Your report\n\nYour report does not start with a status line; just write prose.\n';

test('Handoff_EveryAgentImplementStartsSaysItsReportStartsWithTheStatusLine', () => {
  assert.ok(!agentSaysStatusLine(OPPOSITE_AGENT), 'planted agent text without the sentence must be rejected');

  const missing = [];
  let checked = 0;
  for (const file of agentFiles()) {
    const text = readAgent(file);
    if (!['implement', 'shared'].includes(ownerOf(text))) continue;
    checked++;
    if (!agentSaysStatusLine(text)) missing.push(file.slice(0, -3));
  }
  assert.ok(checked >= 10, `companion: the agents /implement starts were found (got ${checked})`);
  assert.deepStrictEqual(missing, [], `AC3/AC5: these agent files lack the status-line sentence: ${missing.join(', ')}`);
});
