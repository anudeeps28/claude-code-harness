// Doc-consistency probe for F4 #41 "Build a whole Feature, one story at a time": work and state
// folders for every build agent (#42), Feature mode and its one approval (#43), story-runner-agent
// (#44), worktrees and tested merges (#45), resume and stuck stories (#46), one PR (#47). The scripts
// these instructions call have their own behaviour tests (feature-state, worktree, run-report).

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const read = (...p) => fs.readFileSync(path.join(REPO_ROOT, ...p), 'utf8');

const IMPLEMENT = read('skills', 'implement', 'SKILL.md');
const RUNNER = read('agents', 'story-runner-agent.md');
const { readRequired } = require('../bin/startup-check.js');

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

// ── #44 story-runner-agent ───────────────────────────────────────────

test('Runner_IsANamedAgentWithTheAgentTool', () => {
  mustMatch(RUNNER, /^name: story-runner-agent$/m, 'agent name');
  mustMatch(RUNNER, /^tools: .*\bAgent\b/m, 'it starts planner, executors and reviewers');
  mustMatch(RUNNER, /never merge|Never merge/, 'it never merges');
  mustMatch(RUNNER, /COMMIT: /, 'it reports the commit sha');
  mustMatch(RUNNER, /BLOCKED[\s\S]{0,400}worktree exactly as/i, 'BLOCKED leaves the worktree as it is');
  // F5 Demo: a runner that started its reviewers in the background ended its turn with no result.
  mustMatch(RUNNER, /foreground — never with `run_in_background`/, 'the runner starts its agents in the foreground');
  // F5 Demo: run from a worktree, observe-check.js's default path finds no lessons/notes file.
  mustMatch(RUNNER, /--observe "<state folder>\/lessons\.md"/, 'the runner points observe-check.js at the state folder');
  const required = readRequired().filter((r) => r.kind === 'agent').map((r) => r.name);
  assert.ok(required.includes('story-runner-agent'), 'the startup check must name story-runner-agent');
  mustMatch(read('install', 'lib', 'updater.js'), /'agents\/story-runner-agent\.md'/, 'the installer requires it');
});

// ── #45 worktrees and tested merges ──────────────────────────────────

test('Stories_RunInWorktreesOneAtATimeAndMergeAfterTests', () => {
  const s = section(FEATURE, '### Run the stories');
  assert.ok(s, 'expected "### Run the stories"');
  mustMatch(s, /worktree\.js"? feature/, 'the Feature worktree is created');
  mustMatch(s, /worktree\.js"? story/, 'story worktrees come from the Feature branch');
  mustMatch(s, /feature-state\.js"? next/, 'the next story comes from feature-state.js');
  mustMatch(s, /Worktree setup/, 'gitignored config and restore commands come from Worktree setup');
  mustMatch(s, /story-runner-agent/, 'each story runs in a story-runner-agent');
  mustMatch(s, /worktree\.js"? merge/, 'the merge is tested before it is committed');
  mustMatch(s, /worktree\.js"? remove/, 'a merged story\'s worktree and branch are removed');
  mustMatch(s, /never forced|never force/i, 'cleanup is never forced');
  mustMatch(s, /branch-moved[\s\S]{0,200}(contradiction|stop)/i, 'a moved branch stops the run');
});

test('Rules_StoryWorktreesAllowedWaveIsolationStillForbidden', () => {
  const wave = read('rules', 'wave-execution.md');
  mustMatch(wave, /story worktree/i, 'wave-execution must cover story worktrees');
  mustMatch(wave, /isolation: "worktree"/, 'wave isolation is still named');
  mustMatch(read('rules', 'git-worktrees.md'), /story worktree/i, 'git-worktrees must cover story worktrees');
});

// ── #46 resume and stuck stories ─────────────────────────────────────

test('Resume_AFeatureNeverRedoesAMergedStory', () => {
  const s = section(FEATURE, '### Resume a Feature');
  assert.ok(s, 'expected "### Resume a Feature"');
  mustMatch(s, /feature-state\.js"? resume/, 'resume reads feature-state.js resume');
  mustMatch(s, /MERGE_HEAD|half-done merge/, 'a half-done merge is aborted and redone');
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
