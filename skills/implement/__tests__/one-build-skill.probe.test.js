// Probe for F7 #61 "One build skill" (ADR-0001): /story and /run-tasks are retired after a
// line-by-line inventory (#62), their enterprise-only parts live in /implement behind the pack
// (#63), nothing in the repo refers to them any more (#64), and the rules and docs describe the new
// design (#65). The installer's removal on upgrade has its behaviour tests in
// install/__tests__/non-interactive.test.js.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const strip = (text) => text.replace(/\r/g, '');
// What this probe may read: /implement's own files, rules/, docs/, templates/ and the root documents.
const readOwn = (...p) => strip(fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8'));
const readRule = (name) => strip(fs.readFileSync(path.join(REPO_ROOT, 'rules', name), 'utf8'));
const readDocs = (...p) => strip(fs.readFileSync(path.join(REPO_ROOT, 'docs', ...p), 'utf8'));
const readTemplate = (...p) => strip(fs.readFileSync(path.join(REPO_ROOT, 'templates', ...p), 'utf8'));
const readReadme = () => strip(fs.readFileSync(path.join(REPO_ROOT, 'README.md'), 'utf8'));
const IMPLEMENT = readOwn('SKILL.md');

function mustMatch(content, re, message) { assert.ok(content && re.test(content), message); }

// A reference to a retired skill or agent. "/story-runner-agent", "tasks/stories/",
// "story/<sid>-slug" branch names, "issue/story" and a regex such as /story worktree/ are not
// references, so "/story" must start a word and be followed by an id, a flag, punctuation or the end.
const RETIRED = /(?<![\w/])\/story(?![\w/-]| worktree| \d+ is)|\brun-tasks\b|story-plan-agent|skills\/story\//;

// Whether any file anywhere still names them (Retired_NoReferenceOutsideTheAllowedFiles) is a whole-repo
// question, asked in scripts/__tests__/boundaries-repo.test.js.

test('Retired_TheSkillsAndAgentAreGone', () => {
  const listing = { skills: fs.readdirSync(path.join(REPO_ROOT, 'skills')), agents: fs.readdirSync(path.join(REPO_ROOT, 'agents')) };
  for (const p of [['skills', 'story'], ['skills', 'run-tasks'], ['agents', 'story-plan-agent.md']]) {
    assert.ok(!listing[p[0]].includes(p[1]), `${p.join('/')} must be removed`);
  }
  const allowedInReadme = readReadme().split('\n').filter((l) => RETIRED.test(l));
  assert.ok(allowedInReadme.every((l) => /retired/i.test(l)), `README may name them only to say they were retired:\n${allowedInReadme.join('\n')}`);
});

// ── #62 the inventory ────────────────────────────────────────────────

test('Inventory_EveryStoryPhaseAndAgentHasADecision', () => {
  const inv = readDocs('story-retirement-inventory.md');
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
  // What story-pr-agent and the planner say about the pack is asserted in agents/__tests__/agent-text-one-build-skill.test.js.
});

test('Moved_BehavioursThatWereOnlyInStory', () => {
  mustMatch(IMPLEMENT, /Read `YOUR_PROJECT_ROOT\/tasks\/lessons\.md`, or `tasks\/notes\.md`/, 'reads lessons.md first');
  mustMatch(IMPLEMENT, /never auto-push to the default branch/, 'never auto-pushes from the default branch');
  mustMatch(IMPLEMENT, /rendered verbatim into the PR[\s\S]{0,200}or personal or health data/, 'the decisions log holds no personal data');
});

// ── #64 the replacements work ────────────────────────────────────────

test('Replacements_RosterAndInstallerKnowTheOneBuildSkill', () => {
  for (const pack of ['solo', 'enterprise']) {
    const roster = JSON.parse(readTemplate(`harness-roles.${pack}.json`));
    assert.deepStrictEqual(roster.roles.builder.skills, ['implement'], `${pack} roster: the builder runs /implement`);
  }
  // The installer's own retirement list and its calls to removeRetired are asserted in install/__tests__/required-agents.test.js.
});

// ── #65 rules and docs ───────────────────────────────────────────────

test('Docs_AdrsAcceptedAndReadmeHasBothExamples', () => {
  // ADR-0005 (F72 #81) supersedes 0002 and 0003; the files and their bodies stay.
  const adrs = fs.readdirSync(path.join(REPO_ROOT, 'docs', 'adr')).filter((x) => /^000[1-5]-/.test(x));
  assert.equal(adrs.length, 5, `ADRs 0001-0005 all exist: ${adrs.join(', ')}`);
  for (const f of adrs) {
    const superseded = /^000[23]-/.test(f);
    mustMatch(readDocs('adr', f),
      superseded ? /^- \*\*Status:\*\* superseded by ADR-0005/m : /^- \*\*Status:\*\* accepted/m,
      superseded ? `${f} is superseded by ADR-0005` : `${f} is accepted`);
  }
  const readme = readReadme();
  mustMatch(readme, /\*\*Building a Feature\.\*\*/, 'README shows a Feature build');
  mustMatch(readme, /\*\*Building a standalone item\.\*\*/, 'README shows a standalone build');
  // #69: the top diagram is Mermaid text, so it can be checked and kept current; it shows both builds.
  const top = readme.slice(0, readme.indexOf('## Why this exists'));
  mustMatch(top, /```mermaid[\s\S]*\/implement &lt;feature-id&gt;[\s\S]*\/implement #42 --standalone[\s\S]*```/, 'the top diagram shows the Feature and the standalone build');
  assert.doesNotMatch(top, /harness-flow\.png/, 'the old PNG diagram is gone');
  mustMatch(strip(fs.readFileSync(path.join(REPO_ROOT, 'CONFIGURE.md'), 'utf8')), /## Building with `\/implement`/, 'CONFIGURE explains the build');
  mustMatch(strip(fs.readFileSync(path.join(REPO_ROOT, 'ARCHITECTURE.md'), 'utf8')), /## Appendix: What building it taught us/, 'ARCHITECTURE records what building taught us');
  assert.doesNotMatch(readRule('progress-tracking.md'), /until F7 retires/, 'progress-tracking no longer waits on F7');
});
