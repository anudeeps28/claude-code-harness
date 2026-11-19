'use strict';
// Every tracker adapter's get-issue.sh emits a `**Type:**` line. Moved out of
// skills/implement/__tests__/tdd-mode.probe.test.js (story #6j2mgpH6529FcgJ2, check 5): a promise written in the
// trackers module's own scripts is asserted in the trackers module's own tests, under the same test name and message.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const read = (...parts) => fs.readFileSync(path.join(__dirname, '..', ...parts), 'utf8').replace(/\r\n/g, '\n');

test('D10_EveryTrackerAdapterEmitsATypeLine', () => {
  for (const tracker of ['ado', 'github', 'local', 'todoist']) {
    const script = read(tracker, 'get-issue.sh');
    assert.ok(
      /\*\*Type:\*\*/.test(script),
      `trackers/${tracker}/get-issue.sh must emit a "**Type:**" line so the planner never guesses whether an item is a bug (D10)`
    );
  }
});
