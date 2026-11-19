// Doc-consistency probe for what /sync-tracker itself says about the closing check (2026-11-03).
// Moved here from /implement's one-gate probe: a test of /implement may not read another skill's
// SKILL.md (rules/modules.md, "Tests check the interface").

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// CRLF on a Windows checkout (core.autocrlf=true) would break every pattern that spans a line end.
const SYNC = fs.readFileSync(path.join(__dirname, '..', 'SKILL.md'), 'utf8').replace(/\r\n/g, '\n');

function section(content, heading) {
  const lines = content.replace(/\r/g, '').split('\n');
  const start = lines.findIndex((l) => l.startsWith(heading));
  if (start === -1) return null;
  const level = heading.match(/^#+/)[0].length;
  let inFence = false;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith('```')) inFence = !inFence;
    else if (!inFence) {
      const h = lines[i].match(/^(#+) /);
      if (h && h[1].length <= level) { end = i; break; }
    }
  }
  return lines.slice(start, end).join('\n');
}

function mustMatch(content, re, message) { assert.ok(content && re.test(content), message); }

test('ClosingCheck_RunsWhereTheLastItemCloses', () => {
  mustMatch(section(SYNC, '## Step 6.3'), /\/coverage-audit/, '/sync-tracker runs it when the last item closes');
  mustMatch(SYNC, /held: coverage lines open/, '/sync-tracker never closes an item whose lines are open');
});
