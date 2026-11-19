'use strict';
// Checks on the agents' own text (rules/modules.md: "Checks on an agent's own text live in agents/__tests__/").
// Each block below came out of a /implement probe test (story #6j2mgp8CJ6mRHW32, check 5), which may no longer
// read an agent's file: the probe keeps what it says about its own skill, and the agent's sentences are
// asserted here, under the same test names and assertion messages. Doc-consistency tests: nothing parses
// agent prose, so a file that loses a sentence does not throw; these pin it.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const AGENTS_DIR = path.join(__dirname, '..');
// CRLF on a Windows checkout would break every pattern that spans a line end.
const readAgent = (name) => {
  try {
    return fs.readFileSync(path.join(AGENTS_DIR, `${name}.md`), 'utf8').replace(/\r\n/g, '\n');
  } catch {
    return null;
  }
};
const flat = (s) => String(s).replace(/\s+/g, ' ');
const { PROOF_KINDS } = require('../../skills/implement/bin/proof-check.js');

// The helpers every section below shares, defined once.
const AGENT_SENTENCE =
  'Your report starts with one line: `STATUS: DONE`, `STATUS: DONE_WITH_CONCERNS`, `STATUS: BLOCKED` or `STATUS: NEEDS_CONTEXT` (`rules/agent-handoff.md`).';
const PLANNER = readAgent('implement-planner-agent');
const UNDERSTAND = readAgent('story-understand-agent');

function mustMatch(content, re, message) { assert.ok(content && re.test(content), message); }

// The text of the section that starts at `heading`, to the next heading of the same or a higher level.
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

