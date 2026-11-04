// Doc-consistency probe for F4 #41 "Build a whole Feature, one story at a time": work and state
// folders for every build agent (#42), Feature mode and its one approval (#43), resume and stuck
// stories (#46), one PR (#47), and (F72 #78) one loop per story on the Feature branch. The scripts
// these instructions call have their own behaviour tests (feature-state, worktree, run-report).

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const read = (...p) => fs.readFileSync(path.join(REPO_ROOT, ...p), 'utf8');

const IMPLEMENT = read('skills', 'implement', 'SKILL.md');
const { readSettings } = require('../bin/settings.js');

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

// ── #42 work folder and state folder ─────────────────────────────────

const BUILD_AGENTS = ['story-executor-agent', 'implement-planner-agent', 'evaluator-agent', 'acceptance-test-agent', 'architect-reviewer-agent', 'security-reviewer-agent'];

for (const a of BUILD_AGENTS) {
  test(`Folders_${a}_TakesAWorkFolderAndAStateFolder`, () => {
    const text = read('agents', `${a}.md`);
    mustMatch(text, /work folder/i, `${a} must name the work folder`);
    mustMatch(text, /state folder/i, `${a} must name the state folder`);
    mustMatch(text, /(none given|names neither)[\s\S]{0,200}(project root|current folder|YOUR_PROJECT_ROOT)/i, `${a} must fall back to today's behaviour when given neither`);
  });
}

test('Folders_ReviewersDiffAgainstTheBaseRef', () => {
  for (const a of ['evaluator-agent', 'acceptance-test-agent', 'architect-reviewer-agent', 'security-reviewer-agent']) {
    const text = read('agents', `${a}.md`);
    mustMatch(text, /git diff --stat <base>\.\.\.HEAD/, `${a} must diff <base>...HEAD`);
    assert.ok(!/git diff[^\n]*HEAD~1\.\.HEAD/.test(text), `${a} must not hard-code HEAD~1..HEAD any more`);
  }
});

test('Folders_ExecutorLockIsPerStoryWithAGlobalSetting', () => {
  const text = read('agents', 'story-executor-agent.md');
  mustMatch(text, /LOCK="<state folder>\/stories\/<story id>\/\.verify\.lock"/, 'the lock lives in the story\'s state folder');
  mustMatch(text, /verify-lock: global/, 'a project can make the lock global');
  assert.ok(!/may NOT access files outside `YOUR_PROJECT_ROOT`/.test(text), 'the old single-root rule must be gone');
});

// ── #43 Feature mode and its one approval ────────────────────────────

const FEATURE = section(IMPLEMENT, '## Feature mode');

test('Mode_ChosenFromTheItemType', () => {
  mustMatch(IMPLEMENT, /--standalone/, '--standalone must be a documented flag');
  const mode = section(IMPLEMENT, '### Which mode');
  assert.ok(mode, 'expected a "### Which mode" step');
  mustMatch(mode, /\*\*Type:\*\* Feature[\s\S]{0,200}Feature mode/, 'a Feature id builds the Feature');
  mustMatch(mode, /parent Feature[\s\S]{0,300}(ask|asks)/i, 'a story with a parent asks whether the Feature was meant');
  mustMatch(mode, /Standalone story, no parent Feature\./, 'the standalone line is printed');
  mustMatch(mode, /without `--standalone`[\s\S]{0,200}\*\*stop\*\*/i, 'no parent and no --standalone stops');
});

