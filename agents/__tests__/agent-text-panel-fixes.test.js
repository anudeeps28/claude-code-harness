'use strict';
// The agents' own text, moved out of skills/implement/__tests__/panel-fixes.probe.test.js (story
// #6j2mgpH6529FcgJ2, check 5): where the planner and the reviewers say the Goal lives. The probe keeps what
// /implement's SKILL.md says; the agent sentences are asserted here, under the same test names and messages.

const test = require('node:test');
const assert = require('node:assert');

const { readAgent, flat } = require('./helpers.js');

function slice(content, prefix) {
  const lines = content.split('\n');
  const start = lines.findIndex((l) => l.startsWith(prefix));
  if (start === -1) return null;
  const level = prefix.match(/^#+/)[0].length;
  let inFence = false;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith('```')) inFence = !inFence;
    else if (!inFence) {
      const m = lines[i].match(/^(#+) /);
      if (m && m[1].length <= level) { end = i; break; }
    }
  }
  return lines.slice(start, end).join('\n');
}

const PLANNER = readAgent('implement-planner-agent.md');

test('Goal_HasOneHome_BriefForAStory_TestStrategyForAFeature', () => {
  // The planner does not write a Goal block into the plan, and says where the Goal lives.
  // Any line that opens with **Goal:** is a Goal block in the plan, filled or empty.
  const hasGoalBlock = (t) => /^\s*\*\*Goal:\*\*/m.test(t);
  assert.ok(hasGoalBlock('**Goal:** e2e through the API, gate: curl returns 200'), 'planted filled Goal line is caught');
  assert.ok(hasGoalBlock('**Goal:**\n'), 'planted empty Goal line is caught');
  assert.ok(!hasGoalBlock('Do not write a `**Goal:**` block.'), 'companion: a mention is not a block');
  assert.ok(!hasGoalBlock(PLANNER), 'the planner writes no **Goal:** block');
  assert.match(flat(PLANNER), /`tasks\/stories\/<id>\/brief\.md`[^.]*under "Goal"[^.]*`tasks\/features\/<fid>\/test-strategy\.md`/);
  // The reviewers read it from there.
  for (const a of ['acceptance-test-agent', 'evaluator-agent']) {
    const t = flat(readAgent(`${a}.md`));
    assert.match(t, /`tasks\/stories\/<id>\/brief\.md`[^.]*Goal|brief\.md[^.]*"Goal"/, `${a} reads the Goal from brief.md`);
    assert.match(t, /`<state folder>\/features\/<fid>\/test-strategy\.md`/, `${a} reads a Feature's Goal from its test-strategy.md`);
  }
});

test('Goal_FeatureGoalIsWrittenByThePlanner_IntoTestStrategy_AndTheBriefTemplateHasTheHeading', () => {
  const writesGoal = (t) => /\bwrites? a `## Goal` section in `tasks\/features\/<fid>\/test-strategy\.md`/.test(flat(t));
  const goalSection = slice(PLANNER, '### Goal and proofs');
  assert.ok(goalSection, 'the planner has a Goal and proofs section');
  assert.ok(writesGoal(goalSection), 'the planner\'s Goal and proofs section says it writes the Goal for a Feature');
  assert.doesNotMatch(flat(goalSection), /Read it from there/, 'the planner no longer reads a Feature Goal that nobody wrote');
  const bullet = flat(PLANNER).match(/- `tasks\/features\/<fid>\/test-strategy\.md` [^]*?numbered `F\.<n>`/);
  assert.ok(bullet, 'companion: the planner bullet on test-strategy.md was found');
  assert.match(bullet[0], /opens with the Feature's `## Goal` section/, 'the planner bullet names the Goal section');
});