// ── from story-agents.probe.test.js (Feature 72, story 76) ───────────────────────────────────────
// Content predicates are tested twice: against planted text asserting the OPPOSITE (must be rejected)
// and against the real file (the enforcement).
{
  const AGENTS = ['story-builder', 'story-reviewer', 'suite-runner'];

  const agentSaysStatusLine = (t) => flat(t).includes(AGENT_SENTENCE);

  // Every sentence that mentions git add / commit / push must start with "Do not" or "never".
  const gitMentions = (t) => flat(t).split(/(?<=[.!?])\s+|\n/).filter((s) => /\bgit (add|commit|push)\b/i.test(s));
  const gitOnlyForbidden = (t) => {
    const s = gitMentions(t);
    return s.length > 0 && s.every((x) => /^\W*(do not|never)\b/i.test(x.trim()));
  };
  const reportsTestNameCriterionAssertion = (t) =>
    /per test[^.\n]*\bname\b[^.\n]*\b(AC|criterion)\b[^.\n]*assertion line it failed on/i.test(flat(t));
  const reReviewJudgesFixDiffOnly = (t) =>
    /Re-review judges each open finding ADDRESSED or NOT ADDRESSED over the fix diff only/.test(flat(t));
  const suiteReturnsOnlySummary = (t) =>
    /(^|\s)No passing test names, no logs\.(\s|$)/.test(flat(t)) &&
    /Per failing test: its full name and its first error line/i.test(flat(t));
  const toolsLine = (t) => (t.match(/^tools:\s*(.*)$/m) || [])[1];
  const hasModel = (t, m) => new RegExp(`^model: ${m}$`, 'm').test(t);
  const trackerOnly = (t) => /\baz\b|ado-commands|work item|tasks\/build-commands\.md|journal/i.test(t);

  const OPPOSITE_BUILDER = 'When the tests are green, run git commit and then git push.\nNever skip the tests.';
  const OPPOSITE_TOOLS = 'tools: Read, Write, Edit, Glob, Grep, Bash';
  const OPPOSITE_ADO = 'Update the work item with az boards, then add a journal entry.';
  const OPPOSITE_AGENT = AGENT_SENTENCE.replace('starts with one line', 'may start with one line');
  const OPPOSITE_COUNT = 'Per test give its name, AC id and the assertion it passed on.';
  const OPPOSITE_REREVIEW =
    'Re-review does not judge each open finding ADDRESSED or NOT ADDRESSED over the fix diff only; it reviews the whole story again';
  const OPPOSITE_SUITE =
    'Per failing test: its full name and its first error line. No passing test names, no logs is not required: include the passing test names and the full log, not only the first error line.';

  // ── AC1 / AC2 ──
  test('Builder_ReportsTestsWithCriterionAndFailingAssertion_NeverCommits', () => {
    assert.ok(!gitOnlyForbidden(OPPOSITE_BUILDER), 'planted "run git commit when green" must be rejected');
    assert.ok(!reportsTestNameCriterionAssertion(OPPOSITE_COUNT), 'planted "assertion it passed on" must be rejected');

    const t = readAgent('story-builder');
    assert.ok(t, 'AC1: agents/story-builder.md must exist');
    assert.ok(reportsTestNameCriterionAssertion(t), 'AC2: per test the report gives its name, its AC id and the assertion line it failed on');
    assert.ok(gitMentions(t).length > 0, 'AC2: the file must say something about git add / commit / push');
    assert.ok(gitOnlyForbidden(t), 'AC2: every git add / commit / push mention must sit in a sentence starting "Do not" or "never"');
  });

  // ── AC3 ──
  test('Reviewer_EditsNothing_ReReviewIsAddressedOrNotOverTheFixDiff', () => {
    assert.notStrictEqual(toolsLine(OPPOSITE_TOOLS), 'Read, Glob, Grep, Bash', 'planted write-capable tools must be rejected');
    assert.ok(!reReviewJudgesFixDiffOnly(OPPOSITE_REREVIEW), 'planted "re-review the whole story" must be rejected');

    const t = readAgent('story-reviewer');
    assert.ok(t, 'AC3: agents/story-reviewer.md must exist');
    assert.ok(/^tools: Read, Glob, Grep, Bash$/m.test(t), 'AC3: tools must be exactly Read, Glob, Grep, Bash');
    for (const mode of ['Correctness', 'Rules and quality', 'Re-review', 'Cross-story']) {
      assert.ok(t.includes(mode), `AC3: the reviewer must name the mode "${mode}"`);
    }
    assert.ok(reReviewJudgesFixDiffOnly(t), 'AC3: Re-review judges each open finding ADDRESSED or NOT ADDRESSED over the fix diff only');
  });

  // ── AC4 ──
  test('SuiteRunner_ReturnsOnlyTheSummaryAndFirstErrorLine', () => {
    assert.ok(!suiteReturnsOnlySummary(OPPOSITE_SUITE), 'planted "include names and the full log" must be rejected');

    const t = readAgent('suite-runner');
    assert.ok(t, 'AC4: agents/suite-runner.md must exist');
    assert.ok(suiteReturnsOnlySummary(t), 'AC4: must say "No passing test names, no logs" and report each failing test\'s first error line');
  });

  // ── AC1 / AC5 ──
  test('StoryAgents_RunOnSonnetAndStartWithStatus', () => {
    assert.ok(!hasModel('model: opus', 'sonnet'), 'planted opus model must be rejected');
    assert.ok(!agentSaysStatusLine(OPPOSITE_AGENT), 'planted text without the sentence must be rejected');

    for (const name of AGENTS) {
      const t = readAgent(name);
      assert.ok(t, `AC1: agents/${name}.md must exist`);
      assert.ok(hasModel(t, 'sonnet'), `AC5: ${name} must have "model: sonnet"`);
      assert.ok(agentSaysStatusLine(t), `AC1: ${name} must carry the STATUS-line sentence`);
    }
  });

  // ── AC1 ──
  test('StoryAgents_NoTrackerOnlySteps', () => {
    assert.ok(trackerOnly(OPPOSITE_ADO), 'planted ADO line must be caught by the predicate');

    for (const name of AGENTS) {
      const t = readAgent(name);
      assert.ok(t, `AC1: agents/${name}.md must exist`);
      assert.ok(!trackerOnly(t), `AC1: ${name} must have no ADO / journal / build-commands steps`);
    }
  });
}

