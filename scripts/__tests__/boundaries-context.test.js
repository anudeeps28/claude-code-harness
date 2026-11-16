'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { repoRoot, inFixture, EXPECTED_OWNERS, EXEMPT_SKILLS } = require('./helpers.js');
const { CODE_MODULES, agentOwners, readArchitectureMap, checkContextMap } = require('../lib/boundaries.js');
const { bare, linkTarget, cellNames } = require('../lib/context.js');

// ── The architecture map in CONTEXT.md (rules/modules.md, "The architecture map") ──────────────────

const MAP_COLUMNS = ['Module', 'Kind', 'Owns', 'Private agents', 'Depends on', 'Interface'];
const CODE_MODULE_NAMES = ['hooks', 'trackers', 'code-platform', 'install', 'scripts'];

const mapRow = (module, kind, priv, link) => `| ${module} | ${kind} | owns x | ${priv} | none | ${link} |`;
const mapText = (rows, first = '## Architecture map') =>
  `# CONTEXT.md\n\nintro\n\n${first}\n\n| ${MAP_COLUMNS.join(' | ')} |\n|---|---|---|---|---|---|\n${rows.join('\n')}\n\n## Domain glossary\n\n| Term | Definition |\n|---|---|\n| a | b |\n`;
const BLOCK = '## Interface\n\n**Inputs:** x\n';

// A repo with one skill (implement), one owned agent (prover), one shared agent (x) and the five code modules.
function contextRepo(overrides = {}) {
  const files = {
    'skills/implement/SKILL.md': `---\nname: implement\ndescription: d\n---\n${BLOCK}`,
    'agents/prover.md': `---\nname: prover\ndescription: d\nowner: implement\n---\n${BLOCK}`,
    'agents/x.md': `---\nname: x\ndescription: d\nowner: shared\n---\n${BLOCK}`,
  };
  for (const m of CODE_MODULE_NAMES) files[`${m}/README.md`] = `# ${m}\n\npurpose\n\n${BLOCK}`;
  return { ...files, ...overrides };
}
const goodRows = () => [
  mapRow('`/implement`', 'skill', '`prover`', 'skills/implement/SKILL.md#interface'),
  mapRow('x', 'agent (shared)', '—', 'agents/x.md#interface'),
  ...CODE_MODULE_NAMES.map((m) => mapRow(m, 'code module', '—', `${m}/README.md#interface`)),
];

test('readArchitectureMap returns the first ## heading, the header cells and one object per row (AC2)', () => {
  const map = readArchitectureMap(mapText(goodRows()));
  assert.equal(map.heading, 'Architecture map');
  assert.deepEqual(map.header, MAP_COLUMNS);
  assert.equal(map.rows.length, 2 + CODE_MODULE_NAMES.length);
  const impl = map.rows.find((r) => bare(r.Module) === '/implement');
  assert.ok(impl, 'the /implement row was parsed');
  assert.equal(bare(impl['Private agents']), 'prover');
  assert.equal(linkTarget(impl.Interface), 'skills/implement/SKILL.md#interface');
});

test('"opens with" is the first ## heading, not any heading: a map that comes second is not the first section (AC2)', () => {
  const late = `# C\n\n## Domain glossary\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n## Architecture map\n\n| ${MAP_COLUMNS.join(' | ')} |\n|---|---|---|---|---|---|\n`;
  assert.equal(readArchitectureMap(late).heading, 'Domain glossary');
  assert.equal(readArchitectureMap(mapText(goodRows(), '## Module map')).heading, 'Module map');
});

