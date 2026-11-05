// Doc-consistency probe for "plan the whole Feature once, on Opus" (Feature 72, story 77). In Feature
// mode /implement understands and plans every story once, before the single plan gate; nothing plans
// a story afterwards. Nothing parses this prose, so drift does not throw; this probe pins it. Every
// content check is tested twice: against planted text saying the OPPOSITE (must be rejected, proving
// the check can fail) and against the real files (the enforcement).

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
// CRLF on a Windows checkout would break every pattern that spans a line end.
const read = (...p) => fs.readFileSync(path.join(REPO_ROOT, ...p), 'utf8').replace(/\r\n/g, '\n');
const flat = (s) => s.replace(/\s+/g, ' ');

const SKILL = read('skills', 'implement', 'SKILL.md');
const UNDERSTAND = read('agents', 'story-understand-agent.md');
const PLANNER = read('agents', 'implement-planner-agent.md');

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

const PLAN_FEATURE = section(SKILL, '### Plan the Feature');

// Paragraphs and list items, each flattened to one line.
const chunks = (t) => t.split(/\n[ \t]*\n|\n(?=\s*(?:\d+\.|[-*])\s)/).map(flat).filter(Boolean);
const sentences = (t) => chunks(t).flatMap((c) => c.split(/(?<=[.!?])\s+/));

// ── AC1: one understand call and one planner call per Feature, on opus ────────────────────────────

// Exactly one chunk spawns the agent with `model: \`opus\``, and no chunk spawns it per story.
function onceOnOpus(text, agent) {
  const named = chunks(text).filter((c) => c.includes(agent));
  const spawns = named.filter((c) => /model: `opus`/.test(c));
  const perStory = named.filter((c) => new RegExp(`for each story[\\s\\S]{0,80}(story-understand|implement-planner)`, 'i').test(c)
    || new RegExp(`(each|every) story[\\s\\S]{0,40}${agent}`, 'i').test(c));
  return spawns.length === 1 && perStory.length === 0;
}

test('FeaturePlan_UnderstandAndPlannerOncePerFeatureOnOpus', () => {
  const plantedLoop = 'For each story, spawn a `story-understand-agent` (foreground, model: `opus`).\n\nThen spawn one `implement-planner-agent` (foreground, model: `opus`).';
  assert.ok(!onceOnOpus(plantedLoop, 'story-understand-agent'), 'planted "for each story spawn the understand agent" must be rejected');
  const plantedSonnet = 'Spawn one `story-understand-agent` (foreground, model: `sonnet`).';
  assert.ok(!onceOnOpus(plantedSonnet, 'story-understand-agent'), 'planted sonnet spawn must be rejected');
  const plantedTwice = 'Spawn a `implement-planner-agent` (model: `opus`).\n\nSpawn another `implement-planner-agent` (model: `opus`).';
  assert.ok(!onceOnOpus(plantedTwice, 'implement-planner-agent'), 'planted two spawns must be rejected');
  assert.ok(onceOnOpus('Spawn **one** `story-understand-agent` (foreground, model: `opus`) for the Feature.', 'story-understand-agent'), 'companion: a single opus spawn is accepted');

  assert.ok(PLAN_FEATURE, 'SKILL.md must keep a "### Plan the Feature" section');
  assert.ok(onceOnOpus(PLAN_FEATURE, 'story-understand-agent'), 'AC1: Plan the Feature spawns story-understand-agent exactly once, model: `opus`, never per story');
  assert.ok(onceOnOpus(PLAN_FEATURE, 'implement-planner-agent'), 'AC1: Plan the Feature spawns implement-planner-agent exactly once, model: `opus`, never per story');
});

// ── AC2: the planner's Feature-plan mode ──────────────────────────────────────────────────────────

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

// ── AC3: the four checks run on the Feature plan, before the gate ─────────────────────────────────

