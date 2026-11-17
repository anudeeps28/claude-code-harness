'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const boundaries = require('../lib/boundaries.js');
const { repoRoot, withBlock, inFixture } = require('./helpers.js');
const { checkInterfaces, checkCallableParts, checkSkillUsage } = boundaries;

// The word is assembled so that this file itself does not contain it.
const WAITING_WORD = new RegExp('PEN' + 'DING', 'i');

// Story #6j2mgp8CJ6mRHW32 (FQ21): boundaries-tests.test.js holds the list of tests that story #6j2mgpH6529FcgJ2
// still has to rework, so it is the one file this guard does not read. Story 7 deletes the list and this skip.
const SKIPPED = ['boundaries-tests.test.js'];

test('no check takes a skip list (AC2, AC12)', () => {
  assert.deepEqual(SKIPPED, ['boundaries-tests.test.js'], 'the guard skips exactly one file');
  assert.ok(fs.existsSync(path.join(__dirname, SKIPPED[0])), 'the skipped file exists');
  const tests = fs.readdirSync(__dirname)
    .filter((f) => /^boundaries-.*\.test\.js$/.test(f) && !SKIPPED.includes(f))
    .map((f) => `scripts/__tests__/${f}`);
  const libs = fs.readdirSync(path.join(repoRoot, 'scripts', 'lib')).map((f) => `scripts/lib/${f}`);
  const files = [...tests, ...libs];
  assert.ok(tests.length >= 6 && libs.length >= 6, 'the test and lib files were found');
  for (const rel of files) {
    const text = fs.readFileSync(path.join(repoRoot, rel), 'utf8');
    assert.ok(text.length > 0, `${rel} was read`);
    assert.ok(!WAITING_WORD.test(text), `${rel} still has a list of modules without a block`);
  }
  // A list under another name, or passed another way, still needs a second parameter: every exported
  // check takes the repo root alone (the options object is a defaulted parameter, which `.length` skips).
  const checks = Object.entries(boundaries).filter(([name]) => name.startsWith('check'));
  assert.ok(checks.length >= 7, 'the exports include the checks');
  assert.ok(checks.some(([name]) => name === 'checkTestReads'), 'check 5 (checkTestReads) is one of the checks');
  for (const [name, fn] of checks) assert.equal(fn.length, 1, `${name} takes more than the repo root`);
  // And the options object takes `exempt` only, on every exported check.
  for (const [name, fn] of checks) {
    assert.throws(() => fn(repoRoot, { skip: ['s'] }), /skip/, `${name} accepted the option "skip"`);
    assert.doesNotThrow(() => fn(repoRoot, { exempt: [] }), `${name} refused the option "exempt"`);
  }
  inFixture({ 'skills/s/SKILL.md': withBlock({}) }, (root) => {
    for (const fn of [checkInterfaces, checkCallableParts, checkSkillUsage]) {
      assert.throws(() => fn(root, { skip: ['s'] }), /skip/, `${fn.name} accepted the option "skip"`);
      assert.doesNotThrow(() => fn(root, { exempt: ['s'] }));
    }
  });
});