test('map check passes a complete map, and names the module for each kind of fault (AC1)', () => {
  inFixture({ ...contextRepo(), 'CONTEXT.md': mapText(goodRows()) }, (root) => {
    assert.deepEqual(checkContextMap(root, { exempt: [] }), []);
  });
  // hooks has no row; prover (an owned agent) has a row of its own and is missing from implement's cell;
  // agents/x.md exists but has no Interface block.
  const rows = [
    mapRow('`/implement`', 'skill', '—', 'skills/implement/SKILL.md#interface'),
    mapRow('prover', 'agent', '—', 'agents/prover.md#interface'),
    mapRow('x', 'agent (shared)', '—', 'agents/x.md#interface'),
    ...CODE_MODULE_NAMES.filter((m) => m !== 'hooks').map((m) => mapRow(m, 'code module', '—', `${m}/README.md#interface`)),
  ];
  inFixture({ ...contextRepo({ 'agents/x.md': '---\nname: x\ndescription: d\nowner: shared\n---\nbody only\n' }), 'CONTEXT.md': mapText(rows) }, (root) => {
    const problems = checkContextMap(root, { exempt: [] });
    assert.ok(problems.some((p) => p.includes('hooks')), problems.join('\n'));
    assert.ok(problems.some((p) => p.includes('prover') && /row/i.test(p)), problems.join('\n'));
    assert.ok(problems.some((p) => p.includes('prover') && p.includes('implement')), problems.join('\n'));
    assert.ok(problems.some((p) => p.includes('agents/x.md') && p.includes('## Interface')), problems.join('\n'));
    assert.ok(!problems.some((p) => p.includes('trackers')), 'a module with a good row is not reported: ' + problems.join('\n'));
  });
});

test('map check: two rows for one module, a missing CONTEXT.md and a link to a missing file are each reported (AC1)', () => {
  inFixture({ ...contextRepo(), 'CONTEXT.md': mapText([...goodRows(), mapRow('hooks', 'code module', '—', 'hooks/README.md#interface')]) }, (root) => {
    const problems = checkContextMap(root, { exempt: [] });
    assert.ok(problems.some((p) => p.includes('hooks') && /more than one|twice|duplicate|2/i.test(p)), problems.join('\n'));
  });
  inFixture(contextRepo(), (root) => {
    assert.ok(checkContextMap(root, { exempt: [] }).some((p) => p.includes('CONTEXT.md')), 'no CONTEXT.md is a problem');
  });
  const rows = goodRows().map((r) => r.replace('agents/x.md#interface', 'agents/gone.md#interface'));
  inFixture({ ...contextRepo(), 'CONTEXT.md': mapText(rows) }, (root) => {
    assert.ok(checkContextMap(root, { exempt: [] }).some((p) => p.includes('agents/gone.md')), 'a dead link is reported');
  });
});

test('map check: an agent owned by a skill that is not in that skill\'s Private agents cell is reported; an unlisted skill folder too (AC1)', () => {
  const rows = goodRows().filter((r) => !r.includes('/implement')).concat(mapRow('`/other`', 'skill', '—', 'skills/other/SKILL.md#interface'));
  inFixture({ ...contextRepo({ 'skills/other/SKILL.md': `---\nname: other\ndescription: d\n---\n${BLOCK}` }), 'CONTEXT.md': mapText(rows) }, (root) => {
    const problems = checkContextMap(root, { exempt: [] });
    assert.ok(problems.some((p) => p.includes('implement')), 'the skill with no row is named: ' + problems.join('\n'));
    assert.ok(problems.some((p) => p.includes('prover')), 'the owned agent with no owner row is named: ' + problems.join('\n'));
  });
});

test('map check: the exempt skill may link a README without an Interface block; without the exemption it is reported (Q12c)', () => {
  const files = {
    ...contextRepo({ 'skills/frontend-design/README.md': '# frontend-design\n\nbundle of sub-skills, no block\n' }),
  };
  const rows = [...goodRows(), mapRow('`/frontend-design`', 'skill', '—', 'skills/frontend-design/README.md')];
  inFixture({ ...files, 'CONTEXT.md': mapText(rows) }, (root) => {
    assert.deepEqual(checkContextMap(root, { exempt: ['frontend-design'] }), []);
    assert.ok(checkContextMap(root, { exempt: [] }).some((p) => p.includes('frontend-design')), 'not exempt: reported');
  });
});

test('map check takes the repo root and an exempt-only options object (AC1)', () => {
  assert.equal(checkContextMap.length, 1);
  inFixture({ ...contextRepo(), 'CONTEXT.md': mapText(goodRows()) }, (root) => {
    assert.throws(() => checkContextMap(root, { skip: ['s'] }), /skip/);
    assert.doesNotThrow(() => checkContextMap(root, { exempt: ['s'] }));
  });
});

