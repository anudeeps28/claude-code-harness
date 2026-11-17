'use strict';
// One comparison of each agent file's `model:` with the default row of /implement's "Which model each job runs
// on" table. The agents' own test and /implement's probe each pin the models by hand (neither may read the
// other module's body); this boundary test, which may read bodies (rules/modules.md, "Tests check the
// interface"), is the only place where a file and the table meet, so it is the one that sees them drift apart.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { repoRoot, inFixture } = require('./helpers.js');

const TABLE_HEADING = '## Which model each job runs on';
// Built into Claude Code: the table has a row for it and there is no agent file.
const BUILT_IN = new Set(['Explore']);

const modelOf = (text) => {
  const front = /^---\n([\s\S]*?)\n---/.exec(text.replace(/\r\n/g, '\n'));
  const m = front && /^model:\s*(\S+)\s*$/m.exec(front[1]);
  return m ? m[1] : null;
};

// agent -> model of its first (default) row in the table.
function defaultRows(skillText) {
  const lines = skillText.replace(/\r\n/g, '\n').split('\n');
  const start = lines.findIndex((l) => l.startsWith(TABLE_HEADING));
  const rows = new Map();
  if (start === -1) return rows;
  for (const line of lines.slice(start + 1)) {
    if (/^#{1,2} /.test(line)) break;
    const m = /^\|\s*`([^`]+)`\s*\|[^|]*\|\s*(opus|sonnet|haiku)\s*\|\s*$/.exec(line);
    if (m && !rows.has(m[1])) rows.set(m[1], m[2]);
  }
  return rows;
}

// One line per disagreement between the table's default rows and the agent files under `root`.
function modelDrift(root) {
  const skill = path.join(root, 'skills', 'implement', 'SKILL.md');
  const rows = fs.existsSync(skill) ? defaultRows(fs.readFileSync(skill, 'utf8')) : new Map();
  const drift = [];
  if (rows.size === 0) drift.push('skills/implement/SKILL.md: no default rows under the model table');
  for (const [agent, model] of rows) {
    const file = path.join(root, 'agents', `${agent}.md`);
    if (!fs.existsSync(file)) {
      if (!BUILT_IN.has(agent)) drift.push(`${agent}: the table has a row, agents/${agent}.md is missing`);
      continue;
    }
    const mine = modelOf(fs.readFileSync(file, 'utf8'));
    if (mine !== model) drift.push(`${agent}: the table says ${model}, agents/${agent}.md says ${mine}`);
  }
  return drift;
}

const skillWith = (rows) => `# S\n\n${TABLE_HEADING}\n\n| Agent | Job | Model |\n|---|---|---|\n${rows}\n\n## Next\n`;
const agentWith = (model) => `---\nname: x\nmodel: ${model}\n---\nbody\n`;

test('Model_AgentFilesAgreeWithTheTableDefaultRows (single comparison)', () => {
  const drift = modelDrift(repoRoot);
  assert.deepEqual(drift, [], `an agent file and its default row in /implement's model table differ: ${drift.join('; ')}`);
  // Companion: the comparison saw the table, the debug and audit agents included.
  const rows = defaultRows(fs.readFileSync(path.join(repoRoot, 'skills', 'implement', 'SKILL.md'), 'utf8'));
  assert.ok(rows.size >= 14, `companion: the table must have 14 or more agents (got ${rows.size})`);
  for (const a of ['debug-agent', 'coverage-auditor-agent', 'story-builder']) assert.ok(rows.has(a), `the table has no row for ${a}`);
});

test('Model_TheComparisonCanFail: a file that disagrees with its row is reported', () => {
  const rows = '| `story-builder` | code | sonnet |\n| `story-builder` | fix rounds 4–5 | opus |\n| `Explore` | research | opus |';
  const same = { 'skills/implement/SKILL.md': skillWith(rows), 'agents/story-builder.md': agentWith('sonnet') };
  assert.deepEqual(inFixture(same, modelDrift), []);
  const planted = { ...same, 'agents/story-builder.md': agentWith('opus') };
  assert.deepEqual(inFixture(planted, modelDrift), ['story-builder: the table says sonnet, agents/story-builder.md says opus']);
  const missing = { 'skills/implement/SKILL.md': skillWith(rows) };
  assert.deepEqual(inFixture(missing, modelDrift), ['story-builder: the table has a row, agents/story-builder.md is missing']);
});
