'use strict';
// Check 5 (rules/modules.md, "Tests check the interface"): a test file reads only its own module's files,
// rules/, files that belong to no module, and other modules' ## Interface blocks (through interfaceOf).
// Story #6j2mgp8CJ6mRHW32 writes the check; story #6j2mgpH6529FcgJ2 reworks every test it found, so the check
// runs over every test in the repo with no list and no filter: the check keeps its (root, { exempt }) shape.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const boundaries = require('../lib/boundaries.js');
const { readInterface } = boundaries;
const { PROMISES } = require('./probe-promises.js');
// The frozen titles and messages of the 13 reworked tests, in two files so neither passes 800 lines.
const REWORK_PROMISES = { ...require('./probe-promises-rework-install.js').PROMISES, ...require('./probe-promises-rework-skills.js').PROMISES };
const { repoRoot, block, withBlock, inFixture } = require('./helpers.js');

// The tests this story reworks or moves: none of them may read another module's insides (AC3, AC6, AC7).
const REWORKED = Object.freeze(Object.keys(PROMISES));
const MOVED_FRONTMATTER = 'install/__tests__/agent-frontmatter.test.js';

function run(root, options) {
  assert.equal(typeof boundaries.checkTestReads, 'function', 'boundaries.js must export checkTestReads');
  return boundaries.checkTestReads(root, options);
}

const inFile = (list, rel) => list.filter((p) => p.startsWith(`${rel}:`));
const lineOf = (text, needle) => text.split('\n').findIndex((l) => l.includes(needle)) + 1;
const src = (...lines) => lines.join('\n') + '\n';
const HEAD3 = [
  "const fs = require('node:fs');",
  "const path = require('node:path');",
  "const root = path.resolve(__dirname, '..', '..', '..');",
];
const HEAD2 = [
  "const fs = require('node:fs');",
  "const path = require('node:path');",
  "const root = path.resolve(__dirname, '..', '..');",
];

// A small repo: two skills, an agent, a rule, two code modules and the files that belong to no module.
const BASE = {
  'skills/a/SKILL.md': withBlock({}),
  'skills/b/SKILL.md': withBlock({ 'Callable parts': '`bin/demo.js`' }),
  'skills/b/bin/demo.js': 'module.exports = {};\n',
  'skills/b/bin/hidden.js': 'module.exports = {};\n',
  'agents/b.md': withBlock({}, '\n# Title\n\nHIDDEN-BODY-TEXT\n'),
  'rules/r.md': '# Rule\n',
  'hooks/README.md': '# hooks\n\n' + block(),
  'hooks/lib/x.js': 'module.exports = {};\n',
  'trackers/README.md': '# trackers\n\n' + block(),
  'trackers/lib/t.js': 'module.exports = {};\n',
  'scripts/README.md': '# scripts\n\n' + block({ 'Callable parts': '`lib/boundaries.js`' }),
  'scripts/lib/boundaries.js': 'module.exports = {};\n',
  'README.md': '# Repo\n',
  'CONTEXT.md': '# Context\n',
  'docs/guide.md': '# Guide\n',
  'templates/t.md': '# Template\n',
  'examples/e.md': '# Example\n',
  '.claude/skills/b/SKILL.md': '# a copy\n',
};

function problemsFor(files, options) {
  return inFixture({ ...BASE, ...files }, (root) => run(root, options));
}

// ── The check on the repo ───────────────────────────────────────────────────────────────────────────

test('check 5 — a test reads only its own module, rules and Interface blocks (AC3, AC4, AC6)', () => {
  // No filter, no list: every test in the repo is checked and every one passes (AC6).
  assert.deepEqual(run(repoRoot), []);
  // Companion: the check had tests to look at, among them every file frozen for the rework.
  for (const rel of Object.keys(REWORK_PROMISES)) assert.ok(fs.existsSync(path.join(repoRoot, rel)), `${rel} is missing: a violator was deleted, not reworked`);
  assert.equal(Object.keys(REWORK_PROMISES).length, 13, 'nine probes and four other tests were frozen');
});

test('check 5 — the nine reworked probes and the moved agent test read no other module (AC3, AC6, AC7, AC11)', () => {
  const problems = run(repoRoot);
  for (const rel of [...REWORKED, MOVED_FRONTMATTER]) {
    assert.deepEqual(inFile(problems, rel), [], `${rel} still reads another module's insides`);
  }
  assert.equal(REWORKED.length, 9, 'story 6 reworks nine probes');
});

