// Doc-consistency probe for "a model per job" (Feature 72, story 75). SKILL.md carries one table of
// the model every agent runs on; each agent file's `model:` must match the table's default row; every
// Agent call in the skill passes its model; Opus is only where judgement is. Nothing parses this
// prose, so drift does not throw; this probe pins it. Content predicates are tested twice: against
// planted text asserting the OPPOSITE (must be rejected, proving the check can fail) and against
// the real files (the enforcement).

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// What the agents' files say (their `model:` line, tracker-helper) is asserted in agents/__tests__/agent-text.test.js
// against the expected models below; what /debug and /coverage-audit say about their own Agent calls is asserted
// in their own __tests__. A test of /implement reads only /implement, rules/ and (through interfaceOf) Interfaces.
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const OWN = path.join(__dirname, '..');
// CRLF on a Windows checkout would break every pattern that spans a line end.
const read = (...p) => fs.readFileSync(path.join(OWN, ...p), 'utf8').replace(/\r\n/g, '\n');
const readRule = (name) => fs.readFileSync(path.join(REPO_ROOT, 'rules', name), 'utf8').replace(/\r\n/g, '\n');
const flat = (s) => s.replace(/\s+/g, ' ');
const { readRequired } = require('../bin/startup-check.js');

const SKILL = read('SKILL.md');
const TABLE_HEADING = '## Which model each job runs on';

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

const frontmatter = (t) => { const m = t.match(/^---\n([\s\S]*?)\n---/); return m ? m[1] : ''; };
const fileModel = (t) => { const m = frontmatter(t).match(/^model:\s*(\S+)\s*$/m); return m ? m[1] : null; };

// ── the table ─────────────────────────────────────────────────────────

const MODELS = ['opus', 'sonnet', 'haiku'];

// → { header: string[]|null, rows: {agent, job, model}[], bad: string[] }
function parseTable(text) {
  const out = { header: null, rows: [], bad: [] };
  for (const line of (text || '').split('\n')) {
    if (!line.trimStart().startsWith('|')) continue;
    const cells = line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
    if (cells.every((c) => /^:?-{3,}:?$/.test(c))) continue;
    if (!out.header) { out.header = cells; continue; }
    const m = cells[0] && cells[0].match(/^`([^`]+)`$/);
    if (cells.length !== 3 || !m || !MODELS.includes(cells[2])) { out.bad.push(line); continue; }
    out.rows.push({ agent: m[1], job: cells[1], model: cells[2] });
  }
  return out;
}

const headerOk = (t) => {
  const h = t.header;
  return !!h && h.length === 3 && h[0] === 'Agent' && h[1] === 'Job' && h[2] === 'Model';
};

const defaultRows = (rows) => {
  const m = new Map();
  for (const r of rows) if (!m.has(r.agent)) m.set(r.agent, r.model);
  return m;
};

const realTable = () => parseTable(section(SKILL, TABLE_HEADING));


// Opus only where judgement is: understanding and researching, the Feature plan, the security,
// architecture, acceptance and "made false" reviews, the coverage audit, and debugging.
const JUDGEMENT = new Set([
  'story-understand-agent', 'implement-planner-agent', 'Explore', 'security-reviewer-agent',
  'architect-reviewer-agent', 'acceptance-test-agent', 'evaluator-agent', 'coverage-auditor-agent',
  'debug-agent', 'prover',
]);
// F73 #83: the executor and the troubleshoot investigator are retired, so neither is listed.
const SONNET_ONLY = ['story-builder', 'suite-runner', 'story-reviewer', 'loosened-reviewer-agent', 'story-pr-agent'];

// The one exception: the two story agents may run on opus for the last two review rounds only, as a
// non-default row whose job says "rounds 4–5".
const ESCALATION_AGENTS = new Set(['story-builder', 'story-reviewer']);
const isEscalationRow = (r, rows) =>
  ESCALATION_AGENTS.has(r.agent) && /rounds 4–5/.test(r.job) && rows.findIndex((x) => x.agent === r.agent) !== rows.indexOf(r);
const opusOnlyWhereJudgementIs = (rows) =>
  rows.filter((r) => r.model === 'opus').every((r) => JUDGEMENT.has(r.agent) || isEscalationRow(r, rows));
const sonnetJobsStaySonnet = (rows) => {
  const d = defaultRows(rows);
  return SONNET_ONLY.every((a) => d.get(a) === 'sonnet') && d.get('tracker-helper') === 'haiku';
};

// A spawn is a sentence or bullet that names a table agent in backticks together with a spawn verb,
// and is not negated ("Do not spawn", "never start"). Each spawn must carry its own model: `<m>` in
// that same sentence or bullet, equal to one of that agent's rows, and one model clears one agent:
// two agents in one sentence need two. A mention with no spawn verb needs nothing. Table rows are
// not spawns (the Feature panel's rows are checked by their own test). Returns the offenders.
const SPAWN_VERB = /\b(spawn|spawns|spawned|spawning|launch|launches|launched|launching|start|starts|started|starting|run|runs|running)\b/i;
const NEGATED = /\b(do not|don't|never|must not|not)\s+(spawn|launch|start|run)\b/i;
function spawnUnits(text) {
  const units = [];
  for (const para of text.split(/\n[ \t]*\n/)) {
    let cur = [];
    const lines = para.split('\n');
    const flush = () => { if (cur.length) units.push(...flat(cur.join(' ')).trim().split(/(?<=[.!?])\s+(?=[A-Z*`([])/)); cur = []; };
    for (const line of lines) {
      if (/^\s*([-*]|\d+\.)\s/.test(line)) flush();
      if (/^\s*\|/.test(line)) { flush(); continue; }
      cur.push(line);
    }
    flush();
  }
  return units.filter(Boolean);
}
function callsWithoutModel(text, rows) {
  const names = [...new Set(rows.map((r) => r.agent))];
  const bad = [];
  for (const unit of spawnUnits(text)) {
    const named = names.filter((n) => unit.includes('`' + n + '`'));
    if (named.length === 0 || !SPAWN_VERB.test(unit) || NEGATED.test(unit)) continue;
    const given = [...unit.matchAll(/model: `(opus|sonnet|haiku)`/g)].map((m) => m[1]);
    let ok = given.length >= named.length;
    for (const n of named) {
      const i = given.findIndex((g) => rows.some((r) => r.agent === n && r.model === g));
      if (i === -1) { ok = false; break; }
      given.splice(i, 1);
    }
    if (!ok) bad.push(unit.slice(0, 120));
  }
  return bad;
}
const stripSection = (text, heading) => { const s = section(text, heading); return s ? text.replace(s, '') : text; };

