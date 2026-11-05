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
const read = (...p) => fs.readFileSync(path.join(REPO_ROOT, ...p), 'utf8').replace(/\r\n/g, '\n');
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

const SKILL = read('skills', 'implement', 'SKILL.md');
const WAVE = read('rules', 'wave-execution.md');
const WORKTREES = read('rules', 'git-worktrees.md');
const PLANNER = read('agents', 'implement-planner-agent.md');
// The agents that run build, test or Observe commands in a Feature run: every agent the SKILL's "Run the
// stories" section names whose file gives it Bash and talks of build and tests. Derived, so a new such
// agent is found here instead of being forgotten by a hand-kept list.
const AGENTS = (() => {
  // F73 #83: the story steps moved to "## The story loop", so the agents are named in either place.
  const run = [slice(SKILL, '### Run the stories'), slice(SKILL, '## The story loop')].filter(Boolean).join('\n');
  const named = [...new Set([...run.matchAll(/`([a-z][a-z-]+)`/g)].map((m) => m[1]))]
    .filter((n) => fs.existsSync(path.join(REPO_ROOT, 'agents', `${n}.md`)));
  const fromStories = named.filter((n) => {
    const t = flat(read('agents', `${n}.md`));
    return /^tools:.*\bBash\b/m.test(read('agents', `${n}.md`)) && /\bbuild\b/i.test(t) && /\btests?\b/i.test(t);
  });
  // F73 fix (A2): the review agents run the build and the tests too (the evaluator's Steps 2-3, the
  // acceptance agent's Step 3). Any agent the SKILL names anywhere whose own steps say to run them is found here.
  const RUNS = /Run the project (?:build|tests?)|<(?:build|test|unit test|integration test) command|\b(?:run|runs) the (?:build|tests?|test suite)\b/i;
  const everyAgent = [...new Set([...SKILL.matchAll(/`([a-z][a-z-]+)`/g)].map((m) => m[1]))]
    .filter((n) => fs.existsSync(path.join(REPO_ROOT, 'agents', `${n}.md`)))
    .filter((n) => /^tools:.*\bBash\b/m.test(read('agents', `${n}.md`)) && RUNS.test(read('agents', `${n}.md`)));
  return [...new Set([...fromStories, ...everyAgent])].sort();
})();

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
  assert.match(read('rules', 'phase-markers.md'), /A marker written by an earlier run in this same directory is not foreign work/);
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