test('check 5 takes the repo root and the exempt option only (AC8, AC12)', () => {
  // No list is copied into the check: it takes the repo root and the exempt option only.
  assert.equal(typeof boundaries.checkTestReads, 'function', 'boundaries.js must export checkTestReads');
  assert.equal(boundaries.checkTestReads.length, 1, 'checkTestReads takes more than the repo root');
  assert.throws(() => boundaries.checkTestReads(repoRoot, { skip: ['x'] }), /skip/);
  assert.doesNotThrow(() => boundaries.checkTestReads(repoRoot, { exempt: [] }));
});

// ── The check on fixtures ───────────────────────────────────────────────────────────────────────────

test('check 5 names a test that reads another module\'s body (AC1, AC4)', () => {
  const text = src(...HEAD3, "const body = fs.readFileSync(path.join(root, 'agents', 'b.md'), 'utf8');");
  const problems = problemsFor({ 'skills/a/__tests__/x.test.js': text });
  const line = lineOf(text, "'agents', 'b.md'");
  assert.equal(line, 4);
  const mine = inFile(problems, 'skills/a/__tests__/x.test.js');
  assert.equal(mine.length, 1, `expected one problem, got ${JSON.stringify(problems)}`);
  assert.ok(mine[0].startsWith(`skills/a/__tests__/x.test.js:${line}: reads agents/b.md`), mine[0]);
  assert.ok(mine[0].includes('inside agents/b'), mine[0]);
  assert.ok(mine[0].includes('interfaceOf'), mine[0]);
});

test('check 5 names a read of another skill, not just another top-level folder (AC3)', () => {
  const text = src(...HEAD3, "const body = fs.readFileSync(path.join(root, 'skills', 'b', 'SKILL.md'), 'utf8');");
  const mine = inFile(problemsFor({ 'skills/a/__tests__/x.test.js': text }), 'skills/a/__tests__/x.test.js');
  assert.equal(mine.length, 1, `expected one problem, got ${JSON.stringify(mine)}`);
  assert.ok(mine[0].includes('skills/b'), mine[0]);
});

test('check 5 allows own module, rules and interfaceOf (AC2, AC4)', () => {
  const text = src(
    ...HEAD3,
    "const own = fs.readFileSync(path.join(root, 'skills', 'a', 'SKILL.md'), 'utf8');",
    "const near = fs.readFileSync(path.join(__dirname, '..', 'SKILL.md'), 'utf8');",
    "const rule = fs.readFileSync(path.join(root, 'rules', 'r.md'), 'utf8');",
    "const { interfaceOf } = require('../../../scripts/lib/boundaries.js');",
    "const theirs = interfaceOf(root, 'agents/b');",
  );
  assert.deepEqual(problemsFor({ 'skills/a/__tests__/x.test.js': text }), []);
});

test('check 5 allows files that belong to no module, and not the .claude copy of one (AC4)', () => {
  const allowed = src(
    ...HEAD3,
    "fs.readFileSync(path.join(root, 'README.md'), 'utf8');",
    "fs.readFileSync(path.join(root, 'CONTEXT.md'), 'utf8');",
    "fs.readFileSync(path.join(root, 'docs', 'guide.md'), 'utf8');",
    "fs.readFileSync(path.join(root, 'templates', 't.md'), 'utf8');",
    "fs.readFileSync(path.join(root, 'examples', 'e.md'), 'utf8');",
  );
  assert.deepEqual(problemsFor({ 'skills/a/__tests__/x.test.js': allowed }), []);
  const copy = src(...HEAD3, "fs.readFileSync(path.join(root, '.claude', 'skills', 'b', 'SKILL.md'), 'utf8');");
  const mine = inFile(problemsFor({ 'skills/a/__tests__/x.test.js': copy }), 'skills/a/__tests__/x.test.js');
  assert.equal(mine.length, 1, `a read through .claude/ must be a problem, got ${JSON.stringify(mine)}`);
});

