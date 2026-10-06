// Probe for F7 #61 "One build skill" (ADR-0001): /story and /run-tasks are retired after a
// line-by-line inventory (#62), their enterprise-only parts live in /implement behind the pack
// (#63), nothing in the repo refers to them any more (#64), and the rules and docs describe the new
// design (#65). The installer's removal on upgrade has its behaviour tests in
// install/__tests__/non-interactive.test.js.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const read = (...p) => fs.readFileSync(path.join(REPO_ROOT, ...p), 'utf8').replace(/\r/g, '');
const IMPLEMENT = read('skills', 'implement', 'SKILL.md');

function mustMatch(content, re, message) { assert.ok(content && re.test(content), message); }

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
];

test('Retired_NoReferenceOutsideTheAllowedFiles', () => {
  const files = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: REPO_ROOT, encoding: 'utf8' })
    .stdout.split('\n').filter(Boolean)
    .filter((f) => /\.(md|js|json|sh|html|yml|yaml)$/.test(f) && !f.startsWith('tasks/') && f !== 'feature-unit-grill-brief.md');
  const hits = [];
  for (const f of files) {
    if (ALLOWED.some((re) => re.test(f)) || !fs.existsSync(path.join(REPO_ROOT, f))) continue;
    read(f).split('\n').forEach((line, i) => { if (RETIRED.test(line)) hits.push(`${f}:${i + 1}: ${line.trim().slice(0, 120)}`); });
  }
  assert.deepStrictEqual(hits, [], `references to retired /story, /run-tasks or story-plan-agent:\n${hits.join('\n')}`);
});

test('Retired_TheSkillsAndAgentAreGone', () => {
  for (const p of [['skills', 'story'], ['skills', 'run-tasks'], ['agents', 'story-plan-agent.md']]) {
    assert.ok(!fs.existsSync(path.join(REPO_ROOT, ...p)), `${p.join('/')} must be removed`);
  }
  const allowedInReadme = read('README.md').split('\n').filter((l) => RETIRED.test(l));
  assert.ok(allowedInReadme.every((l) => /retired/i.test(l)), `README may name them only to say they were retired:\n${allowedInReadme.join('\n')}`);
});

// ── #62 the inventory ────────────────────────────────────────────────

