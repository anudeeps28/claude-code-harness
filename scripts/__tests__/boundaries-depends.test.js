'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { repoRoot, inFixture, EXEMPT_SKILLS } = require('./helpers.js');
const boundaries = require('../lib/boundaries.js');
const { dependencies } = require('../lib/depends.js');

// ── Check 6 of rules/modules.md "The boundary check": the map's Depends on matches the real dependencies ──

const MAP_COLUMNS = ['Module', 'Kind', 'Owns', 'Private agents', 'Depends on', 'Interface'];
const BLOCK = '## Interface\n\n**Inputs:** x\n';
const row = (module, kind, priv, deps, link) => `| ${module} | ${kind} | owns x | ${priv} | ${deps} | ${link} |`;
const mapText = (rows) =>
  `# CONTEXT.md\n\nintro\n\n## Architecture map\n\n| ${MAP_COLUMNS.join(' | ')} |\n|---|---|---|---|---|---|\n${rows.join('\n')}\n\n## Domain glossary\n\n| Term | Definition |\n|---|---|\n| a | b |\n`;
const skillMd = (name, body = '') => `---\nname: ${name}\ndescription: d\n---\n${BLOCK}\n${body}`;
const readme = (name) => `# ${name}\n\npurpose\n\n${BLOCK}`;

// /implement points at a trackers script that trackers/README.md lists.
const trackersFiles = (cell, extraRows = []) => ({
  'skills/implement/SKILL.md': skillMd('implement', 'Create it with `trackers/active/get-issue.sh`.\n'),
  'trackers/README.md': `# trackers\n\npurpose\n\n## Interface\n\n**Inputs:** x\n**Callable parts:** \`trackers/active/get-issue.sh\`\n`,
  'trackers/active/get-issue.sh': '#!/bin/sh\n',
  'hooks/README.md': readme('hooks'),
  'CONTEXT.md': mapText([
    row('`/implement`', 'skill', '—', cell, 'skills/implement/SKILL.md#interface'),
    row('trackers', 'code module', '—', '—', 'trackers/README.md#interface'),
    row('hooks', 'code module', '—', '—', 'hooks/README.md#interface'),
    ...extraRows,
  ]),
});

test('check 6 — CONTEXT.md Depends on matches the real dependencies (AC1, AC3, AC4, AC6)', () => {
  assert.deepEqual(boundaries.checkDependsOn(repoRoot, { exempt: EXEMPT_SKILLS }), []);
  // Companion: the repo's map has rows to compare, and a computed graph with edges in it.
  const map = boundaries.readArchitectureMap(fs.readFileSync(path.join(repoRoot, 'CONTEXT.md'), 'utf8'));
  assert.ok(map.rows.length > 0, 'the map has rows');
  const graph = dependencies(repoRoot);
  assert.ok(graph.size > 0 && [...graph.values()].some((s) => s.size > 0), 'the computed graph has edges');
});

test('check 6 names a missing dependency (AC2)', () => {
  inFixture(trackersFiles('—'), (root) => {
    const problems = boundaries.checkDependsOn(root, { exempt: [] });
    assert.ok(problems.some((p) => p.includes('CONTEXT.md') && p.includes('/implement') && p.includes('missing trackers')), problems.join('\n'));
    assert.ok(!problems.some((p) => p.includes('hooks')), 'a correct row is not reported: ' + problems.join('\n'));
  });
  inFixture(trackersFiles('`trackers`'), (root) => {
    assert.deepEqual(boundaries.checkDependsOn(root, { exempt: [] }), []);
  });
});

test('check 6 names a dependency the map lists but the code does not have (AC1, AC2)', () => {
  inFixture(trackersFiles('`trackers`, `hooks`'), (root) => {
    const problems = boundaries.checkDependsOn(root, { exempt: [] });
    assert.ok(problems.some((p) => p.includes('/implement') && p.includes('hooks') && !p.includes('missing')), problems.join('\n'));
    assert.ok(!problems.some((p) => p.includes('missing')), 'nothing is missing: ' + problems.join('\n'));
  });
});

test('check 6 compares a module the computed graph has no edges for as an empty set (AC6)', () => {
  // hooks has no edges at all; a cell naming trackers is extra, not skipped.
  const files = trackersFiles('`trackers`');
  files['CONTEXT.md'] = files['CONTEXT.md'].replace('| hooks | code module | owns x | — | — |', '| hooks | code module | owns x | — | `trackers` |');
  inFixture(files, (root) => {
    const problems = boundaries.checkDependsOn(root, { exempt: [] });
    assert.ok(problems.some((p) => p.includes('hooks') && p.includes('trackers')), problems.join('\n'));
  });
});

