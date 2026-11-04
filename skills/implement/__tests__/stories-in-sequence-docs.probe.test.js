// Doc-consistency probe for F72 #81 "Architecture, ADR-0005 and the installer match the new build":
// stories are built one after another on the Feature branch (ADR-0005), so ARCHITECTURE.md, the rules,
// the README, the changelog and the installer's required list must say that and no longer describe
// story worktrees, story runners or a width setting. A text probe cannot prove the prose is accurate;
// the Demo run and the run report back up ARCHITECTURE.md section 3.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const read = (...p) => fs.readFileSync(path.join(REPO_ROOT, ...p), 'utf8').replace(/\r\n/g, '\n');

// One level-2 section, from its heading to the next level-2 heading (fenced blocks are skipped over).
function section(content, headingPrefix) {
  const lines = content.split('\n');
  const start = lines.findIndex((l) => l.startsWith(headingPrefix));
  if (start === -1) return null;
  let inFence = false;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith('```')) inFence = !inFence;
    else if (!inFence && /^## /.test(lines[i])) { end = i; break; }
  }
  return lines.slice(start, end).join('\n');
}

// The text with every run of whitespace (newlines included) as one space, so a phrase wrapped over two
// lines is still one phrase.
const flat = (t) => t.replace(/\s+/g, ' ');

// What a doc must no longer say about how stories are built.
// ([s]tory keeps these lines clear of one-build-skill.probe's check for the retired skill's name.)
const OLD_DESIGN = /[s]tory[- ]worktrees?|[s]tory[- ]runners?|merge-tested|max-parallel-stories/i;

// ── ADR-0005 and the two it supersedes ───────────────────────────────

const adrDir = path.join(REPO_ROOT, 'docs', 'adr');
const adrFile = (n) => fs.readdirSync(adrDir).find((f) => f.startsWith(`${n}-`) && f.endsWith('.md'));

// Whole-claim checks, each testable on planted text (the opposite claim must be rejected).
const isAccepted = (t) => /^- \*\*Status:\*\* accepted/m.test(t);
const namesTokenCost = (t) => /token cost|tokens?\b[^.\n]*\bcost|cost[^.\n]*\btokens?\b/i.test(t);
const namesFactoryParity = (t) => /factory parity|parity with the (software )?factory|factory[^.\n]{0,60}\bparity/i.test(t);
const isSupersededByAdr0005 = (t) => /^- \*\*Status:\*\* superseded by ADR-0005 \(2026-11-03\)/m.test(t);

test('Adr0005_RecordsTheDecisionAndWhy', () => {
  // The checks first, on planted text that says the opposite.
  assert.ok(!isAccepted('- **Status:** proposed'), 'a proposed ADR is not accepted');
  assert.ok(!namesTokenCost('Stories are built in parallel worktrees.'), 'planted: no token cost');
  assert.ok(!namesFactoryParity('Nothing here about the other pipeline.'), 'planted: no factory parity');

  const file = adrFile('0005');
  assert.ok(file, 'docs/adr/0005-*.md must exist');
  assert.match(file, /stories-in-sequence/, 'ADR-0005 is about stories in sequence');
  const adr = read('docs', 'adr', file);
  assert.ok(adr.length > 300, 'the ADR was read');
  assert.ok(isAccepted(adr), 'ADR-0005 status is accepted');
  assert.ok(namesTokenCost(adr), 'it records the token cost as the reason');
  assert.ok(namesFactoryParity(adr), 'it records factory parity as the reason');
  assert.match(adr, /parallel only across Features/i, 'consequence: parallel only across Features');
  assert.match(adr, /no per-story isolation/i, 'consequence: no per-story isolation');
});

test('Adr0002And0003_SupersededNotDeleted', () => {
  assert.ok(!isSupersededByAdr0005('- **Status:** accepted (2026-10-06)'), 'planted: accepted is not superseded');
  for (const n of ['0002', '0003']) {
    const file = adrFile(n);
    assert.ok(file, `docs/adr/${n}-*.md must still exist (never deleted)`);
    const adr = read('docs', 'adr', file);
    assert.ok(adr.length > 300, `${file} body is kept`);
    assert.ok(isSupersededByAdr0005(adr), `${file}: status line must be "superseded by ADR-0005 (2026-11-03)"`);
  }
});