// Every table agent sits in exactly one list: judgement (may be opus), sonnet-only, or haiku tracker-helper.
const classifiedExactlyOnce = (rows, judgement = JUDGEMENT, sonnetOnly = SONNET_ONLY) => {
  const agents = new Set(rows.map((r) => r.agent));
  const unclassified = [];
  for (const a of agents) {
    const n = (judgement.has(a) ? 1 : 0) + (sonnetOnly.includes(a) ? 1 : 0) + (a === 'tracker-helper' ? 1 : 0);
    if (n !== 1) unclassified.push(`${a} (${n} lists)`);
  }
  return unclassified;
};

// ── planted opposites ─────────────────────────────────────────────────

const PLANTED_TABLE = [
  '| Agent | Job | Model |',
  '|---|---|---|',
  '| `story-builder` | tests and code | opus |',
  '| `tracker-helper` | card moves | sonnet |',
  '| `story-understand-agent` | the ticket | sonnet |',
  '| story-pr-agent | docs | sonnet |',
].join('\n');
const PLANTED_WRONG_HEADER = '| Name | Task | LLM |\n|---|---|---|\n| `story-builder` | x | sonnet |';

// ── AC1 ───────────────────────────────────────────────────────────────

test('Model_SkillFrontmatterIsSonnet', () => {
  assert.strictEqual(fileModel('---\nname: x\nmodel: opus\n---\nbody'), 'opus', 'the reader must tell opus from sonnet');
  assert.strictEqual(fileModel('---\nname: x\n---\nmodel: sonnet\n'), null, 'a model line in the body is not frontmatter');
  assert.strictEqual(fileModel(SKILL), 'sonnet', 'AC1: skills/implement/SKILL.md frontmatter must carry `model: sonnet`');
});

// ── AC2 ───────────────────────────────────────────────────────────────

