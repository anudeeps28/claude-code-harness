// Doc-consistency probe: every Agent call in /debug's own SKILL.md passes its model (F72 story 75, "a model
// per job"). Moved here from /implement's model-per-job probe: a test of /implement may not read another
// skill's SKILL.md (rules/modules.md, "Tests check the interface"). The agent it starts and its model are
// written out below as the table /implement keeps (`## Which model each job runs on`), and /implement's
// own probe asserts that table says the same, so the two cannot drift apart unseen.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const skill = 'debug';
// The agent this skill starts, and its model in /implement's table.
const ROWS = [{ agent: 'debug-agent', job: 'handed off by /debug', model: 'opus' }];
// CRLF on a Windows checkout would break every pattern that spans a line end.
const SKILL_TEXT = fs.readFileSync(path.join(__dirname, '..', 'SKILL.md'), 'utf8').replace(/\r\n/g, '\n');
const flat = (s) => s.replace(/\s+/g, ' ');

// A spawn is a sentence or bullet that names a table agent in backticks together with a spawn verb,
// and is not negated ("Do not spawn", "never start"). Each spawn must carry its own model: `<m>` in
// that same sentence or bullet, equal to one of that agent's rows, and one model clears one agent.
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

test('Model_EveryAgentCallPassesItsModel', () => {
  assert.ok(callsWithoutModel('Spawn `debug-agent` for the work.', ROWS).length === 1, 'a spawn with no model must be rejected');
  assert.ok(callsWithoutModel('Spawn `debug-agent` with `model: sonnet`.', ROWS).length === 1, 'a model that is not on the agent\'s row must be rejected');
  assert.ok(callsWithoutModel('Spawn `debug-agent` with model: `opus`.', ROWS).length === 0, 'the model on the row passes');

  const t = SKILL_TEXT;
  const spawned = [...t.matchAll(/Spawn a \*\*`([a-z0-9-]+)`\*\*/g)].map((m) => m[1]);
  assert.deepStrictEqual(spawned, ROWS.map((r) => r.agent), 'the agents this skill spawns by name are the ones /implement\'s table lists for it');
  assert.ok(spawnUnits(t).some((u) => SPAWN_VERB.test(u) && ROWS.some((r) => u.includes('`' + r.agent + '`'))), `companion: skills/${skill}/SKILL.md must spawn a table agent`);
  const b = callsWithoutModel(t, ROWS);
  assert.deepStrictEqual(b, [], `AC2: every Agent call in skills/${skill}/SKILL.md must pass its model; these do not: ${b.join(' // ')}`);
});