// ── ARCHITECTURE.md, by heading ──────────────────────────────────────

const ARCH_SECTIONS = [
  ['## 1. ', 'High-level component diagram'],
  ['## 2. ', 'Service / platform selection rationale'],
  ['## 3. ', 'Cost-at-scale estimates'],
  ['## 4. ', 'Data architecture'],
  ['## 5. ', 'Scalability model'],
  ['## 8. ', 'Disaster recovery'],
];

// A section is found by its number AND its name, so a renumbered or renamed section fails loudly.
const archSection = (doc, prefix) => {
  const entry = ARCH_SECTIONS.find(([p]) => p === prefix);
  return section(doc, `${prefix}${entry[1]}`);
};

function architectureProblems(doc) {
  const found = [];
  for (const [prefix, name] of ARCH_SECTIONS) {
    const s = section(doc, `${prefix}${name}`);
    if (!s) { found.push(`${prefix}${name}: section missing`); continue; }
    // Whole section with whitespace collapsed: a phrase wrapped over two lines is still caught.
    const text = flat(s);
    const m = text.match(OLD_DESIGN);
    if (m) found.push(`${prefix}${name}: "${m[0]}" in: ...${text.slice(Math.max(0, m.index - 40), m.index + 60)}`);
  }
  return found;
}

test('Architecture_SectionsDescribeStoriesInSequence', () => {
  // Plant a section that says "story worktree": the check must fail on it, and pass a clean one.
  const planted = ARCH_SECTIONS.map(([p, n]) => `${p}${n}\nStories each get a story worktree.\n`).join('\n');
  assert.equal(architectureProblems(planted).length, ARCH_SECTIONS.length, 'planted "story worktree" is caught in every section');
  const clean = ARCH_SECTIONS.map(([p, n]) => `${p}${n}\nOne Feature worktree; stories one after another.\n`).join('\n');
  assert.deepStrictEqual(architectureProblems(clean), [], 'a clean document passes');
  // A phrase wrapped over two lines is still caught, and a renumbered section fails loudly.
  const wrapped = ARCH_SECTIONS.map(([p, n]) => `${p}${n}\nStories each get a story\nworktree.\n`).join('\n');
  assert.equal(architectureProblems(wrapped).length, ARCH_SECTIONS.length, 'planted "story\\nworktree" is caught in every section');
  const renumbered = ARCH_SECTIONS.map(([p, n]) => `${p.replace(/\d/, (d) => Number(d) + 10)}${n}\nclean\n`).join('\n');
  assert.equal(architectureProblems(renumbered).length, ARCH_SECTIONS.length, 'planted renumbered sections are reported missing');
  const renamed = ARCH_SECTIONS.map(([p]) => `${p}Something else\nclean\n`).join('\n');
  assert.equal(architectureProblems(renamed).length, ARCH_SECTIONS.length, 'planted renamed sections are reported missing');

  const arch = read('ARCHITECTURE.md');
  assert.ok(arch.length > 5000, 'ARCHITECTURE.md was read');
  assert.deepStrictEqual(architectureProblems(arch), [], 'sections 1-5 and 8 must not describe story worktrees, runners, merge-tested or the width setting');

  // Each section also says the new thing, so a section emptied of text cannot pass.
  assert.match(archSection(arch, '## 1. '), /Feature worktree/, '§1: one Feature worktree');
  assert.match(archSection(arch, '## 2. '), /in sequence|one after another/i, '§2: stories in sequence');
  assert.match(archSection(arch, '## 3. '), /measured from the run report/i, '§3: measured from the run report once a Demo has run');
  assert.match(archSection(arch, '## 4. '), /one commit per story|`Story: #/i, '§4: one commit per story');
  assert.match(archSection(arch, '## 5. '), /parallel only across Features/i, '§5: parallel only across Features');
  assert.match(archSection(arch, '## 8. '), /resume[^\n]*`?Story:/i, '§8: recovery is a resume from the Story: commits');
});