// ── from feature-plan.probe.test.js (Feature 72, story 77) ───────────────────────────────────────
// "Plan the whole Feature once": the planner's plan format, the understand agent's Feature scope, and
// that no story agent plans. Every check is run against planted opposite text too.
{
  // ── AC2: the planner's Feature-plan mode ──
  const PARTS = ['Files', 'Tests to write first', 'Acceptance criteria and their proofs', 'Source requirements', 'Commands', 'Open questions'];
  const hasAllParts = (t) => PARTS.every((p) => t.includes(`**${p}:**`));
  const noTaskXml = (t) => /\bno task XML\b/i.test(flat(t)) || /\bno `?<task>`?/i.test(flat(t)) || /\bno <task> (xml|blocks?)/i.test(flat(t)) || /never[^.]*`?<task>`?/i.test(flat(t));

  test('FeaturePlan_PlanHoldsTheFivePartsPerStory', () => {
    // F73 #83: "Feature-plan mode" became "Plan format", used for a Feature (many story sections) and
    // for a single story (one section).
    const mode = section(PLANNER, '## Plan format') || section(PLANNER, '## Feature-plan mode') || section(PLANNER, '### Feature-plan mode');
    assert.ok(mode, 'AC2: agents/implement-planner-agent.md must have a "Plan format" (formerly "Feature-plan mode") section');

    const plantedMissing = '## Story #<sid>\n**Files:**\n**Tests to write first:**\n**Commands:**\nWrite a `<task>` block per story.';
    assert.ok(!hasAllParts(plantedMissing), 'planted section lacking proofs/source/questions must be rejected');
    assert.ok(!noTaskXml(plantedMissing), 'planted "write a <task> block per story" must be rejected');

    assert.ok(hasAllParts(mode), `AC2: Feature-plan mode names every per-story part: ${PARTS.join(', ')}`);
    assert.ok(noTaskXml(mode), 'AC2: Feature-plan mode says there is no <task> XML');
    for (const w of ['Proof:', 'Seen by:', 'Would lie if:']) assert.ok(mode.includes(w), `AC2: it names the ${w} line per criterion`);
    assert.ok(/## Story #<sid>/.test(mode), 'AC2: one "## Story #<sid>" section per story');
    assert.ok(/tasks\/features\/<fid>\/plan\.md/.test(mode), 'AC2: it writes tasks/features/<fid>/plan.md');
  });

  // ── AC5: no planner call after the gate (the story agents' side; /implement's own text is checked in its probe) ──
  test('FeaturePlan_NoPlannerAfterTheGate_StoryAgentFiles', () => {
    const others = ['story-builder', 'story-reviewer', 'suite-runner'].map((a) => readAgent(a));
    assert.ok(others.length === 3 && others.every((t) => t && t.length > 200), 'companion: the three agent files were read');

    // The agent by name, or "a runner's planner" in prose: either starts a plan after the gate.
    const plans = (t) => /implement-planner-agent|\bplanner\b/i.test(t);
    assert.ok(plans('Start the implement-planner-agent for the story.'), 'planted planner call must be detected');
    assert.ok(plans("Once a runner's planner has saved its plan"), 'planted prose planner mention must be detected');
    assert.ok(!plans('Start the story-builder for the story.'), 'companion: text with no planner is accepted');
    const hits = others.filter(plans).length;
    assert.strictEqual(hits, 0, `AC5: no planner call after the plan gate (found in ${hits} of the Feature run text, story-builder, story-reviewer, suite-runner)`);
  });

  // ── the understand agent's Feature scope ──
  const featureScopeOk = (t) => {
    const s = flat(t);
    return /every child (ticket|`?ticket\.md`?)/i.test(s)
      && /tasks\/features\/<fid>\/brief\.md/.test(s)
      && /points? (from )?1[-–—]10/i.test(s)
      && /open question[^.]*recommended answer/i.test(s)
      && !/\bonly the Feature\b[^.]*\bnever the children\b/i.test(s);
  };

  test('FeaturePlan_UnderstandAgentHasAFeatureScope', () => {
    const planted = '## Feature scope\nReads only the Feature ticket, never the children. Writes the brief to tasks/features/<fid>/brief.md.';
    assert.ok(!featureScopeOk(planted), 'planted "only the Feature, never the children" must be rejected');

    const scope = section(UNDERSTAND, '## Feature scope') || section(UNDERSTAND, '### Feature scope');
    assert.ok(scope, 'agents/story-understand-agent.md must have a "Feature scope" section');
    assert.ok(featureScopeOk(scope), 'the Feature scope reads every child ticket plus the code, writes tasks/features/<fid>/brief.md, gives points 1-10 per story and every open question with a recommended answer');
  });
}

// ── from feature-mode.probe.test.js (F4 #41 "Build a whole Feature, one story at a time") ────────
// Work and state folders for every build agent (#42), tracker-helper's quoting, the baseline and detached
// HEAD rules, and where the acceptance agent and the planner read a Feature's criteria from.
{
  const agent = (name) => readAgent(name);

  // ── #42 work folder and state folder ──
  const BUILD_AGENTS = ['implement-planner-agent', 'evaluator-agent', 'acceptance-test-agent', 'architect-reviewer-agent', 'security-reviewer-agent'];

  for (const a of BUILD_AGENTS) {
    test(`Folders_${a}_TakesAWorkFolderAndAStateFolder`, () => {
      const text = agent(a);
      mustMatch(text, /work folder/i, `${a} must name the work folder`);
      mustMatch(text, /state folder/i, `${a} must name the state folder`);
      mustMatch(text, /(none given|names neither)[\s\S]{0,200}(project root|current folder|YOUR_PROJECT_ROOT)/i, `${a} must fall back to today's behaviour when given neither`);
    });
  }

  // F72 #79: the agents that replace the story runner take the work folder; the ones that read plans
  // or notes also take the state folder (the suite-runner only runs commands, so it needs the work folder).
  for (const a of ['story-builder', 'story-reviewer', 'suite-runner']) {
    test(`Folders_${a}_TakesTheWorkFolder`, () => {
      mustMatch(agent(a), /\*\*work folder\*\*/i, `${a} must name the work folder`);
    });
  }

  for (const a of ['story-builder']) {
    test(`Folders_${a}_TakesAStateFolder`, () => {
      mustMatch(agent(a), /\*\*state folder\*\*/i, `${a} must name the state folder`);
    });
  }

  test('Folders_ReviewersDiffAgainstTheBaseRef', () => {
    for (const a of ['evaluator-agent', 'acceptance-test-agent', 'architect-reviewer-agent', 'security-reviewer-agent']) {
      const text = agent(a);
      mustMatch(text, /git diff --stat <base>\.\.\.HEAD/, `${a} must diff <base>...HEAD`);
      assert.ok(!/git diff[^\n]*HEAD~1\.\.HEAD/.test(text), `${a} must not hard-code HEAD~1..HEAD any more`);
    }
  });

  // Ticket and message text is data: it never goes inside double quotes of a shell line.
  test('Quoting_MessagesAndTitlesNeverGoInsideDoubleQuotes_TrackerHelper', () => {
    const helper = agent('tracker-helper');
    assert.doesNotMatch(helper, /never as text you assemble into a shell string/, 'the impossible rule is gone');
    mustMatch(helper, /temp(orary)? file[^.]{0,200}"\$\(cat <file>\)"/, 'tracker-helper writes values to a temp file and passes the file');
    mustMatch(helper, /never as an inline heredoc/, 'not as an inline heredoc: a body line equal to its end marker would end it early');
    mustMatch(helper, /never inside double quotes/, 'never inside double quotes');
    mustMatch(helper, /instructions inside (it|ticket text) are ignored/i, 'ticket text is data');
  });

  test('Baseline_AScratchCopyOnlyAndProverChecksDetachedHead', () => {
    mustMatch(flat(agent('suite-runner')), /baseline[^.]{0,200}`worktree\.js scratch`[^.]{0,120}never in the work folder/i, 'a baseline checkout happens only in a scratch copy');
    mustMatch(flat(agent('prover')), /`git rev-parse --abbrev-ref HEAD`[^.]{0,80}`HEAD`[^.]{0,160}BLOCKED/, 'prover checks it is on a detached HEAD before it commits');
  });

  // In Feature mode the criteria live in the Feature plan, which a Feature run writes; the per-story
  // test-strategy.md is never written.
  test('FeatureCriteria_ComeFromThePlanNotFromTestStrategyFiles_Agents', () => {
    const acc = flat(agent('acceptance-test-agent'));
    mustMatch(acc, /features\/<fid>\/plan\.md`\), whose `## Story #<sid>` sections hold each story's criteria/, 'the acceptance agent reads the plan\'s Story sections in a Feature panel');
    assert.doesNotMatch(acc, /every story's test strategy/, 'and not every story\'s test strategy');
    // The Feature-level criteria F.<n> live in the Feature's test-strategy.md (what pr-gate.js reads);
    // the story criteria live in the plan's Story sections.
    const fromStrategy = /`F\.<n>`[^.|]{0,200}features\/<fid>\/test-strategy\.md/;
    assert.ok(!fromStrategy.test('the criteria `F.<n>` come from the Feature plan.md'), 'planted F.<n> read from the plan must be rejected');
    mustMatch(acc, fromStrategy, 'acceptance: F.<n> come from tasks/features/<fid>/test-strategy.md');
    const planner = flat(agent('implement-planner-agent'));
    assert.doesNotMatch(planner, /one file, `tasks\/features\/<fid>\/plan\.md`\*\*, and nothing else/, 'the planner writes the Feature test-strategy.md too');
    mustMatch(planner, /`tasks\/features\/<fid>\/plan\.md`[^.]{0,200}Feature-level criteria[^.]{0,80}`tasks\/features\/<fid>\/test-strategy\.md`[^.]{0,200}no per-story `plan\.md` or `test-strategy\.md`/, 'Feature-plan mode: plan.md for the stories, Feature-level criteria in the Feature test-strategy.md, no per-story files');
  });
}

// ── from one-gate.probe.test.js (the plan-to-PR flow, 2026-11-03) ────────────────────────────────
// What the planner, the understand agent, the builder, the acceptance agent, the evaluator and the
// auditor say about source lines, scope and the closing check.
{
  test('Implement_SourceLinesAreReadAndBecomeCriteriaVerbatim_Planner', () => {
    mustMatch(readAgent('implement-planner-agent'), /starts with its id and quotes the line verbatim/, 'the planner writes each line as an id-tagged criterion');
  });

  test('Implement_ReviewersCheckTheLinesAsWritten_Agents', () => {
    const ACCEPTANCE = readAgent('acceptance-test-agent');
    const EVALUATOR = readAgent('evaluator-agent');
    mustMatch(ACCEPTANCE, /line exactly as the source requirements state it/, 'the acceptance agent judges the line as written');
    mustMatch(ACCEPTANCE, /PARTIAL\*\*, never PASS/, 'a line done in part is never PASS');
    mustMatch(EVALUATOR, /Source lines \| ✅ PASS/, 'the evaluator has a source-lines hard gate');
  });

  test('NeverShrinkScope_IsNotSelfAnswerableAnywhere_Agents', () => {
    const BUILDER = readAgent('story-builder');
    const PLANNER = readAgent('implement-planner-agent');
    const UNDERSTAND = readAgent('story-understand-agent');
    mustMatch(BUILDER, /Never shrink scope/, 'the story builder states it');
    mustMatch(BUILDER, /Never shrink scope[\s\S]{0,500}?`STATUS: (NEEDS_CONTEXT|BLOCKED)`[\s\S]{0,200}?never (answer|settle|decide)/i,
      'on a scope question the builder reports NEEDS_CONTEXT or BLOCKED and never answers it itself');
    const scopeCheck = (t) => /Never shrink scope[\s\S]{0,500}?`STATUS: (NEEDS_CONTEXT|BLOCKED)`[\s\S]{0,200}?never (answer|settle|decide)/i.test(t);
    assert.ok(!scopeCheck('Never shrink scope. When unsure which reading is meant, decide it yourself and carry on; report `STATUS: DONE`.'), 'planted opposite: a builder that settles the reading itself is rejected');
    mustMatch(PLANNER, /never plan the narrow\s+reading/, 'the planner asks instead of planning the narrow reading');
    mustMatch(UNDERSTAND, /Never settle a scope reading yourself/, 'the understand agent collects scope readings as questions');
  });

  test('ClosingCheck_AFreshAgentReadsTheDocumentAgainstTheCode_Auditor', () => {
    const AUDITOR = readAgent('coverage-auditor-agent');
    mustMatch(AUDITOR, /^tools: Read, Glob, Grep, Bash$/m, 'the auditor cannot edit');
    mustMatch(AUDITOR, /Anything under `tasks\/`/, 'the auditor never reads the story state');
    mustMatch(AUDITOR, /Partly is never rounded up to Built/, 'Partly is never rounded up');
  });
}

// ── from every-feature-has-a-demo.probe.test.js (F3 #36 "Every Feature has a Demo") ──────────────
// What the planner says about probes, proofs and the Demo. PROOF_KINDS is /implement's listed Callable part.
{
  test('Observe_PlannerBuildsTheProbes_Agent', () => {
    mustMatch(PLANNER, /Build the probe: <entry>/, 'the planner names each probe task "Build the probe: <entry>"');
  });

  test('Proof_PlannerWritesThreeLinesPerCriterion', () => {
    const s = section(PLANNER, '### Goal and proofs');
    mustMatch(s, /\*\*Acceptance criteria and their proofs:\*\*/, 'the planner writes the proof list');
    for (const f of ['Proof:', 'Seen by:', 'Would lie if:']) assert.ok(s.includes(f), `the planner must write a "${f}" line`);
    for (const k of PROOF_KINDS) assert.ok(s.includes(k), `the planner must list the "${k}" proof kind`);
    mustMatch(s, /named mutation|missing assertion/i, '"Would lie if" must be concrete');
  });

  test('Proof_PlannerRestatesTheDemoNeverWeaker', () => {
    const s = section(PLANNER, '### Demo');
    assert.ok(s, 'expected a "### Demo" subsection in the planner');
    mustMatch(s, /## Demo/, 'the plan carries a ## Demo section');
    mustMatch(s, /never weaker/i, 'the Demo may be more precise, never weaker');
  });
}

// ── from model-per-job.probe.test.js ("a model per job", Feature 72, story 75) ───────────────────
// Each agent file's `model:` is pinned here against EXPECTED_MODELS, written out by hand; /implement's probe
// pins its "Which model each job runs on" default rows against its own written-out copy. Neither test may
// read the other module's body, so neither compares the two: that one comparison, file against table, is
// scripts/__tests__/boundaries-models.test.js. These pins only catch a change made on one side alone.
{
  const BUILT_IN = new Set(['Explore']);
  const EXPECTED_MODELS = {
    'story-understand-agent': 'opus',
    'implement-planner-agent': 'opus',
    Explore: 'opus',
    'story-builder': 'sonnet',
    'suite-runner': 'sonnet',
    'story-reviewer': 'sonnet',
    'evaluator-agent': 'opus',
    'acceptance-test-agent': 'opus',
    'architect-reviewer-agent': 'opus',
    'security-reviewer-agent': 'opus',
    'loosened-reviewer-agent': 'sonnet',
    prover: 'sonnet',
    'coverage-auditor-agent': 'opus',
    'debug-agent': 'opus',
    'story-pr-agent': 'sonnet',
    'tracker-helper': 'haiku',
  };
  const frontmatter = (t) => { const m = t.match(/^---\n([\s\S]*?)\n---/); return m ? m[1] : ''; };
  const fileModel = (t) => { const m = frontmatter(t).match(/^model:\s*(\S+)\s*$/m); return m ? m[1] : null; };

  test('Model_EachAgentFileMatchesItsDefaultRow', () => {
    assert.notStrictEqual(fileModel(readAgent('story-builder')), 'opus', 'a table that says opus for the sonnet builder must disagree with its file');

    const defaults = new Map(Object.entries(EXPECTED_MODELS));
    const drift = [];
    let compared = 0;
    for (const [agent, model] of defaults) {
      const text = readAgent(agent);
      if (text === null) {
        if (!BUILT_IN.has(agent)) drift.push(`${agent}: no agents/${agent}.md`);
        continue;
      }
      compared++;
      if (fileModel(text) !== model) drift.push(`${agent}: table says ${model}, file says ${fileModel(text)}`);
    }
    assert.ok(compared >= 10, `companion: at least 10 agent files must be compared (got ${compared})`);
    assert.deepStrictEqual(drift, [], `AC3/AC6: agent models must match the table: ${drift.join('; ')}`);
    for (const a of ['story-understand-agent', 'implement-planner-agent']) {
      assert.strictEqual(fileModel(readAgent(a)), 'opus', `AC3: ${a} stays opus`);
    }
  });

  // ── AC4 ──
  const helperRunsGivenCommands = (t) => /\bonly\b[^.\n]*commands? (you are|it is|you were) given/i.test(flat(t)) || /runs?[^.\n]*\bthe given\b[^.\n]*commands?/i.test(flat(t));
  const helperReadsBack = (t) => /\bread[s]? (it |each one |the (item|card|file) )?back\b/i.test(flat(t));
  const helperNeverImprovises = (t) => /\bnever\b[^.\n]*\b(improvis|another command|other command|substitut)/i.test(flat(t));

  test('TrackerHelper_HaikuRunsGivenCommandsReportsReadBack', () => {
    const opposite = '---\nname: tracker-helper\nmodel: opus\n---\nThink up the best command for the job and run it. Trust the write; do not look at it again.';
    assert.ok(!helperRunsGivenCommands(opposite) && !helperReadsBack(opposite) && !helperNeverImprovises(opposite), 'planted "improvise and trust" text must be rejected');

    const t = readAgent('tracker-helper');
    assert.ok(t, 'AC4: agents/tracker-helper.md must exist');
    assert.strictEqual(fileModel(t), 'haiku', 'AC4: tracker-helper runs on haiku');
    assert.ok(helperRunsGivenCommands(t), 'AC4: it runs only the adapter commands it is given');
    assert.ok(helperReadsBack(t), 'AC4: it reads back what it wrote and reports it');
    assert.ok(helperNeverImprovises(t), 'AC4: it never improvises another command');
    assert.ok(/trackers\/active/.test(t), 'AC4: it names the trackers/active adapter scripts');
    assert.ok(flat(t).includes(AGENT_SENTENCE), 'it reports a STATUS line first');
    assert.ok(/^tools:\s*.*\bBash\b/m.test(frontmatter(t)), 'it needs Bash to run the adapter commands');
  });
}