// The set is derived, never listed: every agent /implement requires, plus the agent each skill that
// /implement invokes spawns. A skill's own test (skills/<skill>/__tests__/agent-calls.probe.test.js) asserts
// which agent its SKILL.md spawns and that every call passes its model; the pair is written here.
const HANDED_OFF = { debug: 'debug-agent', 'coverage-audit': 'coverage-auditor-agent' };
function derivedAgents() {
  const names = new Set(readRequired().filter((r) => r.kind === 'agent').map((r) => r.name));
  for (const agent of Object.values(HANDED_OFF)) names.add(agent);
  return names;
}

test('Model_TableListsEveryAgentImplementStarts', () => {
  assert.ok(!headerOk(parseTable(PLANTED_WRONG_HEADER)), 'a table with another header must be rejected');
  assert.ok(parseTable(PLANTED_TABLE).bad.length > 0, 'a row with an agent name outside backticks must be rejected');

  const sec = section(SKILL, TABLE_HEADING);
  assert.ok(sec, `AC2: SKILL.md must have a "${TABLE_HEADING}" section`);
  const table = realTable();
  assert.ok(headerOk(table), 'AC2: the table header must be `| Agent | Job | Model |`');
  assert.deepStrictEqual(table.bad, [], `AC2: every row is | \`agent\` | job | opus/sonnet/haiku |; bad rows: ${table.bad.join(' // ')}`);
  assert.ok(table.rows.length >= 10, `the table must have at least 10 rows (got ${table.rows.length})`);

  const inTable = new Set(table.rows.map((r) => r.agent));
  const derived = derivedAgents();
  assert.ok(derived.size >= 10, `the derived agent set must have at least 10 members (got ${derived.size})`);
  const missing = [...derived].filter((a) => !inTable.has(a));
  assert.deepStrictEqual(missing, [], `AC2: the table must list every agent /implement starts; missing: ${missing.join(', ')}`);
  for (const a of ['Explore', 'tracker-helper', 'story-builder', 'suite-runner', 'story-reviewer']) {
    assert.ok(inTable.has(a), `AC2: the table must list ${a}`);
  }
});

test('Model_EveryAgentCallPassesItsModel', () => {
  const rows = parseTable(PLANTED_TABLE.replace('story-pr-agent', '`story-pr-agent`')).rows;
  assert.ok(callsWithoutModel('Spawn `story-builder` for the tests.', rows).length === 1, 'a spawn with no model must be rejected');
  assert.ok(callsWithoutModel('Spawn `story-builder` with `model: sonnet`.', rows).length === 1, 'a model that is not on the agent\'s row must be rejected');
  assert.ok(callsWithoutModel('Spawn `story-builder` with model: `opus`.', rows).length === 0, 'the model on the row passes');
  assert.ok(callsWithoutModel('`story-builder` is only named here.', rows).length === 0, 'a mention with no spawn verb needs no model');
  assert.ok(callsWithoutModel('Do not spawn `story-builder`.', rows).length === 0, 'a negated spawn needs no model');
  assert.ok(callsWithoutModel('Spawn `story-builder` and `tracker-helper` (model: `opus`).', rows).length === 1, 'one model must not clear two agents in one sentence');
  assert.ok(callsWithoutModel('Spawn `story-builder` (model: `opus`).\n\nThen launch `tracker-helper`.', rows).length === 1, 'a model in a neighbouring sentence must not clear a second agent');
  assert.ok(callsWithoutModel('- Spawn `story-builder` (model: `opus`)\n- Start `tracker-helper`', rows).length === 1, 'a model in a neighbouring bullet must not clear a second agent');
  assert.ok(callsWithoutModel('Spawn `story-builder` (model: `opus`) and `tracker-helper` (model: `sonnet`).', rows).length === 0, 'one model per agent passes');

  const table = realTable();
  assert.ok(table.rows.length > 0, 'the table must exist before calls can be checked against it');
  const outside = stripSection(stripSection(SKILL, TABLE_HEADING), '## Required tools');
  const named = table.rows.filter((r) => outside.includes('`' + r.agent + '`'));
  assert.ok(named.length >= 8, `companion: SKILL.md outside the table must name at least 8 table agents (got ${named.length})`);
  const spawns = spawnUnits(outside).filter((u) => SPAWN_VERB.test(u) && !NEGATED.test(u) && table.rows.some((r) => u.includes('`' + r.agent + '`')));
  assert.ok(spawns.length >= 8, `companion: SKILL.md must contain at least 8 spawns (got ${spawns.length})`);
  assert.ok(!SKILL.includes('not a spawn)'), 'no "not a spawn" marker: a mention without a spawn verb needs none');
  const bad = callsWithoutModel(outside, table.rows);
  assert.deepStrictEqual(bad, [], `AC2: every Agent call must pass its model explicitly; these sentences do not: ${bad.join(' // ')}`);
  // The other skills /implement hands off to spawn agents too: each one's own test checks its own SKILL.md,
  // against the model it expects for the agent. The table must say the same.
  for (const [skill, agent] of Object.entries(HANDED_OFF)) {
    assert.ok(table.rows.some((r) => r.agent === agent && r.model === 'opus'), `AC2: the table lists ${agent} (started by /${skill}) on opus`);
  }
});

