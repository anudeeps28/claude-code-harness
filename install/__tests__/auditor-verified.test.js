// The installer verifies the closing-check auditor: moved here from /implement's one-gate probe, because
// a test of /implement may not read the installer's source (rules/modules.md, "Tests check the interface").

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

function mustMatch(content, re, message) { assert.ok(content && re.test(content), message); }

test('ClosingCheck_RunsWhereTheLastItemCloses', () => {
  const updater = fs.readFileSync(path.join(__dirname, '..', 'lib', 'updater.js'), 'utf8').replace(/\r\n/g, '\n');
  mustMatch(updater, /'agents\/coverage-auditor-agent\.md'/, 'the installer verifies the auditor');
});
