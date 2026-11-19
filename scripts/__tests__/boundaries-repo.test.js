'use strict';
// Whole-repo questions: "does any file anywhere name X?" and "is this file gone?". Moved out of the /implement
// probes (one-build-skill, one-loop, panel-fixes, trustworthy-builds; story #6j2mgpH6529FcgJ2): a test of one
// module may not read every other module, so the question is asked here, in the boundary family that rules/modules.md
// lets read every module's files (check 5 carve-out). Same test names and assertion messages as the probes had.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { repoRoot } = require('./helpers.js');
const { readRequired } = require('../../skills/implement/bin/startup-check.js');

const SKIP = new Set(['node_modules', '.git', 'tasks', '.claude', '_local', 'coverage']);

// Every file in the repo, as `/`-separated paths relative to the root.
function repoFiles() {
  const out = [];
  const walk = (dir, rel) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!rel && SKIP.has(e.name)) continue;
      if (e.name === 'node_modules' || e.name === '.git') continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(dir, e.name), r);
      else out.push(r);
    }
  };
  walk(repoRoot, '');
  return out.sort();
}
const FILES = repoFiles();
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), 'utf8').replace(/\r\n/g, '\n');
const exists = (...p) => FILES.some((f) => f === p.join('/') || f.startsWith(`${p.join('/')}/`));
const flat = (t) => String(t).replace(/\s+/g, ' ');

