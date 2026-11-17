'use strict';
// The renamed role agents' own `name:` field. Moved out of
// skills/implement/__tests__/trustworthy-builds.probe.test.js (story #6j2mgpH6529FcgJ2, check 5): an agent's own
// text is asserted in agents/__tests__, under the same test name and messages.

const test = require('node:test');

const { readAgent, mustMatch } = require('./helpers.js');


test('Names_RoleAgentsAreRenamed', () => {
  mustMatch(readAgent('build-session.md'), /^name: build-session$/m, 'build-session.md name: field');
  mustMatch(readAgent('review-session.md'), /^name: review-session$/m, 'review-session.md name: field');
});
