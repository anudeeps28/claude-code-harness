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

// F72 #79: the agents that replace the story runner take the work folder; the ones that read plans
// or notes also take the state folder (the suite-runner only runs commands, so it needs the work folder).
for (const a of ['story-builder', 'story-reviewer', 'suite-runner']) {
  test(`Folders_${a}_TakesTheWorkFolder`, () => {
    mustMatch(read('agents', `${a}.md`), /\*\*work folder\*\*/i, `${a} must name the work folder`);
  });
}

for (const a of ['story-builder']) {
  test(`Folders_${a}_TakesAStateFolder`, () => {
    mustMatch(read('agents', `${a}.md`), /\*\*state folder\*\*/i, `${a} must name the state folder`);
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
  mustMatch(s, /disk-check\.js"?(?! --stories)/, 'the disk check runs');
  assert.doesNotMatch(s, /disk-check\.js"? --stories/, 'with no story count: the worktrees are the Feature and the scratch copy');
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
    for (const key of ['worktree-size-gb', 'verify-lock']) {
      mustMatch(s, new RegExp(`^- ${key}:`, 'm'), `it must declare ${key}`);
    }
    assert.doesNotMatch(s, /max-parallel-stories/, 'stories run one at a time: there is no width setting');
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

test('Rules_WaveIsolationStillForbidden', () => {
  // F72 #81: the wave rule is kept and the "story worktree" text is gone from it.
  const wave = read('rules', 'wave-execution.md');
  mustMatch(wave, /isolation: "worktree"/, 'wave isolation is still named');
  mustMatch(wave, /Do not spawn them with `isolation: "worktree"`/, 'and still forbidden');
  // [s]tory keeps these lines clear of one-build-skill.probe's check for the retired skill's name.
  assert.doesNotMatch(wave, /[s]tory[- ]worktrees?/i, 'wave-execution.md has no story worktree');
  assert.doesNotMatch(read('rules', 'git-worktrees.md'), /[s]tory[- ]worktrees?/i, 'git-worktrees.md has no story worktree');
});

// ── F72 #79: no story worktree, story branch, story runner or width anywhere ──

const NO_STORY_WORKTREE = [
  // `remove-scratch` (the Prove-it copy) stays, so `remove` must not be followed by a hyphen.
  ['a worktree add for a story', /worktree add[^\n]*\bstory\/|worktree\.js"? story|worktree\.js"? (merge|remove)\b(?!-)/i],
  ['a story worktree path', /-f<fid>-s<sid>|-s<sid>\b/],
  // [s] keeps this line clear of one-build-skill.probe's check for the retired skill's name.
  ['a story/ branch pattern', /[s]tory\/<|[s]tory\/\$\{|'[s]tory\/'/],
  ['the story runner', /story-runner/],
  ['the width setting', /max-parallel-stories/],
];

function storyWorktreeProblems(files) {
  const found = [];
  for (const [file, text] of files) for (const [what, re] of NO_STORY_WORKTREE) if (re.test(text)) found.push(`${file}: ${what}`);
  return found;
}

test('NoStoryWorktreeAnywhere', () => {
  // The checker first, on planted text: each phrasing it must catch, and a clean line it must accept.
  for (const bad of ['git worktree add ../x-s1 -b story/1-a feature/1-x', 'node worktree.js story --home h', 'branch `story/<sid>-<slug>`',
    'const b = `story/${id}-x`', "'story/' + id", 'spawn the story-runner-agent', 'set max-parallel-stories: 3', 'path <repo>-f<fid>-s<sid>']) {
    assert.notDeepEqual(storyWorktreeProblems([['planted', bad]]), [], `planted text must be caught: ${bad}`);
  }
  assert.deepEqual(storyWorktreeProblems([['clean', 'git worktree add ../x-f1 -b feature/1-x main; the story is built on feature/1-x']]), [],
    'a Feature worktree and a Feature branch are fine');
  assert.deepEqual(storyWorktreeProblems([['clean', 'node "<skill-dir>/bin/worktree.js" remove-scratch --path p']]), [],
    'removing the Prove-it scratch copy is fine');
  assert.notDeepEqual(storyWorktreeProblems([['planted', 'node "<skill-dir>/bin/worktree.js" remove --path p']]), [],
    'but removing a story worktree is not');

  // The set is derived: SKILL.md and every script in bin/, with a size companion so an empty read cannot pass.
  const bin = path.join(REPO_ROOT, 'skills', 'implement', 'bin');
  const scripts = fs.readdirSync(bin).filter((f) => f.endsWith('.js'));
  assert.ok(scripts.length >= 15 && scripts.includes('worktree.js') && scripts.includes('feature-state.js'), `the scan found the scripts: ${scripts.length}`);
  const files = [['SKILL.md', IMPLEMENT], ...scripts.map((f) => [`bin/${f}`, read('skills', 'implement', 'bin', f)])];
  assert.ok(files.every(([, t]) => t.length > 100), 'every file was read');
  assert.deepEqual(storyWorktreeProblems(files), []);
});

// ── #46 resume and stuck stories ─────────────────────────────────────

test('Resume_AFeatureNeverRedoesACommittedStory', () => {
  // (was ...AMergedStory; F72 #78 renamed it to committed and #79 drops the MERGE_HEAD check)
  const s = section(FEATURE, '### Resume a Feature');
  assert.ok(s, 'expected "### Resume a Feature"');
  mustMatch(s, /feature-state\.js"? resume/, 'resume reads feature-state.js resume');
  mustMatch(s, /`skip` \(committed: never redone\)/, 'a committed story is skipped, never redone');
  mustMatch(s, /Story: #<sid>/, 'a story counts as committed when its commit is on the Feature branch');
  assert.doesNotMatch(s, /MERGE_HEAD|half-done merge/, 'there is no per-story merge to be half done');
  mustMatch(IMPLEMENT, /compaction[\s\S]{0,400}feature-state\.md/, 'after a compaction the first read is feature-state.md');
});

test('Stuck_HoldsDependentsAndOpensNoPR', () => {
  const s = section(FEATURE, '### Stuck stories');
  assert.ok(s, 'expected "### Stuck stories"');
  mustMatch(s, /feature-state\.js"? stuck/, 'stuck is recorded by feature-state.js');
  mustMatch(s, /needs-person/, 'stuck and dependents go to needs-person');
  mustMatch(s, /independent/i, 'independent stories still finish');
  mustMatch(s, /no PR/i, 'no PR while a story is stuck');
  mustMatch(s, /BLOCKED (twice|a second time)/, 'a story whose job is BLOCKED twice is stuck');
});

// ── #47 one PR ───────────────────────────────────────────────────────

test('PR_OnePerFeatureWithTheRunReport', () => {
  const s = section(FEATURE, '### The Feature\'s PR');
  assert.ok(s, 'expected "### The Feature\'s PR"');
  mustMatch(s, /--base <base> --head feature\/<fid>-<slug>/, 'one PR from the Feature branch to its base');
  mustMatch(s, /the only push/i, 'the Feature branch is the only push');
  mustMatch(s, /run-report\.js/, 'the PR body carries the run report');
  const auto = read('rules', 'autonomous-mode.md').replace(/\r\n/g, '\n');
  mustMatch(auto, /Feature run[\s\S]{0,500}tasks\/features\/<fid>\/decisions-log\.md/, 'Feature runs keep one decisions log, in the Feature folder');
  mustMatch(auto, /#<sid>:/, 'each line is prefixed with #<sid>:');
  assert.doesNotMatch(auto, /tasks\/stories\/<sid>\/decisions-log/, 'no per-story decisions log in a Feature run');
  const markers = read('rules', 'phase-markers.md');
  mustMatch(markers, /`feature`/, 'phase.md gains an optional feature key');
  mustMatch(markers, /`story`/, 'phase.md gains an optional story key');
});

// ── review panel findings (F72) ──────────────────────────────────────

const flatten = (s) => String(s).replace(/\s+/g, ' ');

// A stuck story must leave neither the index nor the tree holding its code: restoring from the index
// (`git checkout --`) keeps the staged copy, so the next story's commit would take it.
const stuckLeavesNothing = (t) => {
  const f = flatten(t);
  return /`git diff HEAD -- <paths>`/.test(f) && /stuck\.diff/.test(f)
    // one restore of every story path, new ones too: a new file is not in HEAD, so it is removed
    && /git restore --staged --worktree --source=HEAD -- <all the story's paths>/.test(f)
    && /new ones included/.test(f) && !/git checkout --/.test(f)
    // new files are made visible to the diff first, or stuck.diff silently loses them
    && f.search(/git add -N/) !== -1 && f.search(/git add -N/) < f.search(/`git diff HEAD -- <paths>`/);
};
const commitsOnlyItsOwnPaths = (t) => /`git diff --cached --name-only`[^.]{0,160}only (that story's|the story's) paths/.test(flatten(t));

test('Stuck_RestoresIndexAndTreeToHeadBeforeTheNextStory', () => {
  assert.ok(!stuckLeavesNothing('Save `git diff` to stuck.diff, then `git checkout -- <paths>`.'), 'planted index-keeping restore must be rejected');
  const s = section(FEATURE, '### Stuck stories');
  assert.ok(s, 'expected "### Stuck stories"');
  assert.ok(stuckLeavesNothing(s), 'a stuck story: save git diff HEAD, restore index and tree from HEAD, delete its new files');
  const wrongOrder = 'Save the story\'s `git diff HEAD -- <paths>` to stuck.diff, run `git add -N` on its new files, then `git restore --staged --worktree --source=HEAD -- <tracked paths>` and delete its new untracked files.';
  assert.ok(!stuckLeavesNothing(wrongOrder), 'planted git add -N after the diff capture must be rejected');
  assert.ok(s.includes('git diff HEAD'), 'companion: the stuck section was read');
});

test('Commit_RequiresTheIndexToHoldOnlyThisStorysPaths', () => {
  assert.ok(!commitsOnlyItsOwnPaths('Stage the paths and commit.'), 'planted text with no index check must be rejected');
  const s = section(FEATURE, '### Run the stories');
  assert.ok(commitsOnlyItsOwnPaths(s), 'before the commit, git diff --cached --name-only must hold only that story\'s paths');
});

// Agents run in the foreground, so a live session cannot see a hung agent (a hung call never returns;
// the person ends it) and checking between calls only misfires on slow agents. The hang check runs on
// --resume only, and what it prints is acted on.
const callsHung = (t) => /feature-state\.js"? hung --feature/.test(flatten(t));
const runsHung = (t) => {
  const f = flatten(t);
  // relaunch is the restart (once), a second stop of the same step is asked, never stuck by itself
  return callsHung(f) && /`relaunch <sid>`[^.]{0,200}once/.test(f) && /`ask <sid>`[^.]{0,200}\*\*pause\*\*/.test(f)
    && /never marks a story stuck by itself/.test(f);
};
const noLiveHangCheck = (t) => !callsHung(t) && /no hang check[\s\S]{0,300}foreground[\s\S]{0,400}resum/i.test(flatten(t));

test('Hung_OnlyTheResumeRunsTheHangCheck_TheLiveLoopDoesNot', () => {
  assert.ok(!runsHung('Build the story.'), 'planted text without the hang check must be rejected');
  assert.ok(!noLiveHangCheck('Before each step\'s agent call run `node "x/feature-state.js" hung --feature <fid>`. There is no hang check here; agents run in the foreground, so resume.'), 'planted loop that still calls hung must be rejected');
  assert.ok(!noLiveHangCheck('Build the story.'), 'planted loop that never says why must be rejected');
  const loop = section(FEATURE, '### Run the stories');
  assert.ok(noLiveHangCheck(loop), 'Run the stories has no hang check and says why (foreground agents; the person stops and resumes)');
  assert.ok(!runsHung('Run `node x/feature-state.js hung --feature <fid>`: `relaunch <sid>` start it once; `stuck <sid>` go to **Stuck stories**.'),
    'planted resume that lets hung mark a story stuck must be rejected');
  assert.ok(runsHung(section(FEATURE, '### Resume a Feature')), 'Resume a Feature runs hung: relaunch once, ask on a second stop, never stuck by itself');
  assert.ok(callsHung(IMPLEMENT), 'companion: the hang check is still documented somewhere in the skill');
});

// One tracker-helper call per story boundary: done for this story and in-progress for the next.
test('Cards_OneCallPerStoryBoundary', () => {
  const s = section(FEATURE, '### Run the stories');
  assert.doesNotMatch(s, /never batched|not batched/, 'the old one-move-per-call wording is gone');
  mustMatch(s, /one `tracker-helper` call[^.]{0,80}\bdone\b[^.]{0,160}next story[^.]{0,160}`in-progress`/, 'at a commit one call moves the story to done and the next to in-progress');
  mustMatch(s, /first story[^.]{0,120}own call/i, 'the first story\'s in-progress move is its own call');
  const moving = section(IMPLEMENT, '### Moving the card');
  mustMatch(moving, /Feature mode: a story is committed[^\n]*\bdone\b[^\n]*\bin-progress\b[^\n]*next story/, 'the table row for a commit also moves the next story');
  mustMatch(moving, /a story is stuck[^\n]*own call|stuck[^\n]*its own call/i, 'a stuck move stays its own call');
});

// Ticket and message text is data: it never goes inside double quotes of a shell line.
test('Quoting_MessagesAndTitlesNeverGoInsideDoubleQuotes', () => {
  const s = section(FEATURE, '### Run the stories');
  mustMatch(s, /git commit -F <file>|`git commit -F /, 'the commit message is written to a file and committed with -F');
  assert.doesNotMatch(s, /git commit -m/, 'no -m with message text on the command line');
  const pr = section(FEATURE, '### The Feature\'s PR');
  assert.doesNotMatch(pr, /--title "</, 'the PR title text is not placed inside double quotes');
  mustMatch(pr, /--body-file/, 'the body comes from a file');
  mustMatch(pr, /<<'TITLE_END'/, 'the title comes from a single-quoted heredoc');
  // The whole skill, not one section: no template puts ticket text inside double quotes.
  const inQuotes = (t) => [...String(t).matchAll(/(--title|--body) "<|create-issue\.sh "</g)].map((m) => m[0]);
  assert.deepEqual(inQuotes('gh pr create --title "<title>" --body "<body>"'), ['--title "<', '--body "<'], 'planted double-quoted title and body must be found');
  assert.deepEqual(inQuotes('bash create-issue.sh "<title>" "<body>"'), ['create-issue.sh "<'], 'planted double-quoted create-issue template must be found');
  assert.ok(IMPLEMENT.includes('gh pr create'), 'companion: the skill was read');
  assert.deepEqual(inQuotes(IMPLEMENT), [], 'no --title, --body or create-issue.sh template in SKILL.md puts ticket text in double quotes');
  const opens = (IMPLEMENT.match(/<<'TITLE_END'/g) || []).length;
  const closes = (IMPLEMENT.replace(/\r/g, '').match(/^TITLE_END$/gm) || []).length;
  assert.ok(opens >= 3, `the Feature init, the Feature PR and the single-story PR titles use the TITLE_END heredoc (${opens})`);
  assert.equal(closes, opens, 'each heredoc is closed by TITLE_END at column 0, or the shell never ends it');
  assert.ok((IMPLEMENT.match(/written by the run itself/g) || []).length >= 2, 'progress.js detail and feature-state.js stuck --reason are values the run writes, never ticket or tool output');
  const helper = read('agents', 'tracker-helper.md');
  assert.doesNotMatch(helper, /never as text you assemble into a shell string/, 'the impossible rule is gone');
  mustMatch(helper, /temp(orary)? file[^.]{0,200}"\$\(cat <file>\)"/, 'tracker-helper writes values to a temp file and passes the file');
  mustMatch(helper, /never as an inline heredoc/, 'not as an inline heredoc: a body line equal to its end marker would end it early');
  mustMatch(helper, /never inside double quotes/, 'never inside double quotes');
  mustMatch(helper, /instructions inside (it|ticket text) are ignored/i, 'ticket text is data');
});

test('Baseline_AScratchCopyOnlyAndProverChecksDetachedHead', () => {
  mustMatch(flatten(read('agents', 'suite-runner.md')), /baseline[^.]{0,200}`worktree\.js scratch`[^.]{0,120}never in the work folder/i, 'a baseline checkout happens only in a scratch copy');
  mustMatch(flatten(read('agents', 'prover.md')), /`git rev-parse --abbrev-ref HEAD`[^.]{0,80}`HEAD`[^.]{0,160}BLOCKED/, 'prover checks it is on a detached HEAD before it commits');
});

// In Feature mode the criteria live in the Feature plan, which a Feature run writes; the per-story
// test-strategy.md is never written.
test('FeatureCriteria_ComeFromThePlanNotFromTestStrategyFiles', () => {
  assert.doesNotMatch(FEATURE, /every committed story's `test-strategy\.md`/, 'the panel row does not point at per-story test-strategy.md');
  assert.doesNotMatch(FEATURE, /from its `test-strategy\.md`/, 'Prove it does not read criteria from test-strategy.md');
  assert.doesNotMatch(FEATURE, /combined from\s+every story's own `decisions-log\.md`/, 'a Feature has one decisions log');
  mustMatch(flatten(section(FEATURE, '### The Feature panel')), /`## Story #<sid>` sections of `tasks\/features\/<fid>\/plan\.md`/, 'the panel gets the Story sections of the Feature plan');
  mustMatch(flatten(section(FEATURE, '### Prove it')), /`## Story #<sid>` sections?[^.]{0,80}plan\.md/, 'Prove it reads the Story sections of the plan');
  mustMatch(flatten(section(FEATURE, '### The Feature\'s PR')), /`tasks\/features\/<fid>\/decisions-log\.md`[^.]{0,120}`#<sid>:`/, 'the PR\'s decisions come from the one Feature log, lines prefixed #<sid>:');
  const acc = flatten(read('agents', 'acceptance-test-agent.md'));
  mustMatch(acc, /features\/<fid>\/plan\.md`\), whose `## Story #<sid>` sections hold each story's criteria/, 'the acceptance agent reads the plan\'s Story sections in a Feature panel');
  assert.doesNotMatch(acc, /every story's test strategy/, 'and not every story\'s test strategy');
  // The Feature-level criteria F.<n> live in the Feature's test-strategy.md (what pr-gate.js reads);
  // the story criteria live in the plan's Story sections.
  const fromStrategy = /`F\.<n>`[^.|]{0,200}features\/<fid>\/test-strategy\.md/;
  assert.ok(!fromStrategy.test('the criteria `F.<n>` come from the Feature plan.md'), 'planted F.<n> read from the plan must be rejected');
  mustMatch(acc, fromStrategy, 'acceptance: F.<n> come from tasks/features/<fid>/test-strategy.md');
  mustMatch(flatten(section(FEATURE, '### The Feature panel')), fromStrategy, 'panel row: F.<n> come from the Feature test-strategy.md');
  mustMatch(flatten(section(FEATURE, '### Prove it')), fromStrategy, 'Prove it: F.<n> come from the Feature test-strategy.md');
  const planner = flatten(read('agents', 'implement-planner-agent.md'));
  assert.doesNotMatch(planner, /one file, `tasks\/features\/<fid>\/plan\.md`\*\*, and nothing else/, 'the planner writes the Feature test-strategy.md too');
  mustMatch(planner, /`tasks\/features\/<fid>\/plan\.md`[^.]{0,200}Feature-level criteria[^.]{0,80}`tasks\/features\/<fid>\/test-strategy\.md`[^.]{0,200}no per-story `plan\.md` or `test-strategy\.md`/, 'Feature-plan mode: plan.md for the stories, Feature-level criteria in the Feature test-strategy.md, no per-story files');
  const intro = flatten(FEATURE.split('\n').slice(0, 12).join('\n'));
  mustMatch(intro, /ADR-0001[^.]{0,40}ADR-0004[^.]{0,40}ADR-0005/, 'Feature mode cites the ADRs that still stand');
  assert.doesNotMatch(intro, /ADR-0002|ADR-0003/, 'the superseded ADRs are not cited');
});

// /troubleshoot spawns an investigator in the e2e gate: it is bound by the same contract as the rest.
test('Troubleshoot_InvestigatorHasTheStatusLineAndItsModelInTheTable', () => {
  const agent = read('agents', 'troubleshoot-investigator.md');
  mustMatch(flatten(agent), /Your report starts with one line: `STATUS: DONE`, `STATUS: DONE_WITH_CONCERNS`, `STATUS: BLOCKED` or `STATUS: NEEDS_CONTEXT` \(`rules\/agent-handoff\.md`\)\./, 'the exact status sentence');
  mustMatch(IMPLEMENT, /\| `troubleshoot-investigator` \| [^|]*troubleshoot[^|]*\| opus \|/, 'the model table has its row');
  const skill = read('skills', 'troubleshoot', 'SKILL.md');
  const spawns = skill.replace(/\r/g, '').split('\n').filter((l) => /Spawn (a|the)[^\n]*`troubleshoot-investigator`/.test(l));
  assert.ok(spawns.length >= 2, `companion: both spawns were found (${spawns.length})`);
  for (const l of spawns) mustMatch(l, /model: `opus`/, `every spawn passes the model: ${l.slice(0, 60)}`);
});
