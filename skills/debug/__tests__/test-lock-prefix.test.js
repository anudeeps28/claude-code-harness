'use strict';
// /debug's own words about the `Test lock:` prefix. Moved out of
// skills/implement/__tests__/several-sessions.probe.test.js (story #6j2mgpH6529FcgJ2, check 5): a promise written
// in another module's body is asserted in that module's own tests, under the same test name and messages.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const flat = (t) => t.replace(/\*\*/g, '').replace(/\s+/g, ' ');

test('Sessions_TestLockInTheBriefsAndInBuilderRunnerProver', () => {
  // The skill that runs the feedback loop carries the same rule, in its own words.
  const dbg = flat(fs.readFileSync(path.join(__dirname, '..', 'SKILL.md'), 'utf8').replace(/\r\n/g, '\n'));
  assert.match(dbg, /`Test lock:` prefix/, '/debug names the Test lock prefix');
  assert.ok(/with it in front \(`<prefix> <command>`\)/.test(dbg), '/debug puts the prefix in front of each command');
  assert.match(dbg, /compound command[^.]*`a && b`[^.]*not wrapped[^.]*wrap each/i);
  assert.match(dbg, /never wrap a long-running start command[^.]*lock for the server's life/i);
});
