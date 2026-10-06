// Doc-consistency probe for F3 #37: /to-issues gives every Feature and every standalone item a
// required "## Demo", refuses to create a Feature it cannot write one for, creates a single parentless
// item with --standalone, and suggests a split above 8 stories.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const SKILL = fs.readFileSync(path.join(REPO_ROOT, 'skills', 'to-issues', 'SKILL.md'), 'utf8');
const { KINDS } = require('../../implement/bin/demo.js');

function section(content, heading) {
  const lines = content.split('\n');
  const start = lines.findIndex((l) => l.startsWith(heading));
  if (start === -1) return null;
  let inFence = false;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith('```') || lines[i].startsWith('~~~')) inFence = !inFence;
    else if (!inFence && /^#{2,3} /.test(lines[i])) { end = i; break; }
  }
  return lines.slice(start, end).join('\n');
}

function mustMatch(content, re, message) { assert.ok(content && re.test(content), message); }

const FORMAT = section(SKILL, '### The Demo section');

test('Demo_FormatIsDefinedWithEveryKind', () => {
  assert.ok(FORMAT, 'expected a "### The Demo section" subsection');
  mustMatch(FORMAT, /## Demo/, 'the format must show the ## Demo heading');
  mustMatch(FORMAT, /Seen through:/, 'the format must show the "Seen through:" line');
  for (const k of KINDS) assert.ok(FORMAT.includes(k), `the format must list the "${k}" kind`);
});

test('Demo_HasAUiFormABackendFormAndABugForm', () => {
  mustMatch(FORMAT, /screen|route/i, 'a UI Demo names the screen or route');
  mustMatch(FORMAT, /read-only API/i, 'a backend Demo names the read-only API call');
  mustMatch(FORMAT, /rows/i, 'a backend Demo names the rows it shows');
  mustMatch(FORMAT, /bug[\s\S]{0,300}(was wrong|now right)/i, 'a bug Demo is the behaviour that was wrong and is now right');
  mustMatch(FORMAT, /failing test/i, 'under test-first a bug Demo is also the failing test');
});

test('Demo_FeatureBodyCarriesTheDemo', () => {
  const create = section(SKILL, '### 6a — Create the parent feature');
  mustMatch(create, /## Demo/, 'the Feature body must carry a ## Demo section');
});

test('Demo_NoVisibleResult_RefusesAndReCuts', () => {
  const gate = section(SKILL, '## Phase 3.7 — Demo gate');
  assert.ok(gate, 'expected a "## Phase 3.7 — Demo gate" before Phase 4');
  assert.ok(SKILL.indexOf('## Phase 3.7') < SKILL.indexOf('## Phase 4'), 'the Demo gate runs before Phase 4');
  mustMatch(gate, /Nothing has been created/, 'the refusal must say nothing was created');
  mustMatch(gate, /re-cut/i, 'the refusal must say how to re-cut the stories');
  mustMatch(gate, /demo\.js"? check/,'the gate must check each Demo with demo.js');
});

test('Demo_StandaloneCreatesOneParentlessItemWithADemo', () => {
  mustMatch(section(SKILL, '## Input'), /--standalone/, '--standalone must be a documented flag');
  const s = section(SKILL, '### Standalone items');
  assert.ok(s, 'expected a "### Standalone items" subsection');
  mustMatch(s, /exactly one/i, '--standalone creates exactly one item');
  mustMatch(s, /no parent/i, 'a standalone item has no parent');
  mustMatch(s, /TRACKER_ITEM_TYPE=(Story|Bug)/, 'a standalone item sets its type');
  mustMatch(s, /## Demo/, 'a standalone item still gets a Demo');
  mustMatch(s, /without it[\s\S]{0,200}parent Feature/i, 'without --standalone even a single story gets a parent Feature');
});

test('Demo_SoftLimitOfEight', () => {
  const review = section(SKILL, '## Phase 4 — Review with user');
  mustMatch(review, /more than 8 stories/i, 'Phase 4 must flag more than 8 stories');
  mustMatch(review, /two Features, each with\s+its own Demo/i, 'the suggestion is two Features, each with its own Demo');
  assert.ok(!/Max 12 stories/.test(SKILL), 'the old "Max 12 stories" constraint must be gone');
});