const mapProblems = (rows, files = {}, text = null) => {
  let out = [];
  inFixture({ ...contextRepo(files), 'CONTEXT.md': text || mapText(rows) }, (root) => { out = checkContextMap(root, { exempt: [] }); });
  return out;
};
const swap = (rows, from, to) => rows.map((r) => (r.includes(from) ? r.replace(from, to) : r));

test('map check: the Interface link must be the row\'s own main file with the #interface anchor (AC1)', () => {
  const noAnchor = mapProblems(swap(goodRows(), 'skills/implement/SKILL.md#interface', 'skills/implement/SKILL.md'));
  assert.ok(noAnchor.some((p) => p.includes('/implement') && p.includes('#interface')), noAnchor.join('\n'));
  const wrongAnchor = mapProblems(swap(goodRows(), 'agents/x.md#interface', 'agents/x.md#inputs'));
  assert.ok(wrongAnchor.some((p) => p.includes('#interface')), wrongAnchor.join('\n'));
  // A row linking another module's file, which exists and holds a block, is still wrong.
  const other = mapProblems(swap(goodRows(), 'agents/x.md#interface', 'agents/prover.md#interface'));
  assert.ok(other.some((p) => p.includes('agents/x.md#interface')), other.join('\n'));
  const codeOther = mapProblems(swap(goodRows(), 'trackers/README.md#interface', 'hooks/README.md#interface'));
  assert.ok(codeOther.some((p) => p.includes('trackers/README.md#interface')), codeOther.join('\n'));
});

test('map check: the Kind column is derived from the row\'s category (AC1)', () => {
  const rows = goodRows().map((r) => r.replace('| agent (shared) |', '| banana |'));
  const problems = mapProblems(rows);
  assert.ok(problems.some((p) => p.includes('banana') && p.includes('agent (shared)')), problems.join('\n'));
  const person = mapProblems(goodRows().map((r) => r.replace('| skill |', '| agent (person) |')));
  assert.ok(person.some((p) => p.includes('/implement') && p.includes('skill')), person.join('\n'));
});

test('map check: Private agents is exact for a skill and empty for every other row; unparseable tokens are reported (AC1)', () => {
  const extra = mapProblems(swap(goodRows(), '`prover`', '`prover`, `x`'));
  assert.ok(extra.some((p) => p.includes('/implement') && p.includes('Private agents')), extra.join('\n'));
  const onShared = mapProblems(swap(goodRows(), '| agent (shared) | owns x | — |', '| agent (shared) | owns x | `prover` |'));
  assert.ok(onShared.some((p) => p.includes('x') && p.includes('Private agents')), onShared.join('\n'));
  const onCode = mapProblems(goodRows().map((r) => (r.startsWith('| hooks') ? r.replace('| — |', '| `prover` |') : r)));
  assert.ok(onCode.some((p) => p.includes('hooks') && p.includes('Private agents')), onCode.join('\n'));
  const empty = mapProblems(goodRows().map((r) => (r.startsWith('| hooks') ? r.replace('| — |', '|  |') : r)));
  assert.ok(!empty.some((p) => p.includes('hooks')), 'an empty cell is as good as a dash: ' + empty.join('\n'));
  const junk = mapProblems(swap(goodRows(), '`prover`', '`prover`, Prover Agent'));
  assert.ok(junk.some((p) => p.includes('Prover Agent')), junk.join('\n'));
});

test('map check: a wrong heading or header, or no table, is one clear problem and nothing more (AC2)', () => {
  const wrongHeading = mapProblems(null, {}, mapText(goodRows(), '## Module map'));
  assert.equal(wrongHeading.length, 1, wrongHeading.join('\n'));
  assert.ok(wrongHeading[0].includes('Architecture map'), wrongHeading[0]);
  const wrongHeader = mapProblems(null, {}, mapText(goodRows()).replace('| Depends on |', '| Needs |'));
  assert.equal(wrongHeader.length, 1, wrongHeader.join('\n'));
  assert.ok(wrongHeader[0].includes('Depends on'), wrongHeader[0]);
  const noTable = mapProblems(null, {}, '# CONTEXT.md\n\n## Architecture map\n\nno table here\n');
  assert.equal(noTable.length, 1, noTable.join('\n'));
  assert.ok(/table/i.test(noTable[0]), noTable[0]);
});

