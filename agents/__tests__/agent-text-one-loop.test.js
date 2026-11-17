'use strict';
// The agents' own text, moved out of skills/implement/__tests__/one-loop.probe.test.js (story
// #6j2mgpH6529FcgJ2, check 5): what the planner and story-pr-agent say about the per-story loop. The probe keeps
// what /implement's SKILL.md says; the agent sentences are asserted here, under the same test names and messages.

const test = require('node:test');
const assert = require('node:assert');

const { readAgent, flatPlain: flat } = require('./helpers.js');
// assert.match dumps the whole haystack on failure; these keep the message and drop it.
const must = (text, re, message) => assert.ok(re.test(text), message);
const mustNot = (text, re, message) => assert.ok(!re.test(text), message);

const noTaskXml = (t) => !/<tasks?[\s>]|parallel_group|<verify>/.test(t);

test('Standalone_PlanIsOneStorySection_NoTaskXml', () => {
  const planner = readAgent('implement-planner-agent.md');
  assert.ok(noTaskXml(planner), 'the planner emits no task XML, waves or verify blocks');
  mustNot(planner, /Execution Plan|must_fail/, 'the planner has no Execution Plan and no must_fail');
  must(planner, /^## Plan format/m, 'the planner has one "Plan format" for a Feature and a single story');
  must(flat(planner), /single story[^.]{0,160}one section|one section[^.]{0,160}single story/i, 'a single story is one section');
});

test('PrAgent_DraftsTheBodyOnly_TheLoopMakesTheCommits', () => {
  const t = flat(readAgent('story-pr-agent.md'));
  assert.ok(/one commit per (completed )?task/i.test('One commit per completed task.'), 'the pattern finds the old rule');
  assert.ok(t.length > 500, 'companion: the agent file was read');
  mustNot(t, /one commit per (completed )?task/i, 'no "one commit per task"');
  mustNot(t, /mark(s)? delivered tasks done/i, 'no "tasks done in the plan"');
});
