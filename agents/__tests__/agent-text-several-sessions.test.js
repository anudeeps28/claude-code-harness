'use strict';
// The agents' own text, moved out of skills/implement/__tests__/several-sessions.probe.test.js (story
// #6j2mgpH6529FcgJ2, check 5): the test lock in the agents that run suites, and the planner's rule for numbered
// files. The probe keeps what /implement's SKILL.md says; the agent sentences are asserted here, under the same
// test names and messages.

const test = require('node:test');
const assert = require('node:assert');

const { readAgent: read, flat, suiteRunningAgents, allAgentTexts } = require('./helpers.js');

const PLANNER = read('implement-planner-agent.md');

// The agents that run build, test or Observe commands in a Feature run, derived from the agents' own text
// (helpers.js). The /implement skill's lock paragraph is derived separately, and
// scripts/__tests__/boundaries-lock-agents.test.js asserts the two name the same agents.
const AGENTS = suiteRunningAgents(allAgentTexts());

test('Sessions_TestLockInTheBriefsAndInBuilderRunnerProver', () => {
  const prefixed = (t) => /run every build, test and Observe command with it in front/i.test(flat(t));
  assert.ok(!prefixed('run every build, test and Observe command without it in front'), 'the opposite claim is rejected');
  assert.ok(prefixed('run every build, test and Observe command with it in front'), 'the claim itself is accepted');
  assert.ok(AGENTS.length >= 7, `companion: the derivation found the agents that run suites, not none (got ${AGENTS.length}: ${AGENTS.join(', ')})`);
  for (const name of AGENTS) {
    const t = read(`${name}.md`);
    assert.match(t, /`Test lock:`/, `${name} names the Test lock prefix`);
    assert.ok(prefixed(t), `${name} runs every build, test and Observe command with the prefix in front`);
    assert.match(flat(t), /<prefix> <command>/, `${name} shows the shape`);
    assert.match(flat(t), /compound command[^.]*`a && b`[^.]*(?:not|never) wrapped[^.]*wrap each/i, `${name}: a compound command is wrapped one command at a time`);
    assert.match(flat(t), /(?:wait|waits) over 60 minutes \(exit 3\)[^.]*`STATUS: BLOCKED`[^.]*owner/i, `${name}: a lock wait over 60 minutes is BLOCKED with the owner`);
    assert.match(flat(t), /never wrap a long-running start command[^.]*(?:"Start the app")?[^.]*lock for the server's life/i, `${name}: a long-running start command is never wrapped (A6)`);
  }
});

// A6: a long-running start command is never wrapped, in every place that tells how to use the lock.
test('Sessions_LongRunningStartCommandIsNeverWrapped', () => {
  const never = (t) => /never wrap a long-running start command[^.]*lock for the server's life/i.test(flat(t));
  for (const a of ['story-builder', 'suite-runner', 'prover']) assert.ok(never(read(`${a}.md`)), a);
});

test('Sessions_NumberedFilesAreReserved', () => {
  assert.match(flat(PLANNER), /numbered file takes a number that no other `tasks\/features\/\*\/plan\.md` names/);
  assert.match(PLANNER, /Reserves: <name>-<n>/);
});
