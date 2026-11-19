'use strict';
// The hooks README no longer lists the retired plan-lint hook. Moved out of
// skills/implement/__tests__/one-loop.probe.test.js (story #6j2mgpH6529FcgJ2, check 5): a promise written in
// the hooks module's own README is asserted in the hooks module's own tests.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8').replace(/\r\n/g, '\n');
const must = (text, re, message) => assert.ok(re.test(text), message);
const mustNot = (text, re, message) => assert.ok(!re.test(text), message);

test('PlanLint_Retired', () => {
  must(read('README.md'), /catalog-trigger\.js/, 'companion: the hooks README was read');
  mustNot(read('README.md'), /plan-lint/, 'hooks/README.md has no plan-lint row');
});
