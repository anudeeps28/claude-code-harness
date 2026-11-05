// Doc-consistency probe for F73 #83 "A standalone story or bug runs the same per-story loop": the
// standalone run builds with the story loop (story-builder, suite-runner, story-reviewer), not with
// executor waves; its plan is one story section; /troubleshoot, the executor, the wave rules that
// only the executor needed and the plan-lint hook are retired.
//
// Like the other probes here, this checks the instructions Claude reads at runtime. A check that
// matches words can match their negation, so each check below is first run on planted text that says
// the opposite, which it must reject, and then on the real file.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const exists = (...p) => fs.existsSync(path.join(REPO_ROOT, ...p));
const read = (...p) => fs.readFileSync(path.join(REPO_ROOT, ...p), 'utf8').replace(/\r\n/g, '\n');
// assert.match dumps the whole haystack on failure; these keep the message and drop it.
const must = (text, re, message) => assert.ok(re.test(text), message);
const mustNot = (text, re, message) => assert.ok(!re.test(text), message);
const flat = (t) => String(t).replace(/[*`]/g, '').replace(/\s+/g, ' ');

const IMPLEMENT = read('skills', 'implement', 'SKILL.md');

// The text from `heading` to the next heading of the same or a higher level, ignoring ``` blocks.
function section(content, heading) {
  const lines = content.split('\n');
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

// The text between two markers, or null when either is missing.
function between(content, from, to) {
  const a = content.indexOf(from);
  if (a === -1) return null;
  const b = content.indexOf(to, a + from.length);
  return b === -1 ? null : content.slice(a, b);
}

// Every markdown file the build skill and its agents are made of: agents/, rules/, skills/ (not
// their tests), README.md and CONTRIBUTING.md. History files (CHANGELOG, ADRs, the retirement
// inventory) are skipped because they say what used to be.
function instructionFiles() {
  const out = [];
  const walk = (rel) => {
    for (const e of fs.readdirSync(path.join(REPO_ROOT, rel), { withFileTypes: true })) {
      const next = `${rel}/${e.name}`;
      if (e.isDirectory()) { if (e.name !== '__tests__' && e.name !== 'node_modules') walk(next); continue; }
      if (e.name.endsWith('.md')) out.push(next);
    }
  };
  ['agents', 'rules', 'skills'].forEach(walk);
  out.push('README.md', 'CONTRIBUTING.md');
  return out;
}

function hitsIn(re, files = instructionFiles()) {
  const hits = [];
  for (const f of files) {
    read(...f.split('/')).split('\n').forEach((line, i) => { if (re.test(line)) hits.push(`${f}:${i + 1}`); });
  }
  return hits;
}

// ── AC1: the standalone run is the story loop ─────────────────────────────────────────────────────

// The loop's steps in the order they must happen. Each is searched for after the one before it.
const LOOP_STEPS = [
  ['builder writes the tests', /story-builder[\s\S]{0,80}job `tests`/],
  ['runner shows them red', /suite-runner[\s\S]{0,300}?\bred\b/],
  ['red evidence is checked', /red-evidence\.js/],
  ['builder writes the code', /story-builder[\s\S]{0,80}job `code`/],
  ['runner shows them green', /suite-runner[\s\S]{0,300}?\bgreen\b/],
  ['two reviewers', /two `story-reviewer`/],
  ['commit', /commit -F/],
];
function loopProblems(text) {
  const problems = [];
  let from = 0;
  for (const [name, re] of LOOP_STEPS) {
    const m = re.exec(text.slice(from));
    if (!m) { problems.push(`missing or out of order: ${name}`); continue; }
    from += m.index + m[0].length;
  }
  return problems;
}

const GOOD_LOOP = [
  'Spawn `story-builder` (job `tests`) from the criteria.',
  'The `suite-runner` must show the new tests red.',
  'Run red-evidence.js check.',
  'Spawn `story-builder` (job `code`).',
  'The `suite-runner` must show the scoped set green.',
  'Send two `story-reviewer` calls.',
  'Commit with git commit -F file.',
].join('\n');

test('Standalone_StartsNoExecutor_BuildsWithTheStoryLoop', () => {
  assert.deepEqual(loopProblems(GOOD_LOOP), [], 'the checker accepts the right order');
  const codeFirst = GOOD_LOOP.split('\n');
  [codeFirst[3], codeFirst[1]] = [codeFirst[1], codeFirst[3]];
  assert.notDeepEqual(loopProblems(codeFirst.join('\n')), [], 'code before the red run is rejected');

  assert.ok(!IMPLEMENT.includes('story-executor-agent'), 'SKILL.md must not name story-executor-agent');

  const loop = section(IMPLEMENT, '## The story loop');
  assert.ok(loop, 'SKILL.md needs a "## The story loop" section of its own, outside Feature mode');
  assert.deepEqual(loopProblems(loop), [], 'the loop orders builder tests, runner red, red-evidence.js, builder code, runner green, two story-reviewer, commit');

  const phase2 = section(IMPLEMENT, '## Phase 2 — Build the story');
  assert.ok(phase2, 'SKILL.md needs "## Phase 2 — Build the story"');
  must(phase2, /The story loop/, 'Phase 2 points at the story loop');
  mustNot(phase2, /\bwaves?\b|parallel_group|must_fail/i, 'Phase 2 has no waves');

  const feature = section(IMPLEMENT, '## Feature mode');
  assert.ok(feature, 'companion: Feature mode was read');
  must(feature, /The story loop/, 'Feature mode points at the same loop');

  // One table says what differs between the two runs.
  must(loop, /^\|[^\n]*Feature worktree[^\n]*project root/mi, 'a table row gives the work folder for each run');
  must(loop, /^\|[^\n]*feature-state\.js[^\n]*executor-state\.md/mi, 'a table row gives the step state for each run');
  must(loop, /^\|[^\n]*card/mi, 'a table row gives the card moves');
});

const noTaskXml = (t) => !/<tasks?[\s>]|parallel_group|<verify>/.test(t);

test('Standalone_PlanIsOneStorySection_NoTaskXml', () => {
  assert.ok(!noTaskXml('<tasks story="7">\n<task id="1" parallel_group="1">'), 'planted task XML is rejected');
  const skill = between(IMPLEMENT, '### Phase 1c — Plan', '## Phase 2 — Build the story');
  assert.ok(skill, 'SKILL.md needs Phase 1c followed by "## Phase 2 — Build the story"');
  assert.ok(noTaskXml(skill), 'Phase 1c must not ask for task XML, waves or verify blocks');
  mustNot(skill, /test-strategy\.md/, 'there is no separate test-strategy.md for a story');
  must(skill, /## Story #<id>/, 'the plan is one "## Story #<id>" section');
  must(skill, /## Probes/, 'the plan carries the Probes section');
  must(skill, /proof-check\.js"?[^\n]*--story <id>/, 'the proof check runs with --story <id>');
  must(skill, /slug/i, 'a plain description uses its slug as the id');

  const planner = read('agents', 'implement-planner-agent.md');
  assert.ok(noTaskXml(planner), 'the planner emits no task XML, waves or verify blocks');
  mustNot(planner, /Execution Plan|must_fail/, 'the planner has no Execution Plan and no must_fail');
  must(planner, /^## Plan format/m, 'the planner has one "Plan format" for a Feature and a single story');
  must(flat(planner), /single story[^.]{0,160}one section|one section[^.]{0,160}single story/i, 'a single story is one section');
});

// ── AC2: a bug is always test first, and its red line is recorded before the fix ──────────────────

test('Bug_FailingTestAndRedLineBeforeTheFix', () => {
  const loop = section(IMPLEMENT, '## The story loop');
  assert.ok(loop, 'SKILL.md needs "## The story loop"');
  assert.deepEqual(loopProblems(loop), [], 'the red step comes before the code step');
  must(flat(loop), /verbatim[^.]{0,120}suite-runner|suite-runner[^.]{0,200}verbatim/i, 'the red line is the suite-runner\'s verbatim line, not the builder\'s own run');
  must(flat(IMPLEMENT), /a bug's first test reproduces the bug/i, 'a bug\'s first test reproduces the bug');
  assert.ok(!flat('a bug is fixed code first, then a test.').match(/bug's first test reproduces/i), 'planted opposite is rejected');
  assert.ok(!exists('agents', 'story-executor-agent.md'), 'the text no longer sits in the executor\'s Step 3.5');
});

// ── AC3: the flags work on the loop ───────────────────────────────────────────────────────────────

const flagLine = (name) => IMPLEMENT.split('\n').find((l) => l.startsWith(`   - \`${name}\` →`)) || '';

test('Flags_TddStepReworkResumeOnTheLoop', () => {
  const tdd = flagLine('--tdd');
  assert.ok(tdd, 'the --tdd flag is kept');
  must(tdd, /every story is test[- ]first/i, '--tdd: every story is test first');
  must(tdd, /changes nothing|no effect/i, '--tdd changes nothing, because every story is test first');
  mustNot(tdd, /empty shell|three waves|real code/i, '--tdd no longer orders shell, test and code in waves');

  const step = flagLine('--step');
  assert.ok(step, 'the --step flag is kept');
  must(step, /\(STOP 1\)/, '--step stops after the brief');
  must(step, /\(STOP 1\.5\)/, '--step stops after the goal');
  must(step, /green \(STOP 2\)/, '--step stops at green');
  must(step, /\(STOP 3\)/, '--step stops before the push');
  mustNot(step, /\bwaves?\b/i, '--step has no wave stops');

  const auto = flagLine('--auto');
  assert.ok(auto, 'the --auto flag is kept');
  mustNot(auto, /\bwaves?\b/i, '--auto has no waves to drop');

  const resume = flagLine('--resume <id>');
  assert.ok(resume, 'the --resume flag is kept');
  must(resume, /saved step/i, '--resume carries on from the saved step');
  mustNot(resume, /finished tasks/i, '--resume has no finished tasks');

  const rework = section(IMPLEMENT, '## Rework mode');
  assert.ok(rework, 'companion: the Rework section was read');
  must(rework, /`story-builder`/, '--rework fixes go through story-builder');
  must(rework, /`suite-runner`/, '--rework fixes are run by suite-runner');
});

test('TestFirstMode_EveryStoryIsTestFirst', () => {
  const s = section(IMPLEMENT, '## Test-first mode');
  assert.ok(s, 'SKILL.md keeps a "## Test-first mode" section');
  must(flat(s), /every story is test[- ]first/i, 'every story is test first');
  must(flat(s), /smallest stub/i, 'the builder adds the smallest stub so the test compiles');
  must(flat(s), /red evidence/i, 'the red evidence is recorded');
  must(flat(s), /after the build[^.]{0,120}test[- ]first|test[- ]first[^.]{0,120}after the build/i, 'fixes after the build are test first');
  mustNot(s, /must_fail|\bwaves?\b|empty shell|parallel_group/i, 'no must_fail, waves or shell tasks');
});

test('Progress_OneTodoItemPerStory', () => {
  const onePerStory = (t) => /one TodoWrite item per story/i.test(flat(t)) && !/item per task/i.test(flat(t));
  assert.ok(!onePerStory('One TodoWrite item per task/step in the plan.'), 'planted opposite is rejected');
  const rule = read('rules', 'progress-tracking.md');
  assert.ok(onePerStory(rule), 'progress-tracking.md: one TodoWrite item per story, plus the phases after it');
  mustNot(rule, /`<task>`|<verify>|\bwaves?\b|\(verified\)|reopened/, 'no per-task statuses or waves');
});

// ── AC4: the executor, the wave rules it needed and the plan-lint hook are retired ───────────────

test('NothingNamesTheExecutor', () => {
  const re = /story-executor-agent/;
  assert.ok(re.test('spawn a story-executor-agent'), 'the pattern finds the name');
  const files = instructionFiles();
  assert.ok(files.length >= 20, `companion: at least 20 files were read (${files.length})`);
  assert.deepEqual(hitsIn(re, files), [], 'no agent, rule, skill, README or CONTRIBUTING line names the executor');
});

test('MustFailAndWaves_NoLongerExistInTheInstructions', () => {
  const files = instructionFiles();
  assert.ok(files.length >= 20, `companion: at least 20 files were read (${files.length})`);
  assert.deepEqual(hitsIn(/must_fail|parallel_group/, files), [], 'no must_fail or parallel_group in any instruction file');
});

// What a rule file about a shared working directory has to keep, and what it must have lost.
function waveRuleProblems(text) {
  const t = text.replace(/wave-execution\.md/g, '');
  const f = flat(t);
  const problems = [];
  if (/must_fail|parallel_group|\bwaves?\b/i.test(t)) problems.push('still talks of must_fail, parallel_group or waves');
  if (!/Do not spawn them with `isolation: "worktree"`/.test(t)) problems.push('no longer forbids isolation: "worktree"');
  if (!/git branch --show-current/.test(t)) problems.push('lost the branch check');
  if (!/restore/i.test(f) || !/git checkout --|git restore|worktree\.js"? git -- (?:\[?-C [^\]]*\]? )?restore/.test(t)) problems.push('lost restore before retrying');
  if (!/git status --porcelain/.test(t)) problems.push('lost the run\'s starting tree');
  if (!/git diff --cached --name-only/.test(t)) problems.push('lost the index check at commit');
  if (!/^## At skill startup/m.test(t)) problems.push('lost foreign work at startup');
  if (!/\bfeature:[^.]*?\bnot foreign work\b/.test(f)) problems.push('lost the Feature-run exception');
  return problems;
}

test('Executor_RetiredAndWaveRulesKeepOnlyWhatIsTrue', () => {
  const opposite = 'Wave agents run with `isolation: "worktree"` and a must_fail task runs alone in its wave.';
  assert.ok(waveRuleProblems(opposite).length >= 3, 'planted opposite text is rejected');
  assert.ok(!exists('agents', 'story-executor-agent.md'), 'agents/story-executor-agent.md is deleted');
  const rule = read('rules', 'wave-execution.md');
  assert.ok(rule.length > 500, 'companion: the rule file was read');
  // Planted: the real rule with the Feature-run exception sentence taken out.
  const withoutException = rule.replace(/A marker with a `feature:` key is a Feature run[^]*?counted as dirty for this check\./, '');
  assert.notEqual(withoutException, rule, 'the exception sentence was found to remove');
  assert.ok(waveRuleProblems(withoutException).includes('lost the Feature-run exception'), 'planted loss of the Feature-run exception is rejected');
  assert.deepEqual(waveRuleProblems(rule), [], 'rules/wave-execution.md keeps only what is still true');
  must(rule, /^# Shared working directory/m, 'the rule is retitled "Shared working directory"');
});

test('PlanLint_Retired', () => {
  for (const f of [
    ['hooks', 'plan-lint-check.js'], ['hooks', 'lib', 'plan-lint.js'],
    ['hooks', '__tests__', 'plan-lint.test.js'], ['hooks', '__tests__', 'plan-lint-check.test.js'],
    ['scripts', 'tdd-rig.js'],
  ]) assert.ok(!exists(...f), `${f.join('/')} is deleted`);

  const { buildSettings } = require('../../../install/lib/substitution.js');
  const settings = JSON.stringify(buildSettings({ hooksUnix: '/h', sessionStartMsg: 'hi', workRoot: '', isGlobal: false }));
  must(settings, /catalog-trigger\.js/, 'companion: the generated settings were read');
  mustNot(settings, /plan-lint/, 'buildSettings registers no plan-lint hook');
  must(read('examples', 'settings.json'), /catalog-trigger\.js/, 'companion: the example settings were read');
  mustNot(read('examples', 'settings.json'), /plan-lint/, 'examples/settings.json has no plan-lint hook');
  must(read('hooks', 'README.md'), /catalog-trigger\.js/, 'companion: the hooks README was read');
  mustNot(read('hooks', 'README.md'), /plan-lint/, 'hooks/README.md has no plan-lint row');
});

test('PrAgent_DraftsTheBodyOnly_TheLoopMakesTheCommits', () => {
  const t = flat(read('agents', 'story-pr-agent.md'));
  assert.ok(/one commit per (completed )?task/i.test('One commit per completed task.'), 'the pattern finds the old rule');
  assert.ok(t.length > 500, 'companion: the agent file was read');
  mustNot(t, /one commit per (completed )?task/i, 'no "one commit per task"');
  mustNot(t, /mark(s)? delivered tasks done/i, 'no "tasks done in the plan"');
});

// ── /troubleshoot is retired in this story (plan gate answer 4) ──────────────────────────────────

test('Troubleshoot_SkillAndInvestigatorAreGone', () => {
  assert.ok(exists('skills', 'debug', 'SKILL.md'), 'companion: /debug, where failures go instead, exists');
  assert.ok(!exists('skills', 'troubleshoot'), 'skills/troubleshoot/ is deleted');
  assert.ok(!exists('agents', 'troubleshoot-investigator.md'), 'agents/troubleshoot-investigator.md is deleted');
});

test('Troubleshoot_NothingSendsWorkToIt', () => {
  const re = /\/troubleshoot(?![\w-])|troubleshoot-investigator|skills\/troubleshoot/;
  assert.ok(re.test('route behavioral gaps to `/troubleshoot`.'), 'the pattern finds a route to it');
  assert.ok(!re.test('see TROUBLESHOOTING.md and /troubleshooting notes'), 'the pattern leaves the troubleshooting guide alone');
  const files = instructionFiles();
  assert.ok(files.length >= 20, `companion: at least 20 files were read (${files.length})`);
  assert.deepEqual(hitsIn(re, files), [], 'no skill, agent, rule, README or CONTRIBUTING line names /troubleshoot or its investigator');
});

test('Troubleshoot_E2eGateRoutesToDebugAndProverDiagnose', () => {
  const gate = (t) => {
    const p = t.split('\n').find((l) => l.startsWith('**e2e goal gate'));
    return p || '';
  };
  const routes = (p) => /`\/debug`/.test(p) && /prover[^.]{0,120}diagnose|diagnose[^.]{0,120}prover/i.test(flat(p)) && !/\/troubleshoot/.test(p);
  assert.ok(!routes('If the gate fails, route behavioral gaps to `/troubleshoot`.'), 'planted opposite is rejected');
  const p = gate(IMPLEMENT);
  assert.ok(p.length > 200, 'companion: the e2e gate paragraph was found');
  assert.ok(routes(p), 'a failed e2e gate goes to /debug and the prover\'s diagnose job');
  must(IMPLEMENT, /\| `prover` \| Prove it, job diagnose[^|]*\| opus \|/, 'companion: the prover diagnose row stays in the model table');
});
