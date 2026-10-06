// Doc-consistency probe for F3 #37 (and plan-features, 2026-10-06): /plan-features gives every Feature and every standalone item a
// required "## Demo", refuses to create a Feature it cannot write one for, creates a single parentless
// item with --standalone, and suggests a split above 8 stories.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const SKILL = fs.readFileSync(path.join(REPO_ROOT, 'skills', 'plan-features', 'SKILL.md'), 'utf8');
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

// 2026-10-06 (Anudeep): 8 is a hard limit now — a Feature fits one sprint (delivery process).
test('Size_EightStoriesIsAHardLimit', () => {
  const review = section(SKILL, '## Phase 4 — Review with user');
  mustMatch(review, /more than 8 stories/i, 'Phase 4 must flag more than 8 stories');
  mustMatch(review, /two Features,\s+each with its own Demo/i, 'the split is two Features, each with its own Demo');
  mustMatch(review, /Do not offer it as one Feature/i, 'more than 8 is never kept as one Feature');
  assert.ok(!/Max 12 stories/.test(SKILL), 'the old "Max 12 stories" constraint must be gone');
});

// ── plan-features (Feature 13046), the rules grilled on 2026-10-06 ─────────────────────────────

test('Points_OneTwoThree_FiveOnlyWithAReason_NeverEight', () => {
  const points = section(SKILL, '### Points');
  assert.ok(points, 'expected a "### Points" subsection');
  for (const p of ['`1`', '`2`', '`3`', '`5`']) assert.ok(points.includes(p), `the scale lists ${p}`);
  mustMatch(points, /Why 5:/, 'a 5 carries a written reason');
  mustMatch(points, /`8` or more is split/, 'nothing is 8 or more');
  mustMatch(section(SKILL, '## Phase 4 — Review with user'), /over 3 points[\s\S]{0,120}Why 5:/, 'Phase 4 shows the reason for a 5');
});

test('ChangeTicket_AskedEveryRun_UntilEveryItemHasOne', () => {
  const sweep = section(SKILL, '## Phase 0.6 — Items still missing a CC/SD number');
  assert.ok(sweep, 'expected Phase 0.6');
  assert.ok(SKILL.indexOf('## Phase 0.6') < SKILL.indexOf('## Phase 1 '), 'the sweep runs before planning');
  mustMatch(sweep, /no-CC\/SD/, 'items without one are tagged no-CC/SD');
  mustMatch(sweep, /next run/i, '"not yet" comes back on the next run');
  mustMatch(section(SKILL, '## Phase 3.6 — Destination and change ticket'), /CC or SD number/, 'the run asks for it with the destination');
  mustMatch(section(SKILL, '## Phase 6 — Create issues'), /no-CC\/SD/, 'with none yet the item is still created, tagged');
});

test('BoardMode_SetOncePerRepo_ScrumMasterModeNeverWritesTheBoard', () => {
  const settings = section(SKILL, '## Phase 0.5 — This repo\'s settings');
  assert.ok(settings, 'expected Phase 0.5');
  mustMatch(settings, /plan-features\.settings\.md/, 'kept in the repo\'s settings file');
  mustMatch(settings, /board_mode: create/, 'create is the default');
  mustMatch(settings, /scrum-master/, 'scrum-master is the other mode');
  const sm = section(SKILL, '## Phase 6S — Scrum Master mode: plan-<feature>.md instead of the board');
  assert.ok(sm, 'expected Phase 6S');
  mustMatch(sm, /writes nothing to the board/i, 'Scrum Master mode writes nothing to the board');
  mustMatch(sm, /read-only/i, 'the ids are found read-only');
  // Found in the real run on 2026-10-06: Hydra's repo already has a plan.md of its own.
  mustMatch(sm, /never `plan\.md`/, 'the plan file never takes plan.md');
  mustMatch(sm, /never over a file this skill did not write/, 'and never overwrites a file it did not write');
});

test('Input_AnythingGoes_AndTheRepoIsAlwaysRead', () => {
  mustMatch(section(SKILL, '## Input'), /rough brainstorm/i, 'free text is an input');
  const read = section(SKILL, '## Phase 1 — Read the input, then the repo');
  assert.ok(read, 'expected Phase 1 to read the repo');
  for (const what of ['docs/', 'features/', 'Code', 'The board']) assert.ok(read.includes(what), `Phase 1 reads ${what}`);
});

test('CalledFromAnotherRun_NothingIsCreatedBeforeAPersonSaysYes', () => {
  mustMatch(SKILL, /From another run that found new work[\s\S]{0,200}nothing is created until a person says yes/i,
    'a proposal from Hydra or a build session waits for a person');
  mustMatch(section(SKILL, '## Phase 4 — Review with user'), /This is the one approval/, 'Phase 4 is the one approval');
});

test('WithoutTheHarnessAdapter_AdoGoesThroughAz', () => {
  mustMatch(section(SKILL, '## Hard input gate'), /references\/ado-commands\.md/, 'no adapter: ADO through the reference file');
  const ref = fs.readFileSync(path.join(REPO_ROOT, 'skills', 'plan-features', 'references', 'ado-commands.md'), 'utf8');
  mustMatch(ref, /--relation-type predecessor/, 'the blocked-by edge is a predecessor link');
  mustMatch(ref, /CONTAINS 'no-CC\/SD'/, 'the CC/SD sweep query is there');
});