test('check 6 counts imports, pointers, agent use and skill invocation (AC1)', () => {
  const files = {
    'skills/s/SKILL.md': skillMd('s', 'Use `trackers/active/get-issue.sh` to read it.\nThen run `/other` next.\nLaunch `ag` to review.\n'),
    'skills/s/bin/x.js': "require('../../../hooks/lib/a.js');\n",
    'skills/other/SKILL.md': skillMd('other'),
    'agents/ag.md': '---\nname: ag\ndescription: d\nowner: shared\n---\n' + BLOCK,
    'hooks/README.md': `# hooks\n\npurpose\n\n## Interface\n\n**Inputs:** x\n**Callable parts:** \`lib/a.js\`\n`,
    'hooks/lib/a.js': 'module.exports = {};\n',
    'trackers/README.md': `# trackers\n\npurpose\n\n## Interface\n\n**Callable parts:** \`trackers/active/get-issue.sh\`\n`,
    'trackers/active/get-issue.sh': '#!/bin/sh\n',
  };
  inFixture(files, (root) => {
    const got = dependencies(root).get('/s');
    assert.ok(got, 'the graph has an entry for /s');
    assert.deepEqual([...got].sort(), ['/other', 'ag', 'hooks', 'trackers']);
  });
});

test("check 6 rolls an owned agent's edges up to its skill and never counts rules/ (AC5)", () => {
  const files = {
    'skills/s/SKILL.md': skillMd('s', 'Plain text.\n'),
    'agents/a.md': '---\nname: a\ndescription: d\nowner: s\n---\n' + BLOCK + '\nSee hooks/README.md and rules/r.md.\n',
    'rules/r.md': '# r\n',
    'hooks/README.md': readme('hooks'),
  };
  inFixture(files, (root) => {
    const graph = dependencies(root);
    assert.deepEqual([...(graph.get('/s') || [])], ['hooks']);
    assert.ok(!graph.has('a'), 'an owned agent has no row of its own');
    assert.ok(![...graph.values()].some((s) => s.has('rules') || s.has('a')), 'rules/ and the owned agent are never a dependency');
  });
});

const TRACKERS_README = '# trackers\n\npurpose\n\n## Interface\n\n**Inputs:** x\n**Callable parts:** `trackers/active/get-issue.sh`\n';
const skillEdges = (body, extra = {}) => {
  let got;
  inFixture({
    'skills/s/SKILL.md': skillMd('s', body),
    'skills/x/SKILL.md': skillMd('x'),
    'trackers/README.md': TRACKERS_README,
    'trackers/lib/render-todo.sh': '#!/bin/sh\n',
    'hooks/README.md': readme('hooks'),
    ...extra,
  }, (root) => { got = [...dependencies(root).get('/s')].sort(); });
  return got;
};

test('check 6 joins the literal arguments of path.join and path.resolve into a path (finding 1)', () => {
  const files = {
    'hooks/README.md': readme('hooks'),
    'hooks/a.js': "const p = path.join(projectRoot, '.claude', 'trackers', 'active', 'list-issues.sh');\n",
    'hooks/b.js': "const p = path.join(__dirname, '..', 'trackers', 'lib', 'render-todo.sh');\n",
    'hooks/c.js': "const p = path.join(__dirname, 'lib', 'not-a-module.sh');\n",
    'trackers/README.md': TRACKERS_README,
    'trackers/lib/render-todo.sh': '#!/bin/sh\n',
  };
  inFixture(files, (root) => {
    assert.deepEqual([...dependencies(root).get('hooks')], ['trackers']);
  });
  for (const only of ['hooks/a.js', 'hooks/b.js', 'hooks/c.js']) {
    const one = { ...files };
    for (const k of ['hooks/a.js', 'hooks/b.js', 'hooks/c.js']) if (k !== only) delete one[k];
    inFixture(one, (root) => {
      const got = [...dependencies(root).get('hooks')];
      assert.deepEqual(got, only === 'hooks/c.js' ? [] : ['trackers'], only);
    });
  }
});