// The Feature panel's table repeats each reviewer's model; each cell must equal that agent's row.
test('Model_FeaturePanelRowsMatchTheTable', () => {
  const panelBad = (panelText, rows) => {
    const bad = [];
    let count = 0;
    for (const line of panelText.split('\n')) {
      const m = line.match(/^\s*\|\s*`([^`]+)`(?:,\s*part\s*`([^`]+)`)?\s*\|\s*`?(opus|sonnet|haiku)`?\s*\|/);
      if (!m) continue;
      count++;
      const [, agent, part, model] = m;
      let mine = rows.filter((r) => r.agent === agent);
      if (part) mine = mine.filter((r) => r.job.includes(`${part} part`));
      if (mine.length !== 1 || mine[0].model !== model) bad.push(`${agent}${part ? ' ' + part : ''}: panel says ${model}, table says ${mine.map((r) => r.model).join('/') || 'nothing'}`);
    }
    return { bad, count };
  };
  const rows = parseTable(PLANTED_TABLE.replace('story-pr-agent', '`story-pr-agent`')).rows;
  assert.strictEqual(panelBad('| `story-builder` | `sonnet` | x |', rows).bad.length, 1, 'a panel cell that differs from the row must be rejected');
  assert.strictEqual(panelBad('| `story-builder` | `opus` | x |', rows).bad.length, 0);

  const sec = section(SKILL, '### The Feature panel');
  assert.ok(sec, 'SKILL.md must have a "### The Feature panel" section');
  assert.ok(/\|\s*Agent\s*\|\s*Model\s*\|\s*Also gets\s*\|/.test(sec), 'the panel table header is | Agent | Model | Also gets |');
  const { bad, count } = panelBad(sec, realTable().rows);
  assert.ok(count >= 6, `companion: the panel table must have 6 rows (got ${count})`);
  assert.deepStrictEqual(bad, [], `every panel row's Model must equal that agent's row; ${bad.join('; ')}`);
});

// ── AC3 / AC6 ─────────────────────────────────────────────────────────

test('Model_EachAgentFileMatchesItsDefaultRow', () => {
  const planted = defaultRows(parseTable(PLANTED_TABLE).rows);
  assert.strictEqual(planted.get('story-builder'), 'opus', 'the default is the first row');
  // A hand-written pin of the table's default rows. The agent files are pinned in agents/__tests__/agent-text.test.js;
  // the one comparison of file against table is scripts/__tests__/boundaries-models.test.js.
  const EXPECTED_MODELS = {
    'story-understand-agent': 'opus', 'implement-planner-agent': 'opus', Explore: 'opus', 'story-builder': 'sonnet',
    'suite-runner': 'sonnet', 'story-reviewer': 'sonnet', 'evaluator-agent': 'opus', 'acceptance-test-agent': 'opus',
    'architect-reviewer-agent': 'opus', 'security-reviewer-agent': 'opus', 'loosened-reviewer-agent': 'sonnet',
    prover: 'sonnet', 'coverage-auditor-agent': 'opus', 'debug-agent': 'opus', 'story-pr-agent': 'sonnet', 'tracker-helper': 'haiku',
  };
  assert.notStrictEqual(EXPECTED_MODELS['story-builder'], planted.get('story-builder'), 'a table that says opus for the sonnet builder must disagree with the expected model');

  const table = realTable();
  assert.ok(table.rows.length > 0, 'AC3: the table must exist');
  const defaults = defaultRows(table.rows);
  assert.deepStrictEqual(Object.fromEntries(defaults), EXPECTED_MODELS, 'AC3/AC6: the table\'s default rows must say the models the agent files carry');
  for (const a of ['story-understand-agent', 'implement-planner-agent']) {
    assert.strictEqual(defaults.get(a), 'opus', `AC3: the table says ${a} is opus`);
  }
});

