// Doc-consistency probe for what /coverage-audit itself says about the closing check (2026-11-03).
// Moved here from /implement's one-gate probe: a test of /implement may not read another skill's
// SKILL.md (rules/modules.md, "Tests check the interface"). The auditor agent's own text is checked in
// agents/__tests__/agent-text.test.js.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// CRLF on a Windows checkout (core.autocrlf=true) would break every pattern that spans a line end.
const AUDIT_SKILL = fs.readFileSync(path.join(__dirname, '..', 'SKILL.md'), 'utf8').replace(/\r\n/g, '\n');

function mustMatch(content, re, message) { assert.ok(content && re.test(content), message); }

test('ClosingCheck_AFreshAgentReadsTheDocumentAgainstTheCode', () => {
  mustMatch(AUDIT_SKILL, /coverage-auditor-agent/, '/coverage-audit spawns the auditor');
  mustMatch(AUDIT_SKILL, /Give it nothing else: not the coverage table's mapping, not plans/, 'the auditor is not given the plans');
  mustMatch(AUDIT_SKILL, /never self-answered, in any mode/, 'what becomes of a gap is the person\'s call');
  mustMatch(AUDIT_SKILL, /source-lines\.js"? audit/, 'completion is checked by the script');
});
