'use strict';
// /tdd's own text about the --tdd mode. Moved out of skills/implement/__tests__/tdd-mode.probe.test.js (story
// #6j2mgpH6529FcgJ2, check 5): a promise written in another module's body is asserted in that module's own tests,
// under the same test names and messages.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// assert.match dumps the entire file into the failure output, which is useless for files this size.
// These keep the message and drop the haystack.
function mustMatch(content, re, message) {
  assert.ok(re.test(content), message);
}

const TDD_SKILL = fs.readFileSync(path.join(__dirname, '..', 'SKILL.md'), 'utf8').replace(/\r\n/g, '\n');

test('D12_TddSkillCrossReferencesTheMode', () => {
  mustMatch(
    TDD_SKILL,
    /--tdd/,
    'skills/tdd/SKILL.md must point at the --tdd mode so the two are kept in step, not allowed to drift (D12)'
  );
});

test('D12_TddSkillStillStopsWhenATestPassesTooEarly', () => {
  mustMatch(
    TDD_SKILL,
    /passed before writing any code|test passed/i,
    'skills/tdd/SKILL.md already stops when a test passes before any code exists — that behaviour must survive (D12)'
  );
});

// /tdd said what a real failure is by pointing at the executor's Step 3.5. The executor is gone; the
// rules a test is written by are in the implement skill's reference.
test('D12_TddSkillPointsAtTheTestRulesNotTheExecutor', () => {
  mustMatch(
    TDD_SKILL,
    /skills\/implement\/reference\/test-rules\.md/,
    'skills/tdd/SKILL.md must point at skills/implement/reference/test-rules.md for what a real failing test is'
  );
  assert.ok(!/story-executor-agent|Step 3\.5/.test(TDD_SKILL), 'skills/tdd/SKILL.md must not point at the retired executor or its Step 3.5');
});
