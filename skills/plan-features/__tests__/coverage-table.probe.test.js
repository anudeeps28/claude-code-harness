// Doc-consistency probe for what /plan-features itself says about the coverage table and the source
// lines (2026-11-03). Moved here from /implement's one-gate probe: a test of /implement may not read
// another skill's SKILL.md (rules/modules.md, "Tests check the interface"), and these promises are
// written in /plan-features's own body, so its own tests pin them, under the same names and messages.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const OWN = path.join(__dirname, '..');
// CRLF on a Windows checkout (core.autocrlf=true) would break every pattern that spans a line end.
const read = (...p) => fs.readFileSync(path.join(OWN, ...p), 'utf8').replace(/\r\n/g, '\n');
const PLAN_FEATURES = read('SKILL.md');

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

// ── 1. /plan-features: the coverage table ─────────────────────────────

test('PlanFeatures_NumbersEveryRequirementAndRefusesWhileUnmapped', () => {
  const phase = section(PLAN_FEATURES, '## Phase 2.5');
  assert.ok(phase, '/plan-features must have a Phase 2.5 that numbers the requirements of a document');
  mustMatch(phase, /sub-bullet/i, 'every sub-bullet is its own requirement');
  mustMatch(phase, /exactly one owner/i, 'each line maps to exactly one owner');
  mustMatch(phase, /Out of scope — <reason>/, 'out of scope carries a reason the person approves');
  mustMatch(phase, /tasks\/coverage\/<doc-slug>\.md/, 'the table is stored where later runs read it');
  mustMatch(phase, /source-lines\.js"? coverage/, 'the coverage gate is the script, not a reading');
  mustMatch(phase, /nothing is created while a line is unmapped/i, 'nothing is created while a line is unmapped');
});

test('PlanFeatures_StoriesCarryTheirLinesVerbatimAndTheApprovalShowsCoverage', () => {
  mustMatch(PLAN_FEATURES, /## Source requirements\n/, 'the story body has a Source requirements section');
  mustMatch(PLAN_FEATURES, /\*\*Source requirements\*\*[^\n]*verbatim/, 'the story field says verbatim');
  mustMatch(PLAN_FEATURES, /## Coverage\n/, 'the Feature body carries its coverage rows');
  mustMatch(section(PLAN_FEATURES, '## Phase 4'), /\*\*Coverage\*\*[\s\S]{0,400}Out of scope/, 'Phase 4 shows coverage and every out-of-scope line for approval');
  mustMatch(PLAN_FEATURES, /--gaps/, 'gaps found by the closing check become stories through the same table');
  mustMatch(read('reference', 'story-template.md'), /never replaces or narrows the quote/, 'the template keeps the quote ahead of the Given/When/Then');
});
