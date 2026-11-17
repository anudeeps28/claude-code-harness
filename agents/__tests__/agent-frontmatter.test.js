'use strict';

// Every agent file's frontmatter must parse as YAML, or Claude Code drops the agent silently:
// it is missing from the session's agent list and spawning it fails with "Agent type not found".
// tracker-helper and implement-planner-agent were lost this way (an unquoted ": " in their
// description), which stopped every /implement <feature> run before planning.
//
// Zero-dep check of the one shape the agents use: one `key: value` per line. An unquoted value
// must not hold ": " (a nested mapping, a parse error) or " #" (a comment, which cuts it short).

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const agentsDir = path.join(__dirname, '..');
const files = fs.readdirSync(agentsDir).filter((f) => f.endsWith('.md'));

function frontmatter(text) {
  const lines = text.replace(/\r/g, '').split('\n');
  if (lines[0] !== '---') return null;
  const end = lines.indexOf('---', 1);
  return end === -1 ? null : lines.slice(1, end);
}

// Returns why a value would not parse as one plain YAML string, or null when it is fine.
function valueProblem(value) {
  const v = value.trim();
  if (v.startsWith("'")) return /^'(?:[^']|'')*'$/.test(v) ? null : 'unbalanced single quotes';
  if (v.startsWith('"')) return /^"(?:[^"\\]|\\.)*"$/.test(v) ? null : 'unbalanced double quotes';
  if (v.includes(': ')) return 'unquoted ": " (YAML reads a nested mapping and the file fails to parse)';
  if (v.includes(' #')) return 'unquoted " #" (YAML starts a comment and cuts the value short)';
  return null;
}

test('there are agent files to check', () => {
  assert.ok(files.length > 10, `expected agent files in ${agentsDir}`);
});

for (const file of files) {
  test(`agents/${file}: frontmatter parses, with name and description`, () => {
    const fm = frontmatter(fs.readFileSync(path.join(agentsDir, file), 'utf8'));
    assert.ok(fm, 'no frontmatter between --- lines');
    const keys = {};
    for (const line of fm) {
      if (line.trim() === '') continue;
      const m = /^([A-Za-z][\w-]*):(?: (.*))?$/.exec(line);
      assert.ok(m, `not a "key: value" line: ${line.slice(0, 80)}`);
      const problem = valueProblem(m[2] || '');
      assert.strictEqual(problem, null, `${m[1]}: ${problem}`);
      keys[m[1]] = m[2] || '';
    }
    for (const k of ['name', 'description']) assert.ok(keys[k], `missing ${k}`);
    assert.strictEqual(keys.name, path.basename(file, '.md'), 'name differs from the file name');
  });
}

test('valueProblem catches the shapes that dropped two agents, and passes their fixes', () => {
  assert.match(valueProblem('Runs jobs on any tracker: moving a card'), /": "/);
  assert.match(valueProblem('one Story #<id> section'), /" #"/);
  assert.strictEqual(valueProblem('Runs jobs on any tracker - moving a card'), null);
  assert.strictEqual(valueProblem(`'writes the plan: one "## Story #<id>" section'`), null);
});