test('check 6 counts a pointer into a code module\'s adapter folder, with a placeholder or ending in the folder (finding 2)', () => {
  assert.deepEqual(skillEdges('Run `bash trackers/active/<script>.sh` for it.\n'), ['trackers']);
  assert.deepEqual(skillEdges('Go through the `trackers/active/` scripts.\n'), ['trackers']);
  // A path into someone else's project, and a bare folder name in code, name no script of the module.
  assert.deepEqual(skillEdges('It reads `<target>/trackers/active/` to detect the adapter.\n'), []);
  const hooksEdges = (code) => {
    let got;
    inFixture({ 'hooks/README.md': readme('hooks'), 'hooks/x.js': code, 'trackers/README.md': TRACKERS_README }, (root) => { got = [...dependencies(root).get('hooks')]; });
    return got;
  };
  assert.deepEqual(hooksEdges("link('trackers/active', `trackers/${t}`);\n"), []);
  assert.deepEqual(hooksEdges("run('trackers/active/get-issue.sh');\n"), ['trackers']);
});

test('check 6 counts only a verb that starts a skill, not a caller or advice (finding 3)', () => {
  assert.deepEqual(skillEdges('Run `/x 1` to verify.\n'), ['/x']);
  assert.deepEqual(skillEdges('Then launch `/x` here.\n'), ['/x']);
  // These two name a caller with no listed verb: they pass with or without the by/from rule.
  assert.deepEqual(skillEdges('If called from another skill (`/x`), report back.\n'), []);
  assert.deepEqual(skillEdges('**Called by:** `/x` (a story).\n'), []);
  // These bite: a listed verb followed by by or from names the caller.
  assert.deepEqual(skillEdges('| agent | started by `/x` |\n'), []);
  assert.deepEqual(skillEdges('The skill that was run from `/x` reports back.\n'), []);
  assert.deepEqual(skillEdges('If you are starting from scratch, run `/x` first.\n'), []);
});

test('check 6 ignores a negated verb (round 3)', () => {
  assert.deepEqual(skillEdges('It never starts `/x` itself.\n'), []);
  assert.deepEqual(skillEdges('It does not run `/x`.\n'), []);
  assert.deepEqual(skillEdges('It never auto-saves a plan. It never starts implementing. It offers `/x` instead.\n'), []);
  assert.deepEqual(skillEdges('It starts `/x` after the plan.\n'), ['/x']);
});

test('check 6 counts a <name-skill-dir> pointer as a dependency on that skill (round 3)', () => {
  const bin = { 'skills/x/bin/y.js': 'module.exports = {};\n' };
  assert.deepEqual(skillEdges('```bash\nnode "<x-skill-dir>/bin/y.js" audit\n```\n', bin), ['/x']);
  assert.deepEqual(skillEdges('Reads `<skill-dir>/bin/y.js` of its own.\n', { 'skills/s/bin/y.js': '' }), []);
  assert.deepEqual(skillEdges('Reads `<x-skill-dir>/bin/missing.js`.\n', bin), []);
});

test('check 6 ignores the RENAMED and RETIRED migration tables of a JS file (finding 3)', () => {
  const table = (name) => ({
    'skills/s/SKILL.md': skillMd('s'),
    'skills/x/SKILL.md': skillMd('x'),
    'skills/x/bin/run.sh': '#!/bin/sh\n',
    'hooks/README.md': readme('hooks'),
    'hooks/m.js': `const ${name} = [\n  ['skills/x/old.sh', 'skills/x/bin/run.sh'],\n];\n`,
  });
  for (const name of ['RENAMED', 'RETIRED_FILES']) {
    inFixture(table(name), (root) => assert.deepEqual([...dependencies(root).get('hooks')], [], name));
  }
  inFixture(table('MOVES'), (root) => assert.deepEqual([...dependencies(root).get('hooks')], ['/x']));
});

test('check 6 — the map\'s text names the Depends on check (AC8)', () => {
  const lines = fs.readFileSync(path.join(repoRoot, 'CONTEXT.md'), 'utf8').split('\n');
  const how = lines.find((l) => l.startsWith('**How to maintain:**'));
  assert.ok(how, 'the How to maintain line exists');
  assert.ok(!/not yet in place/.test(how), 'line 5 no longer says the check is not yet in place');
  assert.ok(how.includes('boundaries-depends.test.js'), 'line 5 names boundaries-depends.test.js');
  // The definition line says what the check counts, including a skill invocation.
  const def = lines.find((l) => /\*\*Depends on\*\*|Depends on/.test(l) && /import/.test(l) && /pointer/i.test(l));
  assert.ok(def, 'a line defines the dependencies the check counts');
  assert.ok(/invocation|invok/i.test(def), 'the definition counts a skill invocation');
});
