// Doc-consistency probe for what /local-test itself says about the e2e gate (F3 #40 "never SKIPPED").
// Moved here from /implement's every-feature-has-a-demo probe: a test of /implement may not read another
// skill's SKILL.md (rules/modules.md, "Tests check the interface").

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const LOCAL_TEST = fs.readFileSync(path.join(__dirname, '..', 'SKILL.md'), 'utf8');

function section(content, heading) {
  const lines = content.split('\n');
  const start = lines.findIndex((l) => l.startsWith(heading));
  if (start === -1) return null;
  let inFence = false;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith('```')) inFence = !inFence;
    else if (!inFence && /^#{2,3} /.test(lines[i])) { end = i; break; }
  }
  return lines.slice(start, end).join('\n');
}

function mustMatch(content, re, message) { assert.ok(content && re.test(content), message); }

test('NotSetUp_ReplacesSkippedForTheE2eGate', () => {
  const e2e = section(LOCAL_TEST, '### e2e');
  mustMatch(e2e, /NOT SET UP/, 'no e2e command reports NOT SET UP');
  mustMatch(e2e, /NOT SET UP[\s\S]{0,300}fail/i, 'NOT SET UP counts as a fail');
  mustMatch(e2e, /Observe → E2E command/, 'NOT SET UP names the Observe entry that is needed');
  assert.ok(!/SKIPPED/.test(e2e), 'the e2e gate never reports SKIPPED');
  mustMatch(e2e, /AWAITING HUMAN SIGN-OFF/, 'a structured human check still waits for a sign-off');
  mustMatch(e2e, /shape/i, 'a human check shows the shape of the evidence, never PHI');
});