test('check 5 reports a path it cannot resolve, with file and line (AC9, FQ25)', () => {
  const text = src(
    ...HEAD3,
    "const somePath = process.argv[2] + '.md';",
    "const body = fs.readFileSync(somePath, 'utf8');",
  );
  const problems = problemsFor({ 'skills/a/__tests__/x.test.js': text });
  const line = lineOf(text, 'readFileSync(somePath');
  assert.equal(line, 5);
  assert.ok(
    problems.includes(`skills/a/__tests__/x.test.js:${line}: cannot check a non-literal path`),
    `expected the non-literal problem at line ${line}, got ${JSON.stringify(problems)}`,
  );
});

test('check 5 does not count a read inside a temporary folder the test made (FQ25)', () => {
  const text = src(
    "const fs = require('node:fs');",
    "const os = require('node:os');",
    "const path = require('node:path');",
    "const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'x-'));",
    "fs.mkdirSync(path.join(dir, 'agents'), { recursive: true });",
    "fs.writeFileSync(path.join(dir, 'agents', 'b.md'), 'text');",
    "fs.readFileSync(path.join(dir, 'agents', 'b.md'), 'utf8');",
  );
  assert.deepEqual(problemsFor({ 'skills/a/__tests__/x.test.js': text }), []);
});

test('check 5 lets the boundary check read module bodies, and no other test in scripts (AC1, FQ22)', () => {
  const text = src(...HEAD2, "const body = fs.readFileSync(path.join(root, 'agents', 'b.md'), 'utf8');");
  const problems = problemsFor({
    'scripts/__tests__/boundaries-x.test.js': text,
    'scripts/__tests__/other.test.js': text,
  });
  assert.deepEqual(inFile(problems, 'scripts/__tests__/boundaries-x.test.js'), []);
  assert.equal(inFile(problems, 'scripts/__tests__/other.test.js').length, 1, `other.test.js must be a problem, got ${JSON.stringify(problems)}`);
});

test('check 5 scans the helper a test requires (AC9)', () => {
  const helper = src(
    ...HEAD3.slice(0, 2),
    "const root = path.resolve(__dirname, '..', '..', '..', '..');",
    "module.exports = fs.readFileSync(path.join(root, 'agents', 'b.md'), 'utf8');",
  );
  const first = src(...HEAD3, "const body = require('./lib/h.js');");
  const problems = problemsFor({
    'skills/a/__tests__/x.test.js': first,
    'skills/a/__tests__/lib/h.js': helper,
  });
  const mine = inFile(problems, 'skills/a/__tests__/lib/h.js');
  assert.equal(mine.length, 1, `the read moved into a helper must still be found, got ${JSON.stringify(problems)}`);
  assert.ok(mine[0].includes('agents/b.md'), mine[0]);
  // The boundary check's own helper is part of its carve-out.
  const own = problemsFor({
    'scripts/__tests__/boundaries-y.test.js': src(...HEAD2, "const h = require('./helpers.js');"),
    'scripts/__tests__/helpers.js': src(...HEAD2, "module.exports = fs.readFileSync(path.join(root, 'agents', 'b.md'), 'utf8');"),
  });
  assert.deepEqual(own, []);
});

test('check 5 follows a local wrapper with a spread argument to its call sites (review finding 2)', () => {
  const file = 'skills/a/__tests__/x.test.js';
  const wrapper = [
    "const fs = require('node:fs');",
    "const path = require('node:path');",
    "const OWN = path.resolve(__dirname);",
    "const read = (...p) => fs.readFileSync(path.join(OWN, ...p), 'utf8');",
  ];
  const text = src(...wrapper, "read('..', '..', '..', 'agents', 'b.md');", "read('..', '..', 'b', 'SKILL.md');");
  const mine = inFile(problemsFor({ [file]: text }), file);
  assert.equal(mine.length, 2, `both climbs through the wrapper must be reported, got ${JSON.stringify(mine)}`);
  assert.ok(mine.some((p) => p.startsWith(`${file}:${lineOf(text, "'agents', 'b.md'")}: reads agents/b.md`)), JSON.stringify(mine));
  assert.ok(mine.some((p) => p.startsWith(`${file}:${lineOf(text, "'b', 'SKILL.md'")}: reads skills/b/SKILL.md`)), JSON.stringify(mine));
  const stays = src(...wrapper, "read('..', 'SKILL.md');", "read('fixture.txt');");
  assert.deepEqual(inFile(problemsFor({ [file]: stays }), file), [], 'a wrapper call that stays in its own module is not a problem');
});