test('Model_OpusOnlyWhereJudgementIs', () => {
  const planted = parseTable(PLANTED_TABLE).rows;
  assert.ok(!opusOnlyWhereJudgementIs(planted), 'planted "story-builder | opus" must be rejected');
  assert.ok(!sonnetJobsStaySonnet(planted), 'planted sonnet agents on opus and tracker-helper on sonnet must be rejected');

  const esc = (rowsText) => parseTable('| Agent | Job | Model |\n|---|---|---|\n' + rowsText).rows;
  assert.ok(opusOnlyWhereJudgementIs(esc('| `story-builder` | tests and code | sonnet |\n| `story-builder` | fix rounds 4–5 | opus |\n| `story-reviewer` | the reviews | sonnet |\n| `story-reviewer` | Re-review rounds 4–5 | opus |')), 'the two rounds 4–5 opus rows are allowed');
  assert.ok(!opusOnlyWhereJudgementIs(esc('| `story-builder` | tests and code | opus |\n| `story-builder` | fix rounds 4–5 | opus |')), 'an opus default row for story-builder must be rejected');
  assert.ok(!opusOnlyWhereJudgementIs(esc('| `story-builder` | tests and code | sonnet |\n| `story-builder` | fix rounds 1–3 | opus |')), 'an opus row whose job is not rounds 4–5 must be rejected');
  assert.ok(!opusOnlyWhereJudgementIs(esc('| `suite-runner` | a suite | sonnet |\n| `suite-runner` | rounds 4–5 | opus |')), 'the exception covers only the builder and the reviewer');

  const rows = realTable().rows;
  assert.ok(rows.length > 0, 'the table must exist');
  assert.ok(rows.some((r) => r.model === 'opus'), 'companion: the table must have opus rows');
  for (const a of ['story-builder', 'story-reviewer']) {
    const mine = rows.filter((r) => r.agent === a);
    assert.strictEqual(mine.length, 2, `${a} has a default row and one rounds 4–5 row`);
    assert.strictEqual(mine[0].model, 'sonnet', `${a}'s first row stays sonnet`);
    assert.ok(mine[1].model === 'opus' && /rounds 4–5/.test(mine[1].job), `${a}'s second row is opus for rounds 4–5`);
  }
  assert.ok(opusOnlyWhereJudgementIs(rows), `only judgement jobs run on opus; opus rows: ${rows.filter((r) => r.model === 'opus').map((r) => r.agent).join(', ')}`);
  assert.ok(classifiedExactlyOnce(parseTable(PLANTED_TABLE.replace('story-pr-agent', '`story-pr-agent`')).rows.concat([{ agent: 'brand-new-agent', job: 'x', model: 'opus' }])).includes('brand-new-agent (0 lists)'), 'an agent in no list must be reported');
  assert.deepStrictEqual(classifiedExactlyOnce([{ agent: 'story-builder', job: 'x', model: 'sonnet' }], new Set(['story-builder']), ['story-builder']), ['story-builder (2 lists)'], 'an agent in two lists must be reported');
  assert.deepStrictEqual(classifiedExactlyOnce(rows), [], 'every table agent is in exactly one of the judgement, sonnet-only or haiku lists');
  assert.ok(sonnetJobsStaySonnet(rows), 'builders, the test runner, reviewers, the loosened reviewer, and story-pr are sonnet; tracker-helper is haiku');
});

// ── AC4 ───────────────────────────────────────────────────────────────

// TrackerHelper_HaikuRunsGivenCommandsReportsReadBack reads tracker-helper's own file: it lives in
// agents/__tests__/agent-text.test.js. The table's tracker-helper row is checked with the rest above.

// every set-status.sh / create-issue.sh mention outside the Required-tools entry sits in a paragraph naming tracker-helper
function movesWithoutHelper(text, script = 'set-status\\.sh') {
  const bad = [];
  let count = 0;
  const re = new RegExp(script);
  for (const para of text.split(/\n[ \t]*\n/)) {
    const lines = para.split('\n').filter((l) => re.test(l) && !/^- tracker-script /.test(l));
    if (lines.length === 0) continue;
    count += lines.length;
    if (!para.includes('tracker-helper')) bad.push(flat(lines[0]).slice(0, 100));
  }
  return { bad, count };
}