const GATE_MARK = 'Before I finalize';
const CHECKS = [
  /demo\.js"? compare [^\n]*tasks\/features\/<fid>\/plan\.md/,
  /proof-check\.js"? tasks\/features\/<fid>\/plan\.md/,
  /observe-check\.js"?[^\n]*--plan tasks\/features\/<fid>\/plan\.md/,
  /source-lines\.js"? compare [^\n]*tasks\/features\/<fid>\/plan\.md[^\n]*--story/,
];
function checksBeforeGate(text) {
  const gate = text.indexOf(GATE_MARK);
  if (gate === -1) return false;
  const before = text.slice(0, gate);
  return CHECKS.every((re) => re.test(before));
}

test('FeaturePlan_FourChecksRunOnTheFeaturePlanBeforeTheGate', () => {
  const allCmds = [
    'node "<skill-dir>/bin/demo.js" compare tasks/stories/<fid>/ticket.md tasks/features/<fid>/plan.md',
    'node "<skill-dir>/bin/proof-check.js" tasks/features/<fid>/plan.md',
    'node "<skill-dir>/bin/observe-check.js" --demo tasks/features/<fid>/plan.md --plan tasks/features/<fid>/plan.md',
    'node "<skill-dir>/bin/source-lines.js" compare tasks/stories/<sid>/ticket.md tasks/features/<fid>/plan.md --story <sid>',
  ].join('\n');
  assert.ok(checksBeforeGate(`${allCmds}\nBefore I finalize this plan I need`), 'companion: the four commands before the gate are accepted');
  assert.ok(!checksBeforeGate(`Before I finalize this plan I need\n${allCmds}`), 'planted checks AFTER the gate must be rejected');
  assert.ok(!checksBeforeGate(`${allCmds.replace(/--story <sid>/, '')}\nBefore I finalize this plan I need`), 'planted source-lines check without --story must be rejected');
  assert.ok(!checksBeforeGate(allCmds.replace(/tasks\/features\/<fid>\/plan\.md/g, 'tasks/stories/<sid>/test-strategy.md') + `\n${GATE_MARK}`), 'planted checks on a per-story strategy file must be rejected');

  assert.ok(checksBeforeGate(PLAN_FEATURE), 'AC3: demo.js compare, proof-check.js, observe-check.js --plan and source-lines.js compare --story all run on tasks/features/<fid>/plan.md before "Before I finalize"');
});

// ── AC4: the gate lists every story's questions; nothing re-plans after approval ──────────────────

const gateText = (t) => { const i = t.indexOf(GATE_MARK); return i === -1 ? '' : flat(t.slice(i)); };
const listsEveryStory = (t) => /every (open )?question (of|for) every story/i.test(gateText(t));
const nothingReplans = (t) => /after approval nothing re-plans a story/i.test(flat(t)) && !/\brunner'?s planner (may|will|can|makes|plans)\b/i.test(flat(t));

test('FeaturePlan_GateListsEveryStorysQuestions_NothingReplans', () => {
  const planted = 'Before I finalize this plan I need the questions of the first story.\n\nAfter approval each runner\'s planner re-plans its story.';
  assert.ok(!listsEveryStory(planted), 'planted "first story only" gate must be rejected');
  assert.ok(!nothingReplans(planted), 'planted "runner\'s planner re-plans" must be rejected');
  assert.ok(listsEveryStory('Before I finalize this plan I need every open question of every story.'), 'companion: the real wording is accepted');

  assert.ok(listsEveryStory(PLAN_FEATURE), 'AC4: the gate lists every open question of every story');
  assert.ok(nothingReplans(PLAN_FEATURE), 'AC4: "After approval nothing re-plans a story", and no runner planner is left in Plan the Feature');
  assert.ok(!/Each story's task plan is made by its runner's planner/.test(flat(PLAN_FEATURE)), 'AC4: the per-story runner planner sentence is gone');
});

// ── AC5: no planner call after the gate ───────────────────────────────────────────────────────────

const PLANNER_NAME = 'implement-planner-agent';