// Every markdown file that is an instruction: agents/, rules/, skills/ (not their tests), README.md, CONTRIBUTING.md.
const instructionFiles = () => FILES.filter((f) => f.endsWith('.md')
  && ((/^(agents|rules|skills)\//.test(f) && !/(^|\/)(__tests__|node_modules)\//.test(f)) || f === 'README.md' || f === 'CONTRIBUTING.md'));

function hitsIn(re, files) {
  const hits = [];
  for (const f of files) read(f).split('\n').forEach((line, i) => { if (re.test(line)) hits.push(`${f}:${i + 1}`); });
  return hits;
}

// ── from one-build-skill.probe.test.js ───────────────────────────────

// A reference to a retired skill or agent. "/story-runner-agent", "tasks/stories/",
// "story/<sid>-slug" branch names, "issue/story" and a regex such as /story worktree/ are not
// references, so "/story" must start a word and be followed by an id, a flag, punctuation or the end.
const RETIRED = /(?<![\w/])\/story(?![\w/-]| worktree| \d+ is)|\brun-tasks\b|story-plan-agent|skills\/story\//;

// Files that may name them: history, the decision and its inventory, the installer code that removes
// them and its tests, the one README line and the TROUBLESHOOTING note that say they were retired,
// the phase-marker rule's back-compatibility line, and the probes that say what they replaced.
const ALLOWED = [
  /^CHANGELOG\.md$/, /^grill-summary\.md$/, /^\.planning\//, /^ARCHITECTURE\.md$/, /^docs\/adr\//,
  /^docs\/story-retirement-inventory\.md$/,
  /^install\/lib\/updater\.js$/, /^install\/__tests__\//,
  /^README\.md$/, /^TROUBLESHOOTING\.md$/, /^rules\/phase-markers\.md$/,
  /^skills\/implement\/__tests__\/(tdd-mode|one-build-skill)\.probe\.test\.js$/,
  // The frozen list of the titles and messages the probes keep (it copies this probe's own sentences), and this file.
  /^scripts\/__tests__\/probe-promises(-rework-(install|skills))?\.js$/, /^scripts\/__tests__\/boundaries-repo\.test\.js$/,
];

test('Retired_NoReferenceOutsideTheAllowedFiles', () => {
  // The pattern can fail: planted references are found, the allowed forms are not.
  assert.ok(RETIRED.test('Run /story 12 to build it.'), 'a planted reference to /story is found');
  assert.ok(RETIRED.test('see skills/story/SKILL.md'), 'a planted path into the retired skill is found');
  assert.ok(!RETIRED.test('the story-runner-agent and tasks/stories/ stay'), 'the allowed forms are not references');
  const hits = [];
  for (const f of FILES) {
    if (!/\.(md|js|json|sh|html|yml|yaml)$/.test(f) || f === 'feature-unit-grill-brief.md' || ALLOWED.some((re) => re.test(f))) continue;
    read(f).split('\n').forEach((line, i) => { if (RETIRED.test(line)) hits.push(`${f}:${i + 1}: ${line.trim().slice(0, 120)}`); });
  }
  assert.deepStrictEqual(hits, [], `references to retired /story, /run-tasks or story-plan-agent:\n${hits.join('\n')}`);
});

// ── from one-loop.probe.test.js ──────────────────────────────────────

test('NothingNamesTheExecutor', () => {
  const re = /story-executor-agent/;
  assert.ok(re.test('spawn a story-executor-agent'), 'the pattern finds the name');
  const files = instructionFiles();
  assert.ok(files.length >= 20, `companion: at least 20 files were read (${files.length})`);
  assert.deepEqual(hitsIn(re, files), [], 'no agent, rule, skill, README or CONTRIBUTING line names the executor');
});

test('MustFailAndWaves_NoLongerExistInTheInstructions', () => {
  const files = instructionFiles();
  assert.ok(files.length >= 20, `companion: at least 20 files were read (${files.length})`);
  assert.deepEqual(hitsIn(/must_fail|parallel_group/, files), [], 'no must_fail or parallel_group in any instruction file');
});

test('PlanLint_Retired', () => {
  for (const f of [
    ['hooks', 'plan-lint-check.js'], ['hooks', 'lib', 'plan-lint.js'],
    ['hooks', '__tests__', 'plan-lint.test.js'], ['hooks', '__tests__', 'plan-lint-check.test.js'],
    ['scripts', 'tdd-rig.js'],
  ]) assert.ok(!exists(...f), `${f.join('/')} is deleted`);
});

test('Troubleshoot_NothingSendsWorkToIt', () => {
  const re = /\/troubleshoot(?![\w-])|troubleshoot-investigator|skills\/troubleshoot/;
  assert.ok(re.test('route behavioral gaps to `/troubleshoot`.'), 'the pattern finds a route to it');
  assert.ok(!re.test('see TROUBLESHOOTING.md and /troubleshooting notes'), 'the pattern leaves the troubleshooting guide alone');
  const files = instructionFiles();
  assert.ok(files.length >= 20, `companion: at least 20 files were read (${files.length})`);
  assert.deepEqual(hitsIn(re, files), [], 'no skill, agent, rule, README or CONTRIBUTING line names /troubleshoot or its investigator');
});

// ── from panel-fixes.probe.test.js ───────────────────────────────────

test('Goal_HasOneHome_BriefForAStory_TestStrategyForAFeature', () => {
  // Every markdown file that is a live instruction: agents, skills, rules.
  const live = FILES.filter((f) => f.endsWith('.md') && /^(agents|skills|rules)\//.test(f) && !/(^|\/)(__tests__|node_modules)\//.test(f));
  assert.ok(live.length > 30, 'companion: the scan found the live instructions');
  const naming = live.filter((f) => /tasks\/stories\/<(?:id|sid)>\/test-strategy\.md/.test(read(f)));
  assert.deepEqual(naming, [], 'no live instruction names tasks/stories/<id>/test-strategy.md');
});

// ── from trustworthy-builds.probe.test.js ────────────────────────────

test('StartupCheck_EveryRequiredToolExistsInThisRepo', () => {
  for (const r of readRequired()) {
    const where = {
      agent: ['agents', `${r.name}.md`],
      skill: ['skills', r.name, 'SKILL.md'],
      'tracker-script': ['trackers', 'local', r.name],
      'code-platform-script': ['code-platform', 'github', r.name],
    }[r.kind];
    assert.ok(where, `unknown kind ${r.kind}`);
    assert.ok(exists(...where), `Required tools lists ${r.kind} ${r.name}, which is not in the repo (${where.join('/')})`);
  }
});

test('Names_NothingLaunchesTheOldAgentNames', () => {
  const offenders = FILES.filter((f) => /^(agents|skills|rules|templates)\//.test(f) && /\.(md|json)$/.test(f) && !/(^|\/)(__tests__|node_modules)\//.test(f))
    .filter((f) => /--agent (builder|reviewer)\b|"agent": "(builder|reviewer)"/.test(read(f)));
  assert.deepEqual(offenders, [], `still launch the old agent names: ${offenders.join(', ')}`);
});

// ── from install/__tests__/updater.test.js ───────────────────────────

// The hash in install's private lib/updater.js against hooks' file at the base release, read through git: a test
// of install may not read the hooks module's files, so the comparison of the two lives here.
test('Renamed_TheBaseReleaseHashOfHooksSecurityIsTheRealFilesHash', (t) => {
  let base;
  try {
    base = execFileSync('git', ['show', '321f444:hooks/SECURITY.md'], { cwd: repoRoot, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch { t.skip('the base release is not in this clone'); return; }
  // updater.js is private to install (its README's Callable parts), so its RENAMED entry is read as text.
  const entry = read('install/lib/updater.js').match(/\[\s*'hooks\/SECURITY\.md'\s*,\s*'[^']*'\s*,\s*'([0-9a-f]{64})'\s*\]/);
  assert.ok(entry && entry[1], 'hooks/SECURITY.md carries the hash of its base-release content');
  assert.equal(entry[1], crypto.createHash('sha256').update(base).digest('hex'));
});

// The probes' absence checks that name files of other modules are asserted above; this one pins the helper itself.
test('the file walk finds this file and skips tasks/', () => {
  assert.ok(exists('scripts', '__tests__', 'boundaries-repo.test.js'), 'the walk lists the repo');
  assert.ok(!FILES.some((f) => f.startsWith('tasks/')), 'tasks/ is not part of the repo walk');
  assert.ok(flat(' a  b ') === ' a b ', 'companion: flat collapses whitespace');
});