test('Plan_OneApprovalWithTheINeedList', () => {
  assert.ok(FEATURE, 'expected a "## Feature mode" section');
  const plan = section(FEATURE, '### Plan the Feature');
  assert.ok(plan, 'expected "### Plan the Feature"');
  mustMatch(plan, /feature-state\.js"? init/, 'the plan is written by feature-state.js init');
  mustMatch(plan, /Before I finalize this plan I need/, 'the approval shows the "I need" list');
  for (const item of ['missing material', 'untestable', 'not ours', 'access', 'contradiction']) {
    mustMatch(plan, new RegExp(item, 'i'), `the "I need" list covers ${item}`);
  }
  mustMatch(plan, /--autonomous[\s\S]{0,300}empty[\s\S]{0,300}(log|decisions)/i, 'under --autonomous an empty list skips the stop, logged');
  mustMatch(plan, /only stop|one stop|stops once/i, 'there is one stop');
});

// ── disk and allowlist checks before the first story (moved here from the retired parallel-stories probe) ──

test('Startup_DiskAndAllowlistAreCheckedBeforeTheFirstWorktree', () => {
  const s = section(FEATURE, '### Before the first story');
  assert.ok(s, 'expected "### Before the first story"');
  assert.ok(FEATURE.indexOf('### Before the first story') < FEATURE.indexOf('### Run the stories'), 'it runs before the stories');
  mustMatch(s, /disk-check\.js"? --stories/, 'the disk check runs');
  mustMatch(s, /allowlist-check\.js/, 'the allowlist check runs');
  mustMatch(s, /never (write|change|edit)s? (a )?settings|never writes/i, 'the check never writes settings');
  mustMatch(s, /plain "?Bash"?|allow all/i, 'it never recommends a blanket Bash rule');
  mustMatch(s, /--autonomous[\s\S]{0,300}(stop|pause)/i, 'under --autonomous a missing permission still stops');
});

for (const template of [['templates', 'tasks', 'lessons.md'], ['templates', 'tasks-solo', 'notes.md']]) {
  test(`Settings_TemplateHasFeatureRuns_${template[1]}`, () => {
    const text = read(...template);
    const s = section(text, '## Feature runs');
    assert.ok(s, `${template.join('/')} must have a "## Feature runs" section`);
    for (const key of ['max-parallel-stories', 'worktree-size-gb', 'verify-lock']) {
      mustMatch(s, new RegExp(`^- ${key}:`, 'm'), `it must declare ${key}`);
    }
  });
}

test('Settings_TemplatePlaceholdersReadAsUnset', () => {
  // An untouched template must not set anything: the defaults apply until the project chooses.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'settings-'));
  fs.mkdirSync(path.join(dir, 'tasks'));
  fs.copyFileSync(path.join(REPO_ROOT, 'templates', 'tasks', 'lessons.md'), path.join(dir, 'tasks', 'lessons.md'));
  assert.deepEqual(readSettings(dir), {});
});

// ── F72 #78: one loop per story, on the Feature branch ───────────────
// Each step is a pattern searched for after the previous one matched, so the loop's ORDER is checked,
// not a bag of words. The checker is proven on planted text first: the same sentences in reverse order,
// and the right order with the staging rule flipped, must both be rejected.

const LOOP_STEPS = [
  ['check-branch before each story, stop on a moved branch', /worktree\.js"? check-branch[\s\S]{0,200}?moved branch[\s\S]{0,120}?\bstop\b/i],
  ['story-builder writes the tests', /`story-builder`[\s\S]{0,200}?\btests?\b[\s\S]{0,200}?model: `sonnet`/i],
  ['suite-runner shows them red', /`suite-runner`[\s\S]{0,200}?\bred\b[\s\S]{0,200}?model: `sonnet`/i],
  ['Red evidence is saved', /Red evidence/],
  ['red-evidence.js check', /red-evidence\.js"? check/],
  ['story-builder writes the code', /`story-builder`[\s\S]{0,200}?\bcode\b[\s\S]{0,200}?model: `sonnet`/i],
  ['suite-runner shows green', /`suite-runner`[\s\S]{0,200}?\bgreen\b/i],
  ['at most 5 rounds', /at most 5 rounds/i],
  ['two story-reviewer in one message', /two `story-reviewer`[\s\S]{0,120}?in one message[\s\S]{0,200}?model: `sonnet`/i],
  ['both reviewer modes named', /Correctness[\s\S]{0,40}?Rules and quality/],
  ['rounds 2-3 re-review over the fix diff', /rounds? 2[–-]3[\s\S]{0,120}?re-review[\s\S]{0,80}?fix diff/i],
  ['rounds 4-5 on opus', /rounds? 4[–-]5[\s\S]{0,200}?model: `opus`/i],
  ['never git add -A', /never[^.\n]{0,40}`git add -A`/i],
  ['never commit on red', /never on red/i],
  ['Story trailer', /Story: #<sid>/],
  ['tracker-helper moves the card', /`tracker-helper`[\s\S]{0,200}\bdone\b/i],
  ['a blocked story is held while the rest go on', /blocked story[\s\S]{0,400}?carries on with the stories that do not depend on it/i],
  ['sequence check', /feature-state\.js"? sequence/],
];

function loopProblems(text) {
  if (!text) return ['no section'];
  let from = 0;
  for (const [name, re] of LOOP_STEPS) {
    const m = re.exec(text.slice(from));
    if (!m) return [`missing or out of order: ${name}`];
    from += m.index + m[0].length;
  }
  return [];
}

const SAMPLE = [
  'Run worktree.js check-branch before each story; a moved branch means stop.',
  'Spawn `story-builder` for the tests, model: `sonnet`.',
  'Then `suite-runner` shows them red, model: `sonnet`.',
  'Save the Red evidence in executor-state.md.',
  'Then node "<skill-dir>/bin/red-evidence.js" check --state s --criteria AC1.',
  'Spawn `story-builder` for the code, model: `sonnet`.',
  'Then `suite-runner` shows the scoped set green.',
  'Run at most 5 rounds.',
  'Send two `story-reviewer` calls in one message, model: `sonnet`: Correctness, and Rules and quality.',
  'Rounds 2-3 re-review over the fix diff only.',
  'Rounds 4-5 relaunch with model: `opus`.',
  'Stage by path, never `git add -A`, and never on red.',
  'Message ends Story: #<sid>.',
  'One `tracker-helper` call moves the card to done.',
  'A blocked story is marked and the loop carries on with the stories that do not depend on it.',
  'Run node "<skill-dir>/bin/feature-state.js" sequence --feature <fid>.',
];

test('Stories_LoopCheckerCanFail_PlantedOppositesAreRejected', () => {
  assert.deepEqual(loopProblems(SAMPLE.join('\n')), [], 'the checker accepts the right order');
  assert.notDeepEqual(loopProblems([...SAMPLE].reverse().join('\n')), [], 'the same sentences in reverse order are rejected');
  const flipped = SAMPLE.map((l) => l.replace('Stage by path, never `git add -A`, and never on red.', 'Always stage with `git add -A`, and commit whatever is red, never mind.'));
  assert.notDeepEqual(loopProblems(flipped.join('\n')), [], 'a text that allows git add -A is rejected');

  const swap = (from, to) => SAMPLE.map((l) => (l === from ? to : l)).join('\n');
  const sampleLine = (prefix) => SAMPLE.find((l) => l.startsWith(prefix));
  assert.notDeepEqual(loopProblems(swap(sampleLine('Run worktree.js'), 'Run worktree.js check-branch before each story; a moved branch is ignored.')), [], 'a moved branch that does not stop the run is rejected');
  assert.notDeepEqual(loopProblems(swap(sampleLine('Send two'), 'Send two `story-reviewer` calls in one message, model: `sonnet`: both look at everything.')), [], 'reviewers with no named modes are rejected');
  assert.notDeepEqual(loopProblems(swap(sampleLine('Rounds 2-3'), 'Rounds 2-3 review the whole story again.')), [], 'later rounds that re-review everything are rejected');
  assert.notDeepEqual(loopProblems(swap(sampleLine('A blocked story'), 'A blocked story stops the whole Feature.')), [], 'a blocked story that stops the rest is rejected');
});

test('Stories_OneLoopPerStoryOnTheFeatureBranch', () => {
  const s = section(FEATURE, '### Run the stories');
  assert.ok(s, 'expected "### Run the stories"');
  assert.deepEqual(loopProblems(s), []);
  assert.doesNotMatch(s, /story-runner-agent/, 'no per-story runner: the main session builds each story');
  assert.doesNotMatch(s, /worktree\.js"? story/, 'no story worktrees');
  mustMatch(s, /worktree\.js"? feature/, 'the Feature worktree is still created');
  mustMatch(s, /feature-state\.js"? next/, 'the next story comes from feature-state.js');
  mustMatch(s, /`needs-person`/, 'a blocked story\'s card moves to needs-person');
  mustMatch(s, /held dependents?[^.\n]{0,60}(untouched|left as they are|not moved)/i, 'held dependents\' cards are left untouched');
});

test('Rules_StoryWorktreesAllowedWaveIsolationStillForbidden', () => {
  const wave = read('rules', 'wave-execution.md');
  mustMatch(wave, /story worktree/i, 'wave-execution must cover story worktrees');
  mustMatch(wave, /isolation: "worktree"/, 'wave isolation is still named');
  mustMatch(read('rules', 'git-worktrees.md'), /story worktree/i, 'git-worktrees must cover story worktrees');
});

// ── #46 resume and stuck stories ─────────────────────────────────────

test('Resume_AFeatureNeverRedoesACommittedStory', () => {
  const s = section(FEATURE, '### Resume a Feature');
  assert.ok(s, 'expected "### Resume a Feature"');
  mustMatch(s, /feature-state\.js"? resume/, 'resume reads feature-state.js resume');
  mustMatch(s, /`skip` \(committed: never redone\)/, 'a committed story is skipped, never redone');
  mustMatch(IMPLEMENT, /compaction[\s\S]{0,400}feature-state\.md/, 'after a compaction the first read is feature-state.md');
});

test('Stuck_HoldsDependentsAndOpensNoPR', () => {
  const s = section(FEATURE, '### Stuck stories');
  assert.ok(s, 'expected "### Stuck stories"');
  mustMatch(s, /feature-state\.js"? stuck/, 'stuck is recorded by feature-state.js');
  mustMatch(s, /needs-person/, 'stuck and dependents go to needs-person');
  mustMatch(s, /independent/i, 'independent stories still finish');
  mustMatch(s, /no PR/i, 'no PR while a story is stuck');
  mustMatch(s, /twice|two/i, 'a story that fails twice is stuck');
});

// ── #47 one PR ───────────────────────────────────────────────────────

test('PR_OnePerFeatureWithTheRunReport', () => {
  const s = section(FEATURE, '### The Feature\'s PR');
  assert.ok(s, 'expected "### The Feature\'s PR"');
  mustMatch(s, /--base main --head feature\/<fid>-<slug>/, 'one PR from the Feature branch to main');
  mustMatch(s, /no story branch is ever pushed|never push(es)? a story branch/i, 'story branches are never pushed');
  mustMatch(s, /run-report\.js/, 'the PR body carries the run report');
  mustMatch(read('rules', 'autonomous-mode.md'), /Feature run[\s\S]{0,400}tasks\/stories\/<sid>\/decisions-log\.md/, 'Feature runs keep one decisions log per story');
  const markers = read('rules', 'phase-markers.md');
  mustMatch(markers, /`feature`/, 'phase.md gains an optional feature key');
  mustMatch(markers, /`story`/, 'phase.md gains an optional story key');
});