test('Sessions_TestLockInTheBriefsAndInBuilderRunnerProver', () => {
  const prefixed = (t) => /run every build, test and Observe command with it in front/i.test(flat(t));
  assert.ok(!prefixed('run every build, test and Observe command without it in front'), 'the opposite claim is rejected');
  assert.ok(prefixed('run every build, test and Observe command with it in front'), 'the claim itself is accepted');
  const run = [slice(SKILL, '### Run the stories'), slice(SKILL, '## The story loop')].filter(Boolean).join('\n');
  assert.ok(slice(SKILL, '### Run the stories'), 'SKILL has "Run the stories"');
  const flatRun = flat(run);
  assert.match(flatRun, /Shared test resources/);
  assert.match(flatRun, /`verify-lock: global`/);
  assert.equal(AGENTS.join(','), 'acceptance-test-agent,evaluator-agent,prover,story-builder,suite-runner', 'the agents that run build, test and Observe commands are exactly these five');
  assert.equal(AGENTS.length, 5, 'companion: the derivation found five, not none');
  assert.match(flatRun, /Test lock: node "<skill-dir>\/bin\/test-lock\.js" run --lock "<state>\/\.verify\.lock" --heartbeat "<state>\/features\/<fid>\/heartbeat" --/);
  assert.match(flatRun, /compound command[^.]*`a && b`[^.]*not wrapped[^.]*wrap each command/i, 'a compound command is not wrapped');
  assert.match(flatRun, /`per-story`\) passes none/, 'the default passes no lock');
  // The SKILL's Feature "Shared test resources" paragraph names every one of them, and /local-test.
  const shared = flat(slice(SKILL, '### Run the stories')).match(/Shared test resources\.[\s\S]*?(?=Then loop on)/);
  assert.ok(shared, 'the Feature "Shared test resources" paragraph was found');
  for (const name of AGENTS) assert.ok(shared[0].includes(`\`${name}\``), `the paragraph gives the lock to ${name}`);
  assert.match(shared[0], /`\/local-test` \(every level, e2e included\)/, 'and to /local-test, every level, e2e included');
  const standalone = flat(slice(SKILL, '## The story loop') || '');
  assert.match(standalone, /Test lock:[\s\S]*every agent and skill that executes a suite/, 'the standalone paragraph passes it to every suite runner');
  for (const name of AGENTS) {
    const t = read('agents', `${name}.md`);
    assert.match(t, /`Test lock:`/, `${name} names the Test lock prefix`);
    assert.ok(prefixed(t), `${name} runs every build, test and Observe command with the prefix in front`);
    assert.match(flat(t), /<prefix> <command>/, `${name} shows the shape`);
    assert.match(flat(t), /compound command[^.]*`a && b`[^.]*(?:not|never) wrapped[^.]*wrap each/i, `${name}: a compound command is wrapped one command at a time`);
    assert.match(flat(t), /(?:wait|waits) over 60 minutes \(exit 3\)[^.]*`STATUS: BLOCKED`[^.]*owner/i, `${name}: a lock wait over 60 minutes is BLOCKED with the owner`);
    assert.match(flat(t), /never wrap a long-running start command[^.]*(?:"Start the app")?[^.]*lock for the server's life/i, `${name}: a long-running start command is never wrapped (A6)`);
  }
  // /local-test is a skill, not an agent: the same prefix rule, in its own words.
  const lt = flat(read('skills', 'local-test', 'SKILL.md'));
  assert.match(lt, /`Test lock:` prefix/, 'local-test names the Test lock prefix');
  assert.ok(/with it in front \(`<prefix> <command>`\)/.test(lt), 'local-test puts the prefix in front of each command');
  assert.match(lt, /every build, test and E2E command, at every level and in the e2e gate/, 'every level and the e2e gate');
  assert.match(lt, /compound command[^.]*`a && b`[^.]*not wrapped[^.]*wrap each/i);
  assert.match(lt, /never wrap a long-running start command[^.]*lock for the server's life/i, 'local-test: a long-running start command is never wrapped (A6)');
  assert.ok(!/with it in front/.test('run the commands without a lock'), 'planted opposite is not accepted by the in-front check');
});

// A6: a long-running start command is never wrapped, in every place that tells how to use the lock.
test('Sessions_LongRunningStartCommandIsNeverWrapped', () => {
  const never = (t) => /never wrap a long-running start command[^.]*lock for the server's life/i.test(flat(t));
  assert.ok(!never('Wrap the app\'s "Start the app" command too, so the lock is held for the server\'s life.'), 'the opposite claim is rejected');
  assert.ok(never('Never wrap a long-running start command (the app\'s "Start the app"): it would hold the lock for the server\'s life.'), 'the claim itself is accepted');
  assert.ok(never(slice(SKILL, '### Run the stories')), 'SKILL Feature "Shared test resources"');
  assert.ok(never(slice(SKILL, '## The story loop')), 'SKILL standalone "Shared test resources"');
  for (const a of ['story-builder', 'suite-runner', 'prover']) assert.ok(never(read('agents', `${a}.md`)), a);
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
  assert.match(flat(PLANNER), /numbered file takes a number that no other `tasks\/features\/\*\/plan\.md` names/);
  assert.match(PLANNER, /Reserves: <name>-<n>/);
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
  const t = read('docs', 'adr', matches[0]);
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
  const adr = (prefix) => read('docs', 'adr', fs.readdirSync(path.join(REPO_ROOT, 'docs', 'adr')).find((f) => f.startsWith(prefix)));
  assert.match(adr('0004-'), /^- \*\*Amended by ADR-0006 \(2026-11-04\):/m, 'ADR-0004 names the amendment');
  const a5 = flat(adr('0005-'));
  assert.doesNotMatch(a5, /not built yet/, 'ADR-0005 no longer says two Features at once is unbuilt');
  assert.match(a5, /one session per Feature/, 'ADR-0005 points to one session per Feature');
  const row = read('ARCHITECTURE.md').split('\n').find((l) => /^\| 6 \| Verify lock/.test(l));
  assert.ok(row, 'ARCHITECTURE.md has the verify lock row');
  // F73 fix (A7): the per-story lock is gone; the default takes no lock.
  assert.match(row, /default takes no lock/, 'the default takes no lock');
  assert.match(row, /`<state>\/\.verify\.lock`[^|]*all sessions/, 'the state-folder lock is the global one for all sessions');
});
