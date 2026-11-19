'use strict';
// The agents' own text, moved out of skills/implement/__tests__/one-build-skill.probe.test.js (story
// #6j2mgpH6529FcgJ2, check 5): what story-pr-agent and the planner say about the pack. The probe keeps what
// /implement's SKILL.md says; the agent sentences are asserted here, under the same test name and messages.

const test = require('node:test');

const { readAgent, mustMatch } = require('./helpers.js');


test('Pack_ImplementReadsItAndGatesTheEnterpriseSteps', () => {
  const pr = readAgent('story-pr-agent.md');
  mustMatch(pr, /## Step 6 — Update sprint Master Status Table \(enterprise only\)[\s\S]{0,300}solo install, skip this\s+step entirely/, 'story-pr-agent skips the table on solo');
  mustMatch(readAgent('implement-planner-agent.md'), /\*\*`Child tasks:`\*\*[\s\S]{0,300}per child task/, 'the planner knows the child-task rule (F73 #83: the plan has no task XML, so the rule no longer names a `<task>`)');
});
