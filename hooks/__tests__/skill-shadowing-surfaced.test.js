'use strict';
// A skill shadowed by a user-level one is detectable, and the session-start message shows it. Moved out of
// skills/implement/__tests__/tdd-mode.probe.test.js (story #6j2mgpH6529FcgJ2, check 5): a promise written in the
// hooks module's own files is asserted in the hooks module's own tests, under the same test name and messages.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// A user-level skill silently shadows a project skill of the same name, so a dogfooding run can
// execute a stale flow and report success.
test('Run1_SkillShadowingIsDetectable', () => {
  const lib = path.join(__dirname, '..', 'lib', 'skill-shadowing.js');
  assert.ok(fs.existsSync(lib), 'hooks/lib/skill-shadowing.js must exist — a user-level skill silently shadows a project skill of the same name, so a dogfooding run can execute a stale flow and report success');
  const startMsg = fs.readFileSync(path.join(__dirname, '..', 'session-start-msg.js'), 'utf8').replace(/\r\n/g, '\n');
  assert.ok(
    /skill-shadowing/.test(startMsg),
    'hooks/session-start-msg.js must surface the shadowing warning at session start — detection nobody sees is not detection'
  );
});