test('check 5 checks a literal read that climbs out of the repo root (review finding 2)', () => {
  const file = 'skills/a/__tests__/x.test.js';
  const text = src("const fs = require('node:fs');", "fs.readFileSync('../../b/SKILL.md', 'utf8');");
  const mine = inFile(problemsFor({ [file]: text }), file);
  assert.deepEqual(mine, [`${file}:2: cannot check a non-literal path`]);
  const fine = src("const fs = require('node:fs');", "fs.readFileSync('README.md', 'utf8');");
  assert.deepEqual(inFile(problemsFor({ [file]: fine }), file), []);
});

test('check 5 covers a code module\'s tests, reads and requires alike (AC5)', () => {
  const reads = src(...HEAD2, "const t = fs.readFileSync(path.join(root, 'trackers', 'lib', 't.js'), 'utf8');");
  const requires = src("const t = require('../../trackers/lib/t.js');");
  const own = src(...HEAD2, "const x = fs.readFileSync(path.join(root, 'hooks', 'lib', 'x.js'), 'utf8');", "const y = require('../lib/x.js');");
  const problems = problemsFor({
    'hooks/__tests__/reads.test.js': reads,
    'hooks/__tests__/requires.test.js': requires,
    'hooks/__tests__/own.test.js': own,
  });
  assert.equal(inFile(problems, 'hooks/__tests__/reads.test.js').length, 1, JSON.stringify(problems));
  assert.ok(inFile(problems, 'hooks/__tests__/reads.test.js')[0].includes('trackers'));
  assert.equal(inFile(problems, 'hooks/__tests__/requires.test.js').length, 1, JSON.stringify(problems));
  assert.deepEqual(inFile(problems, 'hooks/__tests__/own.test.js'), []);
});

test('check 5 lets a test require only a file the other module\'s Interface lists (AC5)', () => {
  const listed = src("const d = require('../../b/bin/demo.js');");
  const unlisted = src("const s = require('../../b/bin/hidden.js');");
  const problems = problemsFor({
    'skills/a/__tests__/listed.test.js': listed,
    'skills/a/__tests__/unlisted.test.js': unlisted,
  });
  assert.deepEqual(inFile(problems, 'skills/a/__tests__/listed.test.js'), []);
  const mine = inFile(problems, 'skills/a/__tests__/unlisted.test.js');
  assert.equal(mine.length, 1, JSON.stringify(problems));
  assert.ok(mine[0].includes('hidden.js'), mine[0]);
});

// ── interfaceOf ─────────────────────────────────────────────────────────────────────────────────────

test('interfaceOf returns the Interface block and throws for a module without one (AC2, FQ26)', () => {
  assert.equal(typeof boundaries.interfaceOf, 'function', 'boundaries.js must export interfaceOf');
  const files = {
    ...BASE,
    'agents/c.md': '---\nname: c\ndescription: d\n---\n\n# No block\n\nbody\n',
  };
  inFixture(files, (root) => {
    const agent = boundaries.interfaceOf(root, 'agents/b');
    assert.ok(agent.includes('**Inputs:** a file'), 'the Inputs part is missing');
    assert.ok(agent.includes('**Never breaks:** a promise'), 'the Never breaks part is missing');
    assert.ok(!agent.includes('HIDDEN-BODY-TEXT'), 'the body below the block leaked through interfaceOf');
    assert.ok(!agent.includes('name: x'), 'the frontmatter leaked through interfaceOf');
    assert.ok(boundaries.interfaceOf(root, 'skills/b').includes('`bin/demo.js`'), 'a skill block is read from SKILL.md');
    assert.ok(boundaries.interfaceOf(root, 'scripts').includes('`lib/boundaries.js`'), 'a code module block is read from README.md');
    assert.throws(() => boundaries.interfaceOf(root, 'agents/c'), /agents\/c/);
    assert.throws(() => boundaries.interfaceOf(root, 'agents/nope'), /agents\/nope/);
  });
  const real = boundaries.interfaceOf(repoRoot, 'skills/implement');
  assert.ok(real.includes('**Never breaks:**'), 'the real /implement block has its Never breaks part');
});