test('FeaturePlan_NoPlannerAfterTheGate', () => {
  const afterGate = [
    section(SKILL, '### Before the first story'),
    section(SKILL, '### Run the stories'),
    section(SKILL, '### Stuck stories'),
    section(SKILL, '### Resume a Feature'),
    section(SKILL, '### The Feature panel'),
    section(SKILL, '### Prove it'),
    section(SKILL, '### The closing check'),
    section(SKILL, '### The PR gate'),
    section(SKILL, "### The Feature's PR"),
  ];
  assert.ok(afterGate.every(Boolean), 'companion: every Feature-mode section after the plan gate exists, from Before the first story to The Feature\'s PR');
  // F73 #83: the story steps moved to "## The story loop"; it is read too once it exists.
  const runText = [...afterGate, section(SKILL, '## The story loop') || ''].join('\n');
  assert.ok(/node "<skill-dir>\/bin\/worktree\.js" feature/.test(runText), 'companion: the slice really holds Run the stories');

  const others = ['story-builder.md', 'story-reviewer.md', 'suite-runner.md'].map((f) => read('agents', f));
  assert.ok(others.length === 3 && others.every((t) => t.length > 200), 'companion: the three agent files were read');

  // The agent by name, or "a runner's planner" in prose: either starts a plan after the gate.
  const plans = (t) => /implement-planner-agent|\bplanner\b/i.test(t);
  assert.ok(plans('Start the ' + PLANNER_NAME + ' for the story.'), 'planted planner call must be detected');
  assert.ok(plans("Once a runner's planner has saved its plan"), 'planted prose planner mention must be detected');
  assert.ok(!plans('Start the story-builder for the story.'), 'companion: text with no planner is accepted');
  const hits = [runText, ...others].filter(plans).length;
  assert.strictEqual(hits, 0, `AC5: no planner call after the plan gate (found in ${hits} of the Feature run text, story-builder, story-reviewer, suite-runner)`);
});

// ── the understand agent's Feature scope ──────────────────────────────────────────────────────────

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

// ── from #75's review: whole tickets stay out of the Sonnet session ───────────────────────────────

const TICKET_READS = [/get-issue\.sh/, /get-issue-children\.sh/, /get-blockers\.sh/, /writ(e|es|ing)[^.]*`?tasks\/stories\/<sid>\/ticket\.md`?|saves? [^.]*ticket\.md/i];

// Every sentence or bullet naming one of the ticket reads also names tracker-helper; each read is named somewhere.
function readsWithoutHelper(text) {
  const bad = [];
  const seen = TICKET_READS.map(() => 0);
  for (const s of sentences(text)) {
    TICKET_READS.forEach((re, i) => { if (re.test(s)) seen[i]++; });
    if (TICKET_READS.some((re) => re.test(s)) && !s.includes('tracker-helper')) bad.push(s.slice(0, 100));
  }
  return { bad, seen };
}

test('FeaturePlan_TicketReadsGoThroughTrackerHelper', () => {
  const planted = readsWithoutHelper('Run `get-issue.sh` for each child, and `get-blockers.sh` for its blockers.');
  assert.strictEqual(planted.bad.length, 1, 'planted main-session ticket read must be rejected');
  const opposite = readsWithoutHelper('Through `tracker-helper`: run `get-issue.sh` for each child.\n\nThen run `get-blockers.sh` yourself in this session.');
  assert.strictEqual(opposite.bad.length, 1, 'planted same-paragraph-different-sentence main-session read must be rejected, not excused by the helper named next door');
  assert.strictEqual(readsWithoutHelper('Through `tracker-helper`: run `get-issue.sh` for each child.').bad.length, 0, 'companion: a read through the helper is accepted');

  const { bad, seen } = readsWithoutHelper(PLAN_FEATURE);
  assert.deepStrictEqual(bad, [], `Feature mode: ticket reads must be run by tracker-helper, not the main session; these are not: ${bad.join(' // ')}`);
  seen.forEach((n, i) => assert.ok(n >= 1, `companion: Plan the Feature must name ticket read #${i + 1} (get-issue.sh, get-issue-children.sh, get-blockers.sh, writing each ticket.md)`));
});