test('Inventory_EveryStoryPhaseAndAgentHasADecision', () => {
  const inv = read('docs', 'story-retirement-inventory.md');
  for (const phase of ['Phase 1', 'Phase 1.5', 'Phase 2', 'Phase 3', 'Phase 3.5', 'Phase 3.6', 'Phase 3.7', 'Phase 4', 'Test-first mode', 'Autonomous mode']) {
    assert.ok(inv.includes(phase), `the inventory must cover /story ${phase}`);
  }
  for (const agent of ['story-understand-agent', 'story-plan-agent', 'story-pr-agent']) {
    assert.ok(inv.includes(agent), `the inventory must cover ${agent}`);
  }
  mustMatch(inv, /## `\/run-tasks`/, 'the inventory covers /run-tasks');
  // Every row ends in a decision: covered, moved, kept, or dropped with a reason.
  const rows = inv.split('\n').filter((l) => /^\| [^|-]/.test(l) && !/^\| (`\/story`|`\/run-tasks`|Agent) \|/.test(l));
  for (const r of rows) assert.match(r, /Covered|Moved|Kept|Dropped|Removed/i, `inventory row without a decision: ${r.slice(0, 100)}`);
  assert.doesNotMatch(inv, /- \[ \]/, 'every moved item is ticked as landed');
});

// ── #63 enterprise parts behind the pack ─────────────────────────────

test('Pack_ImplementReadsItAndGatesTheEnterpriseSteps', () => {
  mustMatch(IMPLEMENT, /workflowPack[\s\S]{0,200}\.harness-manifest\.json/, '/implement reads the pack from the manifest');
  mustMatch(IMPLEMENT, /solo run never reads or mentions a sprint file/, 'solo never touches a sprint file');
  mustMatch(IMPLEMENT, /Sprint file path: \[\*\*enterprise only:\*\* the latest `tasks\/sprint\*\.md`/, 'Phase 1 passes the sprint file on enterprise');
  mustMatch(IMPLEMENT, /\*\*Enterprise only\*\*, when the ticket lists child tasks\] Child tasks/, 'one task per child task on enterprise');
  mustMatch(IMPLEMENT, /\*\*Enterprise only — the sprint file\.\*\*[\s\S]{0,300}Master Status Table/, 'the Feature PR updates the Master Status Table on enterprise');
  mustMatch(IMPLEMENT, /Pack: \[`enterprise` or `solo`\]/, 'the PR step passes the pack to story-pr-agent');
  const pr = read('agents', 'story-pr-agent.md');
  mustMatch(pr, /## Step 6 — Update sprint Master Status Table \(enterprise only\)[\s\S]{0,300}solo install, skip this\s+step entirely/, 'story-pr-agent skips the table on solo');
  mustMatch(read('agents', 'implement-planner-agent.md'), /\*\*`Child tasks:`\*\*[\s\S]{0,200}one `<task>` per child task/, 'the planner knows the child-task rule');
});

test('Moved_BehavioursThatWereOnlyInStory', () => {
  mustMatch(IMPLEMENT, /Read `YOUR_PROJECT_ROOT\/tasks\/lessons\.md`, or `tasks\/notes\.md`/, 'reads lessons.md first');
  mustMatch(IMPLEMENT, /never auto-push to the default branch/, 'never auto-pushes from the default branch');
  mustMatch(IMPLEMENT, /rendered verbatim into the PR[\s\S]{0,200}or personal or health data/, 'the decisions log holds no personal data');
});

// ── #64 the replacements work ────────────────────────────────────────

test('Replacements_TroubleshootHandsItsPlanToResume', () => {
  const ts = read('skills', 'troubleshoot', 'SKILL.md');
  mustMatch(ts, /\/implement --resume troubleshoot-\[short-name\]/, '/troubleshoot hands off to --resume');
  mustMatch(ts, /executor-state\.md[\s\S]{0,400}next: wave-1/, 'it saves the state --resume needs');
  mustMatch(ts, /test-strategy\.md/, 'it saves the test strategy the review needs');
});

test('Replacements_RosterAndInstallerKnowTheOneBuildSkill', () => {
  for (const pack of ['solo', 'enterprise']) {
    const roster = JSON.parse(read('templates', `harness-roles.${pack}.json`));
    assert.deepStrictEqual(roster.roles.builder.skills, ['implement'], `${pack} roster: the builder runs /implement`);
  }
  const updater = read('install', 'lib', 'updater.js');
  // Later retirements join the list (to-issues, 2026-10-06); story and run-tasks stay on it.
  mustMatch(updater, /RETIRED_SKILLS = \['story', 'run-tasks'(, '[a-z-]+')*\]/, 'the updater lists the retired skills');
  mustMatch(updater, /removeRetired\(target\);/, 'an update removes them');
  mustMatch(read('install', 'install.js'), /removeRetired\(target\);/, 'an install over an old one removes them');
});

// ── #65 rules and docs ───────────────────────────────────────────────

test('Docs_AdrsAcceptedAndReadmeHasBothExamples', () => {
  for (const f of fs.readdirSync(path.join(REPO_ROOT, 'docs', 'adr')).filter((x) => /^000[1-4]-/.test(x))) {
    mustMatch(read('docs', 'adr', f), /^- \*\*Status:\*\* accepted/m, `${f} is accepted`);
  }
  const readme = read('README.md');
  mustMatch(readme, /\*\*Building a Feature\.\*\*/, 'README shows a Feature build');
  mustMatch(readme, /\*\*Building a standalone item\.\*\*/, 'README shows a standalone build');
  // #69: the top diagram is Mermaid text, so it can be checked and kept current; it shows both builds.
  const top = readme.slice(0, readme.indexOf('## Why this exists'));
  mustMatch(top, /```mermaid[\s\S]*\/implement &lt;feature-id&gt;[\s\S]*\/implement #42 --standalone[\s\S]*```/, 'the top diagram shows the Feature and the standalone build');
  assert.doesNotMatch(top, /harness-flow\.png/, 'the old PNG diagram is gone');
  mustMatch(read('CONFIGURE.md'), /## Building with `\/implement`/, 'CONFIGURE explains the build');
  mustMatch(read('ARCHITECTURE.md'), /## Appendix: What building it taught us/, 'ARCHITECTURE records what building taught us');
  assert.doesNotMatch(read('rules', 'progress-tracking.md'), /until F7 retires/, 'progress-tracking no longer waits on F7');
});
