// Doc-consistency probe for F73 #82 "Two sessions build two Features at the same time, safely".
// One session per Feature, each in the home folder: the SKILL, the rules, the three agents that run
// tests, the planner and ADR-0006 must say so. A text probe cannot prove the prose is followed; the
// unit tests of feature-state.js, test-lock.js, disk-check.js and worktree.js and the Demo run on a
// throwaway project do. Each check is a whole-claim function, run first on planted text that says the
// opposite (it must be rejected), then on the real file.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const strip = (text) => text.replace(/\r\n/g, '\n');
const readOwn = (...p) => strip(fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8'));
const readRule = (name) => strip(fs.readFileSync(path.join(REPO_ROOT, 'rules', name), 'utf8'));
const readDocs = (...p) => strip(fs.readFileSync(path.join(REPO_ROOT, 'docs', ...p), 'utf8'));
const readArchitecture = () => strip(fs.readFileSync(path.join(REPO_ROOT, 'ARCHITECTURE.md'), 'utf8'));
// Whitespace runs as one space and bold marks removed, so a wrapped phrase is one phrase.
const flat = (t) => t.replace(/\*\*/g, '').replace(/\s+/g, ' ');

// From a heading line (starting with `prefix`) to the next heading of the same or a higher level.
function slice(content, prefix) {
  const lines = content.split('\n');
  const start = lines.findIndex((l) => l.startsWith(prefix));
  if (start === -1) return null;
  const level = prefix.match(/^#+/)[0].length;
  let inFence = false;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith('```')) inFence = !inFence;
    else if (!inFence) {
      const m = lines[i].match(/^(#+) /);
      if (m && m[1].length <= level) { end = i; break; }
    }
  }
  return lines.slice(start, end).join('\n');
}

const SKILL = readOwn('SKILL.md');
const WAVE = readRule('wave-execution.md');
const WORKTREES = readRule('git-worktrees.md');
// The agents the SKILL's "Shared test resources" paragraph gives the lock to, read from that paragraph (the one
// this probe checks below). Whether they are the agents that run suites, by the agents' own text, is compared in
// scripts/__tests__/boundaries-lock-agents.test.js: a new agent that runs a suite fails there until the
// paragraph names it, so the paragraph cannot be forgotten.
const { lockAgents } = require('./lock-paragraph.js');
const AGENTS = lockAgents(SKILL, REPO_ROOT);

// ── AC1: a Feature run's markers are not foreign work ────────────────

const featureMarkerNotForeign = (t) => /`feature:`[^.]*?\bnot foreign work\b/.test(flat(t));
const tasksPathsNotDirty = (t) => /paths under `tasks\/`[^.]*\bnot (?:counted|count)[^.]*\bdirty/i.test(flat(t));

test('Sessions_FeatureMarkersAreNotForeignWork', () => {
  // The checks first, on planted text that says the opposite.
  assert.ok(!featureMarkerNotForeign('a `feature:` marker is foreign work'), 'the opposite claim is rejected');
  assert.ok(featureMarkerNotForeign('a `feature:` marker is not foreign work'), 'the claim itself is accepted');
  assert.ok(!tasksPathsNotDirty('the paths under `tasks/` are counted as dirty'), 'the opposite claim is rejected');
  assert.ok(tasksPathsNotDirty('the paths under `tasks/` are not counted as dirty'), 'the claim itself is accepted');
  // SKILL "Before you start".
  const before = slice(SKILL, '## Before you start');
  assert.ok(before, 'SKILL has "Before you start"');
  assert.ok(featureMarkerNotForeign(before), 'SKILL: a `feature:` marker is not foreign work');
  assert.ok(tasksPathsNotDirty(before), 'SKILL: paths under tasks/ are not counted as dirty');
  const phaseBullet = before.split('\n').find((l) => /^- another story's `tasks\/stories\/<other-id>\/phase\.md`/.test(l));
  assert.ok(phaseBullet, 'the standalone phase.md bullet is still there');
  assert.match(phaseBullet, /`feature:`/, 'the bullet itself carries the `feature:` exception');
  assert.match(before, /^- the current branch is already another story's branch/m, 'the branch bullet stays');
  assert.match(before, /^- another story's `tasks\/stories\/<other-id>\/executor-state\.md` shows an in-progress run/m, 'the executor-state bullet stays');
  // The rule file.
  const startup = slice(WAVE, '## At skill startup');
  assert.ok(startup, 'wave-execution.md has "At skill startup"');
  assert.ok(featureMarkerNotForeign(startup), 'wave-execution.md: a `feature:` marker is not foreign work');
  assert.match(startup, /^- another story's `tasks\/stories\/<other-id>\/phase\.md` is fresh/m, 'the standalone bullet stays');
  assert.match(readRule('phase-markers.md'), /A marker written by an earlier run in this same directory is not foreign work/);
});

// ── AC2: the claim runs first, and is never self-answered ────────────

const neverSelfAnswered = (t) => /never self-answered/i.test(t) && !/\bis self-answered\b/i.test(t);

test('Sessions_ClaimRunsBeforePlanAndOnResume_NeverSelfAnswered', () => {
  assert.ok(!neverSelfAnswered('Self-answered, under `--autonomous` too.'), 'the opposite claim is rejected');
  assert.ok(neverSelfAnswered('Never self-answered, under `--autonomous` too.'), 'the claim itself is accepted');
  const feature = slice(SKILL, '## Feature mode');
  assert.ok(feature, 'SKILL has Feature mode');
  const iClaim = feature.indexOf('### Another session on the same Feature');
  const iPlan = feature.indexOf('### Plan the Feature');
  assert.ok(iClaim !== -1, 'the subsection exists');
  assert.ok(iPlan !== -1);
  assert.ok(iClaim < iPlan, 'the claim subsection comes before Plan the Feature');
  const claim = slice(feature, '### Another session on the same Feature');
  assert.match(claim, /node "<skill-dir>\/bin\/feature-state\.js" claim --feature <fid> --session "\$\{CLAUDE_SESSION_ID\}"/);
  assert.match(claim, /`free`/);
  assert.match(claim, /`busy <fid>: /);
  assert.match(flat(claim), /\(A\) Stop[^()]*that session is still building it/);
  assert.match(flat(claim), /\(B\) That session is closed, take it over/);
  assert.match(claim, /--take-over/);
  assert.match(flat(claim), /`took over <fid> from session <s>, idle <n>m`[^.]*tell the person/i, 'a stale take-over is never silent');
  assert.ok(neverSelfAnswered(claim), 'never self-answered');
  assert.match(claim, /--autonomous/, 'and it says so for autonomous runs');
  // On resume the claim is first.
  const resume = slice(SKILL, '### Resume a Feature');
  assert.ok(resume, 'SKILL has Resume a Feature');
  const iResumeClaim = resume.search(/feature-state\.js" claim --feature/);
  const iResumeCmd = resume.search(/feature-state\.js" resume --feature/);
  assert.ok(iResumeClaim !== -1, 'Resume a Feature runs the claim');
  assert.ok(iResumeCmd !== -1, 'companion: Resume a Feature still runs the resume command');
  assert.ok(iResumeClaim < iResumeCmd, 'the claim comes first on resume');
});

// ── AC3: an open blocker being built in another session ──────────────

test('Sessions_OpenBlockerBeingBuiltElsewhere_NamesTheLinkAndTheWorktree', () => {
  const names = (t) => /is being built in <feature-worktree> \(phase <phase>\)/.test(t)
    && /start #<id> after #<b>'s PR merges and #<b> is closed/.test(t)
    && /tasks\/features\/<b>\/feature-state\.md/.test(t);
  assert.ok(!names('#<b> blocks #<id>; nothing more is said'), 'a stop line without the worktree is rejected');
  const whole = slice(SKILL, '### Read the whole ticket');
  assert.ok(whole, 'SKILL has "Read the whole ticket"');
  assert.match(whole, /#<id> "<title>" \(<state>\) blocks #<id>/, 'the original stop line stays');
  assert.ok(names(flat(whole)), 'the stop line says where the blocker is built and what to do');
  assert.match(whole, /not self-answered/);
});

// ── AC4: the test lock ───────────────────────────────────────────────

// The standalone "Shared test resources" paragraph of the story loop.
function standaloneLock() {
  const m = slice(SKILL, '## The story loop').match(/\*\*Shared test resources\.\*\*[\s\S]*?(?=\n\n)/);
  assert.ok(m, 'the standalone "Shared test resources" paragraph was found');
  return m[0];
}

test('Sessions_TestLockInTheBriefsAndInBuilderRunnerProver', () => {
  const prefixed = (t) => /run every build, test and Observe command with it in front/i.test(flat(t));
  assert.ok(!prefixed('run every build, test and Observe command without it in front'), 'the opposite claim is rejected');
  assert.ok(prefixed('run every build, test and Observe command with it in front'), 'the claim itself is accepted');
  const run = [slice(SKILL, '### Run the stories'), slice(SKILL, '## The story loop')].filter(Boolean).join('\n');
  assert.ok(slice(SKILL, '### Run the stories'), 'SKILL has "Run the stories"');
  const flatRun = flat(run);
  assert.match(flatRun, /Shared test resources/);
  assert.match(flatRun, /`verify-lock: global`/);
  assert.ok(AGENTS.length >= 7, `companion: the paragraph names the agents that run suites, not none (got ${AGENTS.length}: ${AGENTS.join(', ')})`);
  assert.match(flatRun, /Test lock: node "<skill-dir>\/bin\/test-lock\.js" run --lock "<state>\/\.verify\.lock" --heartbeat "<state>\/features\/<fid>\/heartbeat" --/);
  assert.match(flatRun, /compound command[^.]*`a && b`[^.]*not wrapped[^.]*wrap each command/i, 'a compound command is not wrapped');
  assert.match(flatRun, /`per-story`\) passes none/, 'the default passes no lock');
  // The SKILL's Feature "Shared test resources" paragraph names every one of them, and /local-test.
  const shared = flat(slice(SKILL, '### Run the stories')).match(/Shared test resources\.[\s\S]*?(?=Then loop on)/);
  assert.ok(shared, 'the Feature "Shared test resources" paragraph was found');
  for (const name of AGENTS) assert.ok(shared[0].includes(`\`${name}\``), `the paragraph gives the lock to ${name}`);
  assert.match(shared[0], /`\/local-test` \(every level, e2e included\)/, 'and to /local-test, every level, e2e included');
  assert.match(shared[0], /`\/debug`/, 'and to /debug, whose feedback loop runs the suite');
  // The skill that runs the feedback loop carries the same rule, in its own words: asserted in
  // skills/debug/__tests__/test-lock-prefix.test.js.
  assert.match(flat(standaloneLock()), /`\/debug`/, 'the standalone paragraph passes the line to /debug too');
  const standalone = flat(slice(SKILL, '## The story loop') || '');
  assert.match(standalone, /Test lock:[\s\S]*every agent and skill that executes a suite/, 'the standalone paragraph passes it to every suite runner');
  // Each agent's own file (the prefix, its shape, a compound command, the 60-minute wait, the start command) is
  // asserted in agents/__tests__/agent-text-several-sessions.test.js, and /local-test's own words in
  // skills/local-test/__tests__/test-lock-prefix.test.js.
  assert.ok(!/with it in front/.test('run the commands without a lock'), 'planted opposite is not accepted by the in-front check');
});

// A6: a long-running start command is never wrapped, in every place that tells how to use the lock.
test('Sessions_LongRunningStartCommandIsNeverWrapped', () => {
  const never = (t) => /never wrap a long-running start command[^.]*lock for the server's life/i.test(flat(t));
  assert.ok(!never('Wrap the app\'s "Start the app" command too, so the lock is held for the server\'s life.'), 'the opposite claim is rejected');
  assert.ok(never('Never wrap a long-running start command (the app\'s "Start the app"): it would hold the lock for the server\'s life.'), 'the claim itself is accepted');
  assert.ok(never(slice(SKILL, '### Run the stories')), 'SKILL Feature "Shared test resources"');
  assert.ok(never(slice(SKILL, '## The story loop')), 'SKILL standalone "Shared test resources"');
  // The agents' own files (story-builder, suite-runner, prover) are asserted in agents/__tests__/agent-text-several-sessions.test.js.
});

// ── AC5: the disk check is given the Feature ─────────────────────────

test('Sessions_DiskCheckIsGivenTheFeature', () => {
  const before = slice(SKILL, '### Before the first story');
  assert.ok(before, 'SKILL has "Before the first story"');
  assert.match(before, /disk-check\.js" --feature <fid> --root "<home>"/, 'the call names the home folder, not the current directory');
  assert.ok(!/disk-check\.js(?!" --feature <fid> --root "<home>")/.test(before), 'no disk-check call is left without --feature and --root');
  assert.match(flat(before), /other Features being built from this home folder/);
});

// ── AC6: numbered files are reserved ─────────────────────────────────

test('Sessions_NumberedFilesAreReserved', () => {
  const claimsFree = (t) => /free on the base branch and not named in another Feature's `tasks\/features\/\*\/plan\.md`/.test(flat(t));
  assert.ok(!claimsFree('free on the base branch and named in another Feature\'s `tasks/features/*/plan.md`'), 'the opposite claim is rejected');
  assert.ok(claimsFree('free on the base branch and not named in another Feature\'s `tasks/features/*/plan.md`'), 'the claim itself is accepted');
  const plan = slice(SKILL, '### Plan the Feature');
  assert.ok(plan, 'SKILL has "Plan the Feature"');
  assert.ok(claimsFree(plan), 'SKILL: a number free on the base branch and not named in another Feature\'s plan');
  assert.match(plan, /Reserves: ADR-<n>/);
  assert.match(flat(plan), /an ADR, a migration/);
  // What the planner's own file says about numbered files is asserted in agents/__tests__/agent-text-several-sessions.test.js.
});

// ── AC1, AC2: the worktree rule ──────────────────────────────────────

test('Sessions_GitWorktreesRule_OneFeatureOneWorktreeOneSession', () => {
  const oneSession = (t) => /one Feature = one worktree = one branch = one session/i.test(t);
  assert.ok(!oneSession('1 worktree = 1 folder = 1 branch = 1 AI terminal context'), 'the old one-terminal wording alone is rejected');
  const core = slice(WORKTREES, '## Core Principle');
  assert.ok(core, 'git-worktrees.md has "Core Principle"');
  assert.ok(oneSession(core), 'one Feature = one worktree = one branch = one session');
  assert.match(flat(core), /several Feature sessions may share the home folder/i);
  assert.match(flat(core), /standalone run builds in the folder it runs in, so it is still one per folder/i);
  assert.match(flat(core), /never edits code there/i);
  assert.match(flat(WORKTREES), /second session on the same Feature is refused[^.]*feature-state\.js claim/i);
});

// ── ADR-0006 (plan gate answer 3) ────────────────────────────────────

test('Adr0006_OneSessionPerFeature_AcceptedWithWhy', () => {
  const accepted = (t) => /^- \*\*Status:\*\* accepted/m.test(t);
  const decides = (t) => /(?<!not )(?<!never )\bone session per Feature\b/i.test(t);
  const why = (t) => /one-terminal rule|work-feature|factory/i.test(t);
  assert.ok(!accepted('- **Status:** proposed'), 'a proposed ADR is not accepted');
  assert.ok(!decides('never one session per Feature'), 'a negated decision is rejected');
  const dir = path.join(REPO_ROOT, 'docs', 'adr');
  const matches = fs.readdirSync(dir).filter((f) => /^0006-.*\.md$/.test(f));
  assert.equal(matches.length, 1, 'exactly one ADR-0006 file');
  const t = readDocs('adr', matches[0]);
  assert.match(t, /^# ADR-0006 /m);
  assert.ok(accepted(t), 'ADR-0006 is accepted');
  const decision = slice(t, '## Decision');
  assert.ok(decision, 'it has a Decision section');
  assert.ok(decides(decision), 'the decision is one session per Feature');
  assert.match(flat(decision), /home folder/);
  assert.ok(why(t), 'it records why (the one-terminal rule it changes, the factory it matches)');
  assert.match(t, /ADR-0004/, 'it names the earlier decision it refines');
  assert.match(t, /^## Trade-offs considered/m);
});

// ── the earlier ADRs and the architecture agree with ADR-0006 ────────

test('Docs_EarlierAdrsAndArchitectureAgreeWithAdr0006', () => {
  const adr = (prefix) => readDocs('adr', fs.readdirSync(path.join(REPO_ROOT, 'docs', 'adr')).find((f) => f.startsWith(prefix)));
  assert.match(adr('0004-'), /^- \*\*Amended by ADR-0006 \(2026-11-04\):/m, 'ADR-0004 names the amendment');
  const a5 = flat(adr('0005-'));
  assert.doesNotMatch(a5, /not built yet/, 'ADR-0005 no longer says two Features at once is unbuilt');
  assert.match(a5, /one session per Feature/, 'ADR-0005 points to one session per Feature');
  const row = readArchitecture().split('\n').find((l) => /^\| 6 \| Verify lock/.test(l));
  assert.ok(row, 'ARCHITECTURE.md has the verify lock row');
  // F73 fix (A7): the per-story lock is gone; the default takes no lock.
  assert.match(row, /default takes no lock/, 'the default takes no lock');
  assert.match(row, /`<state>\/\.verify\.lock`[^|]*all sessions/, 'the state-folder lock is the global one for all sessions');
});