// ── The rules ────────────────────────────────────────────────────────

const OLD_RULES = [
  ['the story runner', /story-runner/],
  ['a story worktree', /[s]tory[- ]worktrees?/i],
  ['a story/ branch pattern', /[s]tory\/</],
  ['a story worktree path', /-s<sid>/],
  ['merge-tested', /merge-tested/],
  ['story-merged', /story-merged/],
  ['the width setting', /max-parallel-stories/],
  ['a per-story decisions log', /tasks\/stories\/<sid>\/decisions-log|one log per story/],
];

function ruleProblems(files) {
  const found = [];
  for (const [file, text] of files) for (const [what, re] of OLD_RULES) if (re.test(text)) found.push(`${file}: ${what}`);
  return found;
}

test('Rules_NoStoryWorktreeOrPerStoryLog', () => {
  // The checker first, on planted text: each phrasing must be caught, and a clean line accepted.
  for (const bad of ['spawn the story-runner-agent', 'Story worktrees are different, and allowed', 'branch `story/<sid>-slug`',
    'path <repo>-f<fid>-s<sid>', 'logs the merge-tested step', 'status story-merged', 'set max-parallel-stories: 3',
    'append to `tasks/stories/<sid>/decisions-log.md`', 'there is one log per story']) {
    assert.notDeepEqual(ruleProblems([['planted', bad]]), [], `planted text must be caught: ${bad}`);
  }
  assert.deepStrictEqual(ruleProblems([['clean', 'one Feature worktree; log at tasks/features/<fid>/decisions-log.md']]), [], 'a clean line passes');

  // The set is derived: every rules/*.md, with a size companion so an empty read cannot pass.
  const names = fs.readdirSync(path.join(REPO_ROOT, 'rules')).filter((f) => f.endsWith('.md'));
  for (const must of ['autonomous-mode.md', 'background-work.md', 'phase-markers.md', 'wave-execution.md', 'git-worktrees.md', 'agent-handoff.md']) {
    assert.ok(names.includes(must), `the scan found rules/${must}`);
  }
  const files = names.map((f) => [`rules/${f}`, read('rules', f)]);
  assert.ok(files.every(([, t]) => t.length > 200), 'every rule file was read');
  assert.deepStrictEqual(ruleProblems(files), []);

  // And what each must now say.
  const wave = read('rules', 'wave-execution.md');
  assert.match(wave, /Do not spawn them with `isolation: "worktree"`/, 'wave isolation is still named and forbidden');
  assert.match(read('rules', 'git-worktrees.md'), /Feature worktree/, 'git-worktrees names the Feature worktree');
  const auto = read('rules', 'autonomous-mode.md');
  assert.match(auto, /Feature run[\s\S]{0,500}tasks\/features\/<fid>\/decisions-log\.md/, 'a Feature run keeps its log in tasks/features/<fid>/');
  assert.match(auto, /#<sid>:/, 'each line is prefixed with #<sid>:');
});

// ── README, the index page, CONFIGURE, CHANGELOG ─────────────────────

// Old Feature-build prose: every story in its own worktree, independent stories at once, a merge per story.
const OLD_PROSE = /\bits own( git)? worktree|\bown git worktree|each story in its own worktree|independent ones at (the same time|once)|merge one at a time|merges\s+each into|every story in its own worktree|every task builds in its own git worktree/i;

// Old design or old prose in a whole document, whitespace collapsed so a wrapped phrase is still seen.
function proseProblems(files) {
  const found = [];
  for (const [f, t] of files) {
    const text = flat(t);
    for (const re of [OLD_DESIGN, OLD_PROSE]) {
      const m = text.match(re);
      if (m) found.push(`${f}: "${m[0]}" in: ...${text.slice(Math.max(0, m.index - 40), m.index + 70)}`);
    }
  }
  return found;
}

// The README's Mermaid block: from its opening fence to the closing one.
const mermaidBlock = (md) => {
  const i = md.indexOf('```mermaid');
  if (i === -1) return null;
  const j = md.indexOf('```', i + 10);
  return md.slice(i, j === -1 ? md.length : j);
};
const mermaidProblems = (md) => {
  const block = mermaidBlock(md);
  if (!block) return ['no Mermaid block'];
  const found = [];
  if (!/One story at a time/i.test(block)) found.push('diagram lacks "One story at a time"');
  if (!/One commit per story/i.test(block)) found.push('diagram lacks "One commit per story"');
  const old = block.match(/[s]tory[- ]worktrees?|\bmerg(e|es|ed|ing)\b/i);
  if (old) found.push(`diagram still says "${old[0]}"`);
  return found;
};

// The Unreleased entry for Feature #72, found by its lead, not by its position.
const featureEntry = (log) => {
  const at = log.indexOf('## [Unreleased]');
  if (at === -1) return null;
  const rest = log.slice(at + 1);
  const next = rest.search(/\n## \[/);
  const unreleased = next === -1 ? rest : rest.slice(0, next);
  return unreleased.split('\n').find((l) => /^- \*\*Feature #72\b/.test(l)) || null;
};

test('ReadmeIndexChangelog_NewFeatureBuild', () => {
  assert.ok(OLD_PROSE.test('Each story in its own worktree<br/>independent ones at once'), 'planted old prose is caught');
  assert.ok(!OLD_PROSE.test('One story at a time, on the Feature branch'), 'the new prose is not');
  // Phrases wrapped over two lines are caught too (the old line-by-line scan missed these).
  assert.notDeepEqual(proseProblems([['planted', 'each story in its own\nworktree, at once']]), [], 'planted wrapped "its own worktree" is caught');
  assert.notDeepEqual(proseProblems([['planted', 'every story in its own\n  worktree']]), [], 'planted wrapped "every story in its own worktree" is caught');
  assert.notDeepEqual(proseProblems([['planted', 'built in a story\nworktree']]), [], 'planted wrapped "story worktree" is caught');
  assert.deepStrictEqual(proseProblems([['clean', 'one Feature worktree;\nstories one at a time']]), [], 'clean prose passes');
  // The old line-by-line scan on the same planted text: it finds nothing, which is the gap this closes.
  const lineByLine = 'built in a story\nworktree'.split('\n').filter((l) => OLD_DESIGN.test(l) || OLD_PROSE.test(l));
  assert.deepStrictEqual(lineByLine, [], 'sanity: the old per-line matcher misses the wrapped phrase');

  // Mermaid check, on planted blocks.
  assert.notDeepEqual(mermaidProblems('```mermaid\nA["Each story in its own story worktree"] --> B["merge"]\n```'), [], 'planted old diagram is refused');
  assert.notDeepEqual(mermaidProblems('```mermaid\nA["One story at a time"] --> B["One commit per story"] --> C["merge into the Feature"]\n```'), [],
    'planted: the new nodes do not excuse an old merge node');
  assert.notDeepEqual(mermaidProblems('no diagram here'), [], 'planted missing diagram is refused');
  assert.deepStrictEqual(mermaidProblems('```mermaid\nA["One story at a time"] --> B["One commit per story"]\n```'), [], 'planted new diagram passes');

  // Changelog entry lookup, on planted text: found by lead even when it is not first.
  assert.ok(featureEntry('## [Unreleased]\n\n- **Other: x**\n- **Feature #72: y**\n\n## [1.0.0]\n- **Feature #72: old**'), 'planted: found though not first');
  assert.match(featureEntry('## [Unreleased]\n\n- **Other: x**\n- **Feature #72: y**\n\n## [1.0.0]\n- **Feature #72: old**'), /: y/,
    'planted: the Unreleased entry is the one found');
  assert.equal(featureEntry('## [Unreleased]\n\n- **Other: x**\n'), null, 'planted: absent entry is not found');
  assert.equal(featureEntry('## [Unreleased]\n\n- **Other: x**\n\n## [1.0.0]\n- **Feature #72: old**'), null,
    'planted: an entry only in a released section is not found');

  const docs = [['README.md', read('README.md')], ['docs/index.html', read('docs', 'index.html')], ['CONFIGURE.md', read('CONFIGURE.md')]];
  assert.ok(docs.every(([, t]) => t.length > 1000), 'every doc was read');
  const hits = proseProblems(docs);
  assert.deepStrictEqual(hits, [], `old Feature-build prose:\n${hits.join('\n')}`);

  // README's Mermaid diagram stays, says stories are built one at a time with a commit each, and no old nodes.
  const readme = docs[0][1];
  assert.deepStrictEqual(mermaidProblems(readme), [], 'README diagram shows the new build');

  // Only the Feature #72 changelog entry is checked; older ones are history.
  const log = read('CHANGELOG.md');
  const first = featureEntry(log);
  assert.ok(first, 'the Unreleased section has a "Feature #72" entry');
  assert.match(first, /one after another|in sequence/i, 'newest entry: stories one after another');
  assert.match(first, /Feature branch/, 'newest entry: on the Feature branch');
  assert.match(first, /seven[- ]check|seven checks|panel of seven|seven reviewers/i, 'newest entry: the seven-check panel');
  assert.doesNotMatch(first, OLD_DESIGN, 'newest entry does not describe the old design');
});

// ── The installer ────────────────────────────────────────────────────

// Agents named in SKILL.md's model table that ship as a file (Explore is built in).
function tableAgents(skill) {
  const s = section(skill.replace(/\n---\n/g, '\n## --\n'), '## Which model each job runs on');
  assert.ok(s, 'SKILL.md has "Which model each job runs on"');
  const names = new Set();
  for (const m of s.matchAll(/^\| `([a-z-]+|Explore)` \|/gm)) if (m[1] !== 'Explore') names.add(m[1]);
  return [...names];
}

function requiredList(updaterSource) {
  const from = updaterSource.indexOf('const required = [');
  const to = updaterSource.indexOf('];', from);
  assert.ok(from > -1 && to > from, 'updater.js has verifyInstall required list');
  // Comment lines hold apostrophes, so drop them before reading the quoted paths.
  const body = updaterSource.slice(from, to).split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  return [...body.matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

function missingFromRequired(agents, required) {
  return agents.filter((a) => !required.includes(`agents/${a}.md`));
}

test('Installer_NewAgentsAndRuleRequired_RunnerRetired', () => {
  // The check first, on a planted list that lacks an agent.
  assert.deepStrictEqual(missingFromRequired(['prover', 'story-builder'], ['agents/prover.md']), ['story-builder'], 'a missing agent is reported');

  const agents = tableAgents(read('skills', 'implement', 'SKILL.md'));
  for (const a of ['story-builder', 'story-reviewer', 'suite-runner', 'prover', 'tracker-helper', 'story-understand-agent', 'coverage-auditor-agent']) {
    assert.ok(agents.includes(a), `the table scan found ${a}`);
  }
  assert.ok(agents.length >= 15, `the table scan found the agents: ${agents.length}`);
  const required = requiredList(read('install', 'lib', 'updater.js'));
  assert.ok(required.includes('skills/implement/SKILL.md'), 'the required list was read');
  assert.deepStrictEqual(missingFromRequired(agents, required), [], 'every agent in the model table must be in verifyInstall required');
  assert.ok(required.includes('rules/agent-handoff.md'), 'rules/agent-handoff.md is required');

  // The runner is retired, not required.
  const { RETIRED_AGENTS } = require('../../../install/lib/updater.js');
  assert.ok(RETIRED_AGENTS.includes('story-runner-agent.md'), 'story-runner-agent.md is in RETIRED_AGENTS');
  assert.ok(!required.includes('agents/story-runner-agent.md'), 'story-runner-agent.md is not required');
  assert.ok(!agents.includes('story-runner-agent'), 'the model table no longer lists the runner');
});