test('Moves_GoThroughTrackerHelper', () => {
  const planted = movesWithoutHelper('Move the card with `bash trackers/active/set-status.sh 5 done`.\n\nOther text.');
  assert.strictEqual(planted.bad.length, 1, 'planted direct set-status call must be rejected');
  assert.strictEqual(movesWithoutHelper('Through `tracker-helper`: `bash trackers/active/set-status.sh 5 done`.').bad.length, 0);

  const { bad, count } = movesWithoutHelper(SKILL);
  assert.ok(count >= 3, `companion: SKILL.md must still name set-status.sh at least 3 times (got ${count})`);
  assert.deepStrictEqual(bad, [], `AC4: every set-status.sh move must go through tracker-helper; these do not: ${bad.join(' // ')}`);

  const plantedCreate = movesWithoutHelper('Register it: `bash trackers/active/create-issue.sh "t" "b" "deferred"`.', 'create-issue\\.sh');
  assert.strictEqual(plantedCreate.bad.length, 1, 'planted direct create-issue call must be rejected');
  const created = movesWithoutHelper(SKILL, 'create-issue\\.sh');
  assert.ok(created.count >= 4, `companion: SKILL.md must still name create-issue.sh at least 4 times (got ${created.count})`);
  assert.deepStrictEqual(created.bad, [], `AC4: every create-issue.sh call must go through tracker-helper; these do not: ${created.bad.join(' // ')}`);

  const failText = (t) => /\bfailed (status )?write never stops the run\b/i.test(flat(t)) && /\bor the helper itself fails\b/i.test(flat(t));
  assert.ok(!failText('A failed status write stops the run.'), 'planted "a failed write stops the run" must be rejected');
  assert.ok(failText(SKILL), 'AC4: SKILL.md must say a failed write never stops the run, whether the script or the helper itself fails');
});

// ── AC5 ───────────────────────────────────────────────────────────────

// BLOCKED that needs more reasoning → relaunched once on opus, told what the first attempt tried.
const retryOnOpus = (t) => {
  const sentences = flat(t).split(/(?<=[.!?])\s+/);
  return sentences.some((s) => {
    if (/\bnever\b[^.]*\bopus\b/i.test(s)) return false;
    const idx = ['BLOCKED', 'more reasoning', 'relaunch', 'once', 'opus', 'first attempt tried'].map((w) => s.toLowerCase().indexOf(w.toLowerCase()));
    return idx.every((i) => i !== -1) && idx.every((v, k) => k === 0 || v > idx[k - 1]);
  });
};
const OPPOSITE_RETRY = 'A BLOCKED job that needs more reasoning is never relaunched on opus; it is relaunched on sonnet, unchanged, until it passes.';

test('Retry_BlockedNeedingReasoningRelaunchesOnOpusOnce', () => {
  assert.ok(!retryOnOpus(OPPOSITE_RETRY), 'planted "never on opus, unchanged" must be rejected');
  assert.ok(!retryOnOpus('A BLOCKED job is relaunched.'), 'a bare relaunch must be rejected');

  const rule = readRule('agent-handoff.md');
  assert.ok(/more reasoning[^.\n]*relaunch[^.\n]*fresh[^.\n]*opus[^.\n]*told what the first attempt tried/i.test(flat(rule)), 'AC5: the rule says relaunch fresh on opus, told what the first attempt tried');
  assert.ok(retryOnOpus(SKILL), 'AC5: SKILL.md must say a BLOCKED job that needs more reasoning is relaunched once on opus, told what the first attempt tried');
  assert.ok(SKILL.includes('rules/agent-handoff.md'), 'AC5: and point at rules/agent-handoff.md');
});

// ── the plan gate and the one-turn limit of `model:` ─────────────────

// A skill's `model:` lasts for the rest of the current turn only (code.claude.com/docs/en/skills,
// frontmatter table), so the build after the person's reply would run on the session model. The
// Feature plan gate therefore tells the person to approve by re-running the skill.
const gateSaysResume = (t, idName = 'fid') => {
  const f = flat(t);
  return new RegExp('\\bapprove\\b[^.\\n]*\\bby running `/implement --resume <' + idName + '>`', 'i').test(f) && /`\/model sonnet`/.test(f) && /\b(one turn|next prompt|current turn)\b/i.test(f);
};

