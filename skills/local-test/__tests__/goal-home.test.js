'use strict';
// /local-test's own e2e section: where a story's Goal and a Feature's Goal are read from. Moved out of
// skills/implement/__tests__/panel-fixes.probe.test.js (story #6j2mgpH6529FcgJ2, check 5): a promise written in
// another module's body is asserted in that module's own tests, under the same test name and messages.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const LOCAL_TEST = fs.readFileSync(path.join(__dirname, '..', 'SKILL.md'), 'utf8').replace(/\r\n/g, '\n');
const flat = (t) => t.replace(/\*\*/g, '').replace(/\s+/g, ' ');

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

test('Goal_HasOneHome_BriefForAStory_TestStrategyForAFeature', () => {
  const readsGoal = (t) => {
    const f = flat(t);
    return /For a story id[^.]*`tasks\/stories\/<id>\/brief\.md`[^.]*Goal/i.test(f)
      && /Feature id[^.]*`tasks\/features\/<fid>\/test-strategy\.md`/i.test(f);
  };
  assert.ok(!readsGoal('For a story id read `tasks/stories/<id>/test-strategy.md` and its Goal.'), 'planted opposite is rejected');
  const e2e = slice(LOCAL_TEST, '### e2e');
  assert.ok(e2e, 'local-test has an e2e section');
  assert.ok(readsGoal(e2e), '/local-test e2e reads a story\'s Goal from brief.md and a Feature\'s from its test-strategy.md');
});