test('map check: a problem about a row names CONTEXT.md and the row\'s line (AC1)', () => {
  const rows = goodRows();
  rows[0] = rows[0].replace('| skill |', '| banana |');
  const text = mapText(rows);
  const line = text.split('\n').findIndex((l) => l.includes('banana')) + 1;
  const problems = mapProblems(null, {}, text);
  assert.ok(problems.some((p) => p.startsWith(`CONTEXT.md:${line}: `) && p.includes('banana')), problems.join('\n'));
});

test('readArchitectureMap gives the line of each row (AC2)', () => {
  const text = mapText(goodRows());
  const map = readArchitectureMap(text);
  const lines = text.split('\n');
  map.rows.forEach((r, n) => assert.ok(lines[map.rowLines[n] - 1].includes(r.Module), `row ${n} line`));
});

// The skills, agents and code modules that exist on disk, found by scanning, not listed by hand.
function repoModules() {
  const skills = fs.readdirSync(path.join(repoRoot, 'skills'), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  return { skills, owners: agentOwners(repoRoot) };
}

test('check 6 — CONTEXT.md maps every module (AC1)', () => {
  // The repo's own map passes the check ...
  assert.deepEqual(checkContextMap(repoRoot, { exempt: EXEMPT_SKILLS }), []);

  const map = readArchitectureMap(fs.readFileSync(path.join(repoRoot, 'CONTEXT.md'), 'utf8'));
  assert.deepEqual(map.header, MAP_COLUMNS);
  const { skills, owners } = repoModules();
  assert.ok(skills.length > 0 && owners.length > 0, 'the scan found the skills and agents');

  // ... one row per skill folder, per unowned agent (shared and person) and per code module, and no more.
  const unowned = owners.filter((a) => a.owner === 'shared' || a.owner === 'person');
  assert.equal(map.rows.length, skills.length + unowned.length + CODE_MODULES.length);
  const rowFor = (name) => map.rows.filter((r) => bare(r.Module) === name);
  for (const s of skills) assert.equal(rowFor(`/${s}`).length, 1, `skill ${s} has exactly one row`);
  for (const a of unowned) {
    assert.equal(rowFor(a.name).length, 1, `agent ${a.name} has exactly one row`);
    assert.equal(bare(rowFor(a.name)[0].Kind), a.owner === 'person' ? 'agent (person)' : 'agent (shared)');
  }
  for (const m of CODE_MODULES) assert.equal(rowFor(m).length, 1, `code module ${m} has exactly one row`);

  // Each agent a skill owns is in that skill's Private agents cell, read from owner: frontmatter.
  const owned = owners.filter((a) => a.owner !== 'shared' && a.owner !== 'person');
  assert.ok(owned.length > 0, 'the scan found the owned agents');
  for (const a of owned) {
    assert.equal(rowFor(a.name).length, 0, `owned agent ${a.name} has no row of its own`);
    assert.ok(cellNames(rowFor(`/${a.owner}`)[0]['Private agents']).includes(a.name), `${a.name} is in /${a.owner}'s Private agents`);
  }
  // A skill's cell holds only its own agents.
  for (const s of skills) {
    const expected = owned.filter((a) => a.owner === s).map((a) => a.name).sort();
    assert.deepEqual(cellNames(rowFor(`/${s}`)[0]['Private agents']).sort(), expected, `/${s} Private agents`);
  }
  // Spot-check by hand: /sprint-plan owns three, /babysit-pr two.
  assert.deepEqual(cellNames(rowFor('/sprint-plan')[0]['Private agents']).sort(), ['sprint-plan-docs-reader', 'sprint-plan-gap-analyzer', 'sprint-plan-tracker-reader']);
  assert.deepEqual(cellNames(rowFor('/babysit-pr')[0]['Private agents']).sort(), ['babysit-pr-analyst', 'babysit-pr-fixer']);

  // No empty Kind, Owns or Interface cell, and every Interface link resolves to a file.
  for (const r of map.rows) {
    for (const col of ['Kind', 'Owns', 'Interface']) assert.ok(bare(r[col]).length > 0, `${r.Module}: empty ${col}`);
    assert.ok(fs.existsSync(path.join(repoRoot, linkTarget(r.Interface).split('#')[0])), `${r.Module}: link ${r.Interface} resolves`);
  }
  const fd = rowFor('/frontend-design')[0];
  assert.equal(linkTarget(fd.Interface), 'skills/frontend-design/README.md');
});

test('CONTEXT.md opens with the Architecture map and the /implement row lists its agents (AC2, AC3, Demo 3)', () => {
  const text = fs.readFileSync(path.join(repoRoot, 'CONTEXT.md'), 'utf8');
  const firstH2 = text.split(/\r?\n/).find((l) => l.startsWith('## '));
  assert.equal(firstH2, '## Architecture map');
  const map = readArchitectureMap(text);
  const impl = map.rows.find((r) => bare(r.Module) === '/implement');
  assert.ok(impl, 'the /implement row exists');
  // Exactly the agents whose owner: is implement (the hand-written EXPECTED_OWNERS and the files agree).
  const fromFiles = agentOwners(repoRoot).filter((a) => a.owner === 'implement').map((a) => a.name).sort();
  const fromHand = Object.keys(EXPECTED_OWNERS).filter((n) => EXPECTED_OWNERS[n] === 'implement').sort();
  assert.deepEqual(fromFiles, fromHand);
  assert.ok(fromFiles.length > 0, 'the owner scan found the implement agents');
  assert.deepEqual(cellNames(impl['Private agents']).sort(), fromHand);
  assert.equal(linkTarget(impl.Interface), 'skills/implement/SKILL.md#interface');
});

test('CONTEXT template opens with the Architecture map (AC2)', () => {
  const template = fs.readFileSync(path.join(repoRoot, 'templates', 'CONTEXT.md.template'), 'utf8');
  const map = readArchitectureMap(template);
  assert.equal(map.heading, 'Architecture map');
  // The same six columns, in the same order and case, as the repo's own CONTEXT.md.
  assert.deepEqual(map.header, MAP_COLUMNS);
  assert.deepEqual(map.header, readArchitectureMap(fs.readFileSync(path.join(repoRoot, 'CONTEXT.md'), 'utf8')).header);
  // The old name is gone from the three places that carried it (Q12b), and the new one is there.
  for (const rel of ['templates/CONTEXT.md.template', 'skills/grill-with-docs/SKILL.md', 'rules/documentation.md']) {
    const text = fs.readFileSync(path.join(repoRoot, rel), 'utf8');
    assert.ok(!/module map/i.test(text), `${rel} still says "module map"`);
    assert.ok(/architecture map/i.test(text), `${rel} says "architecture map"`);
  }
});

test('map check: an Interface link that is absolute or climbs out of the repo is reported, not followed (security finding)', () => {
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'boundaries-outside-'));
  fs.writeFileSync(path.join(outside, 'secret.md'), '## Interface\n\n**Inputs:** x\n');
  try {
    const climb = path.posix.join('..', path.basename(outside), 'secret.md');
    for (const link of [climb, path.join(outside, 'secret.md'), '/etc/hosts']) {
      const rows = [...goodRows(), mapRow('bogus', 'skill', '—', link)];
      const problems = mapProblems(rows);
      assert.ok(problems.some((p) => p.includes('bogus') && /absolute or outside the repo/.test(p)), `${link}: ${problems.join('\n')}`);
      assert.ok(!problems.some((p) => p.includes('bogus') && /does not exist|no ## Interface/.test(p)), `${link} was followed: ${problems.join('\n')}`);
    }
    const hooks = swap(goodRows(), 'hooks/README.md#interface', climb);
    const problems = mapProblems(hooks);
    assert.ok(problems.some((p) => p.includes('hooks') && /absolute or outside the repo/.test(p)), problems.join('\n'));
  } finally {
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('the old name "module map" is gone from skills/, agents/, templates/ and rules/ (Q12b)', () => {
  const found = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === '.git') continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.(md|template|json|js|sh)$/.test(e.name) && /module map/i.test(fs.readFileSync(full, 'utf8'))) {
        found.push(path.relative(repoRoot, full));
      }
    }
  };
  for (const top of ['skills', 'agents', 'templates', 'rules']) walk(path.join(repoRoot, top));
  assert.deepEqual(found, [], `still says "module map": ${found.join(', ')}`);
});