test('PlanGate_TellsThePersonToApproveByRunningImplementResume', () => {
  const opposite = 'To approve, just reply "approve"; never run `/implement --resume <fid>`, the model carries on by itself.';
  assert.ok(!gateSaysResume(opposite), 'planted "just reply approve" text must be rejected');
  assert.ok(!gateSaysResume('Approve by running `/implement --resume <fid>`.'), 'text without the fallback and the reason must be rejected');

  const sec = section(SKILL, '### Plan the Feature');
  assert.ok(sec, 'SKILL.md must have a "### Plan the Feature" section');
  assert.ok(gateSaysResume(sec),
    'the Feature plan gate must tell the person to approve by running `/implement --resume <fid>` (a skill\'s `model:` lasts one turn), with `/model sonnet` as the fallback');
});

// The single-story gate has no resume-as-approval: it only says how to keep the build on Sonnet.
const singleGateNote = (t) => { const f = flat(t); return /run `\/model sonnet` before you reply to approve/i.test(f) && /\b(one turn|next prompt|current turn)\b/i.test(f) && !/approve by running `\/implement --resume/i.test(f); };

test('PlanGate_SingleStoryTellsThePersonToRunModelSonnetBeforeApproving', () => {
  assert.ok(!singleGateNote('To approve, just reply "approve".'), 'planted "just reply approve" text must be rejected');
  assert.ok(!singleGateNote('Approve by running `/implement --resume <id>`; `/model sonnet` lasts one turn.'), 'planted resume-as-approval wording must be rejected');
  const sec = section(SKILL, '### The plan gate');
  assert.ok(sec, 'SKILL.md must have a "### The plan gate" section');
  assert.ok(singleGateNote(sec), 'the single-story plan gate must tell the person to run `/model sonnet` before replying to approve (a skill\'s `model:` lasts one turn) and must not tell them to approve by --resume');
});

// A resume of a Feature whose plan gate was shown and not approved is the approval; one whose gate was
// never shown approves nothing. A single story has no such branch.
test('Resume_OfAnUnapprovedFeaturePlanIsTheApproval', () => {
  const featureOk = (t) => { const f = flat(t); return /`plan-approved: no`/.test(f) && /`phase:\s*planning`/.test(f) && /`gate-shown: yes`/.test(f) && /\bresume\b[^.]*\bis the approval\b/i.test(f) && /`plan-approved=yes phase=coding`/.test(f) && /\bcarry on with \*\*Run the stories\*\*/.test(f) && /`show-gate:`/.test(f); };
  assert.ok(!featureOk('A resume carries on with Run the stories.'), 'planted text without the approval branch must be rejected');
  assert.ok(!featureOk('When plan-approved: no in phase: planning, that resume is the approval, whether or not the gate was shown.'), 'planted approval without the gate-shown condition must be rejected');
  assert.ok(featureOk(section(SKILL, '### Resume a Feature')), 'Resume a Feature must approve only a shown gate, and show the gate again otherwise');
  assert.ok(/gate-shown=yes/.test(flat(section(SKILL, '### Plan the Feature'))), 'Plan the Feature must record gate-shown=yes when the gate is printed');
  const script = read('bin', 'feature-state.js');
  assert.ok(/gate-shown'\] === 'yes'/.test(script) && script.includes("out('approve:") && script.includes("out('show-gate:"), 'feature-state.js resume prints approve only after a shown gate, else show-gate');
});

test('Resume_OfASingleStoryIsNotTheApproval', () => {
  const approves = (t) => /\bthe resume is the approval\b/i.test(flat(t));
  assert.ok(approves('Any other run: the resume is the approval.'), 'the planted opposite must be detected');
  assert.ok(!approves(section(SKILL, '## Resume mode')), 'Resume mode must not treat a resume as the approval of a single-story plan');
});

test('Model_EvidenceForTheOneTurnLimitIsRecorded', () => {
  const sec = flat(section(SKILL, TABLE_HEADING) || '');
  assert.ok(!/isn't saved to settings/.test('nothing here'), 'planted text without the quote must be rejected');
  assert.ok(sec.includes("The override applies for the rest of the current turn and isn't saved to settings"), 'the model section must quote the Claude Code docs on the one-turn limit');
  assert.ok(/Claude Code \d+\.\d+\.\d+/.test(sec), 'and name the Claude Code version it was checked against');
});