test('scripts README lists checkTestReads and interfaceOf as callable parts (AC2, FQ26)', () => {
  const iface = readInterface(fs.readFileSync(path.join(repoRoot, 'scripts', 'README.md'), 'utf8'));
  assert.ok(iface.found, 'scripts/README.md has an Interface block');
  assert.ok(iface.parts.callable.includes('`checkTestReads`'), 'Callable parts must list checkTestReads');
  assert.ok(iface.parts.callable.includes('`interfaceOf`'), 'Callable parts must list interfaceOf');
});

// ── package.json and the agents' own tests ──────────────────────────────────────────────────────────

test('npm test runs agents/__tests__ (AC6, AC10)', () => {
  const scripts = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')).scripts;
  const glob = 'agents/__tests__/*.test.js';
  assert.ok(scripts.test.includes(glob), 'the test script must run agents/__tests__');
  assert.ok(scripts['test:coverage'].includes(glob), 'the test:coverage script must run agents/__tests__');
  assert.ok(scripts.lint.includes('agents/__tests__/'), 'the lint script must cover agents/__tests__');
  assert.ok(scripts['test:agents'] && scripts['test:agents'].includes(glob), 'a test:agents script runs them alone');
});

test('checks on an agent\'s own text live in agents/__tests__ (AC6, AC7)', () => {
  const dir = path.join(repoRoot, 'agents', '__tests__');
  for (const name of ['agent-frontmatter.test.js', 'agent-text.test.js']) {
    assert.ok(fs.existsSync(path.join(dir, name)), `agents/__tests__/${name} is missing`);
  }
  assert.ok(!fs.existsSync(path.join(repoRoot, MOVED_FRONTMATTER)), 'the frontmatter test must move out of install/');
  // Nothing but .js lives there: the installer ships agents/*.md, so a fixture would be read as an agent (FQ27).
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir)) assert.ok(f.endsWith('.js'), `agents/__tests__/${f} is not a .js file`);
  }
  // No test outside agents/ reads an agent's body.
  const reads = run(repoRoot).filter((p) => /reads agents\//.test(p) && !p.startsWith('agents/'));
  assert.deepEqual(reads, []);
});

// ── The reworked probes keep their promises ─────────────────────────────────────────────────────────

