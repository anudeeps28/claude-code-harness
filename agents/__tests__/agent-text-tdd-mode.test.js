'use strict';
// The agents' own text, moved out of skills/implement/__tests__/tdd-mode.probe.test.js (story
// #6j2mgpH6529FcgJ2, check 5): how the planner takes an item's type, and what the acceptance agent may write.
// The probe keeps what /implement's SKILL.md says; the agent sentences are asserted here, under the same test
// names and messages.

const test = require('node:test');

const { readAgent, mustMatch } = require('./helpers.js');

// One planner since F7 (ADR-0001). The map keeps its name so each check below reads the same as before.
const BOTH_PLANNERS = { 'agents/implement-planner-agent.md': readAgent('implement-planner-agent.md') };

test('D10_PlannersReadTheTypeFromTheTrackerNotFromProse', () => {
  for (const [name, content] of Object.entries(BOTH_PLANNERS)) {
    mustMatch(
      content,
      /\bType:\B|tracker[^\n]*type|type[^\n]*tracker/i,
      `${name} must take the item type from the tracker, not infer it from the description (D10)`
    );
  }
});

test('D10_AnUnknownTypeIsSafe', () => {
  for (const [name, content] of Object.entries(BOTH_PLANNERS)) {
    mustMatch(
      content,
      /unknown|empty|unavailable|cannot say|not set/i,
      `${name} must state that an absent type behaves as today — only "bug" changes anything (D10)`
    );
  }
});

// An agent contract forbade what the orchestrating skill required of it.
test('Final_AcceptanceAgentMayWriteItsOwnReport', () => {
  mustMatch(
    readAgent('acceptance-test-agent.md'),
    /Writing your own report file is allowed/i,
    'agents/acceptance-test-agent.md must permit writing acceptance.md — the skills require it as a handoff artifact and /improve-harness skips stories without it'
  );
});