const unescape = (s) => s.replace(/\\(['"`])/g, '$1');

// What the frozen titles and messages ask for that none of the given texts still holds.
function lost(entry, texts) {
  const all = unescape(texts.join('\n'));
  return [...entry.titles, ...entry.messages].filter((s) => !all.includes(unescape(s)));
}

// Where a moved check may now live: the agents' own tests, and the own tests of the modules whose body
// a probe used to read (FQ33: a check on a promise written only in another module's body moves into
// that module's tests, with its title and messages).
const TWIN_DIRS = [
  'agents/__tests__',
  'hooks/__tests__',
  'trackers/__tests__',
  'code-platform/__tests__',
  'install/__tests__',
  ...fs.readdirSync(path.join(repoRoot, 'skills'))
    .filter((d) => d !== 'implement' && fs.existsSync(path.join(repoRoot, 'skills', d, '__tests__')))
    .map((d) => `skills/${d}/__tests__`),
];

// The whole-repo questions (does any file name X, is this file gone) are asked in the boundary family, which
// the rule lets read every module: scripts/__tests__/boundaries-repo.test.js.
const REPO_QUESTIONS = 'scripts/__tests__/boundaries-repo.test.js';

// The comparison of two modules' derivations, which only the boundary family may read both sides of.
const LOCK_AGENTS = 'scripts/__tests__/boundaries-lock-agents.test.js';

function twinTexts(except) {
  return [REPO_QUESTIONS, LOCK_AGENTS].map((rel) => fs.readFileSync(path.join(repoRoot, rel), 'utf8')).concat(twinTextsInDirs(except));
}

function twinTextsInDirs(except) {
  return TWIN_DIRS.flatMap((rel) => {
    const dir = path.join(repoRoot, rel);
    return fs.existsSync(dir)
      ? fs.readdirSync(dir).filter((f) => f.endsWith('.test.js') && `${rel}/${f}` !== except).map((f) => fs.readFileSync(path.join(dir, f), 'utf8'))
      : [];
  });
}

test('check 5 — reworked probes keep their promises (AC1, AC2, AC3, AC6)', () => {
  const twins = twinTexts();
  let titles = 0;
  let messages = 0;
  for (const [rel, entry] of Object.entries(PROMISES)) {
    const probe = fs.readFileSync(path.join(repoRoot, rel), 'utf8');
    assert.deepEqual(lost(entry, [probe, ...twins]), [], `${rel} lost a title or an assertion message`);
    titles += entry.titles.length;
    messages += entry.messages.length;
  }
  // Companion: the frozen list is the whole of what the nine probes assert, not an empty shell.
  assert.equal(Object.keys(PROMISES).length, 9);
  assert.ok(titles >= 100, `the frozen list holds only ${titles} titles`);
  assert.ok(messages >= 450, `the frozen list holds only ${messages} assertion messages`);
});

test('check 5 — the second nine probes and the four other tests keep their promises (AC3, AC6)', () => {
  let titles = 0;
  let messages = 0;
  for (const [rel, entry] of Object.entries(REWORK_PROMISES)) {
    const own = fs.readFileSync(path.join(repoRoot, rel), 'utf8');
    // A title or message that now lives in another test file of the same name does not count: it is in the file or in a twin.
    assert.deepEqual(lost(entry, [own, ...twinTexts(rel)]), [], `${rel} lost a title or an assertion message`);
    titles += entry.titles.length;
    messages += entry.messages.length;
  }
  assert.equal(Object.keys(REWORK_PROMISES).length, 13);
  assert.ok(titles >= 190, `the frozen list holds only ${titles} titles`);
  assert.ok(messages >= 780, `the frozen list holds only ${messages} assertion messages`);
});

test('check 5 — the STATUS promise is read from the agents\' Interface blocks, not their bodies (AC1, AC2, AC5)', () => {
  const probe = fs.readFileSync(path.join(repoRoot, 'skills/implement/__tests__/agent-handoff.probe.test.js'), 'utf8');
  assert.ok(/^test\(\s*(['"`])every agent's Interface Outputs starts with a STATUS line/m.test(probe), 'the probe must hold the Interface test');
  assert.ok(/interfaceOf\(/.test(probe), 'the probe must read the agents through interfaceOf');
  assert.ok(!/read\(\s*'agents'/.test(probe), 'the probe must not read an agent\'s body');
  assert.ok(!/path\.join\(REPO_ROOT, 'agents'/.test(probe), 'the probe must not open agents/<name>.md');
});

test('check 5 — the promise check can fail: a dropped title or message is reported (AC11)', () => {
  const entry = { titles: ['Demo_FormatIsDefinedWithEveryKind'], messages: ['the read step must call ${s}'] };
  assert.deepEqual(lost(entry, ["test('Demo_FormatIsDefinedWithEveryKind', () => { assert.ok(x, `the read step must call ${s}`); });"]), []);
  assert.deepEqual(lost(entry, ["test('Demo_FormatIsDefinedWithEveryKind', () => { assert.ok(x); });"]), ['the read step must call ${s}']);
  assert.deepEqual(lost(entry, ['']), ['Demo_FormatIsDefinedWithEveryKind', 'the read step must call ${s}']);
});

// ── rules/modules.md "What runs today" ──────────────────────────────────────────────────────────────

test('check 5 — what runs today names every item and defers none (AC7)', () => {
  const text = fs.readFileSync(path.join(repoRoot, 'rules', 'modules.md'), 'utf8');
  const start = text.indexOf('### What runs today');
  assert.ok(start !== -1, 'rules/modules.md has a "What runs today" heading');
  const end = text.indexOf('\n---', start);
  const body = text.slice(start, end === -1 ? undefined : end).replace(/\s+/g, ' ');
  for (const n of [1, 2, 3, 4, 5, 6, 7]) assert.ok(new RegExp(`\\(items? ${n}\\)|item ${n}\\b`).test(body), `"What runs today" does not name item ${n}`);
  for (const later of [/arrive later/i, /come next/i, /not every item/i, /\bfirst half\b/i, /still reworks/i, /\bbar the tests\b/i, /not enforced yet/i]) {
    assert.ok(!later.test(body), `"What runs today" still defers something: ${later}`);
  }
  // Companion: the check can fail on planted text that defers an item.
  assert.ok(/arrive later/i.test('These arrive later.'), 'the check finds the sentence');
});
