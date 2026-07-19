#!/usr/bin/env node
// @ts-check
// PreToolUse hook — keeps the repo's advertised inventory honest with its docs.
// Fires only on `git commit` commands. Fail-open: if staged files can't be
// determined, allows the commit.
//
// Two severities:
//
//  HARD BLOCK (deny — objective, cheap to fix):
//   1. A newly-added skill/agent missing its README table row.
//   2. README "N skills" / "N agents" count out of sync with the tree.
//   3. VERSION being changed while CHANGELOG [Unreleased] has no entries —
//      the release gate. This is the answer to "when do I update the
//      changelog?": not every PR, but it MUST be filled before a version bump.
//
//  WARN (soft reminder, does not block — subjective / judgment calls):
//   - CHANGELOG [Unreleased] has no line for a new skill/agent.
//   - A hook or rule was added or removed (consider a CHANGELOG entry).
//   - A skill/agent was removed (update README, CHANGELOG, landing page).
//   - docs/index.html skill/agent count drifted from the tree.
//
// Rationale for the split: countable README facts drift silently and are
// trivial to correct, so they stay hard blocks. Landing-page copy and
// changelog prose are judgment calls — a warning respects the author without
// training them to resent a gate that false-positives.

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { readStdinJson, deny, injectContext, ok, runHook } = require('./lib/hook-io');

function git(args) {
  try { return execFileSync('git', args, { encoding: 'utf8' }).trim(); }
  catch { return ''; }
}

function repoRoot() {
  return git(['rev-parse', '--show-toplevel']) || process.cwd();
}

function splitLines(s) {
  return s ? s.split('\n').filter(Boolean) : [];
}

// ── inventory classifiers (repo-relative POSIX paths) ────────────────────
const isSkillFile = (f) => /^skills\/[^/]+\/SKILL\.md$/.test(f);
const isAgentFile = (f) => /^agents\/[^/]+\.md$/.test(f);
const isHookFile = (f) => /^hooks\/[^/]+\.js$/.test(f); // top-level only; excludes lib/ and __tests__/
const isRuleFile = (f) => /^rules\/[^/]+\.md$/.test(f);

function countAgents(root) {
  const dir = path.join(root, 'agents');
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir).filter((f) => f.endsWith('.md')).length;
}

function countSkills(root) {
  const dir = path.join(root, 'skills');
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir).filter((d) =>
    fs.existsSync(path.join(dir, d, 'SKILL.md'))
  ).length;
}

// Reads a plate count from the landing page: <div class="num">34</div><div class="what">Skills</div>
function landingCount(html, word) {
  const re = new RegExp('class="num">\\s*(\\d+)\\s*</div>\\s*<div class="what">\\s*' + word, 'i');
  const m = html.match(re);
  return m ? parseInt(m[1], 10) : null;
}

// True when the [Unreleased] section has no bullet entries (release gate).
function unreleasedIsEmpty(changelog) {
  const m = changelog.match(/##\s*\[Unreleased\][^\n]*\n([\s\S]*?)(?=\n##\s|\n---|$)/i);
  if (!m) return true; // no [Unreleased] section at all → treat as needing entries
  return !/^\s*[-*]\s+\S/m.test(m[1]);
}

runHook('inventory-check', async () => {
  const input = await readStdinJson();
  const command = (input.tool_input && input.tool_input.command) || '';

  if (!/\bgit\s+commit\b/i.test(command)) return ok();

  const root = repoRoot();
  const readmePath = path.join(root, 'README.md');
  const changelogPath = path.join(root, 'CHANGELOG.md');

  if (!fs.existsSync(readmePath) || !fs.existsSync(changelogPath)) return ok();

  const stagedAll = splitLines(git(['diff', '--cached', '--name-only']));
  const stagedAdded = splitLines(git(['diff', '--cached', '--name-only', '--diff-filter=A']));
  const stagedDeleted = splitLines(git(['diff', '--cached', '--name-only', '--diff-filter=D']));

  const newAgents = stagedAdded.filter(isAgentFile);
  const newSkills = stagedAdded.filter(isSkillFile);
  const newHooks = stagedAdded.filter(isHookFile);
  const newRules = stagedAdded.filter(isRuleFile);
  const removedAgents = stagedDeleted.filter(isAgentFile);
  const removedSkills = stagedDeleted.filter(isSkillFile);
  const removedHooks = stagedDeleted.filter(isHookFile);
  const removedRules = stagedDeleted.filter(isRuleFile);

  const versionBumped = stagedAll.includes('VERSION');
  const inventoryTouched =
    newAgents.length || newSkills.length || newHooks.length || newRules.length ||
    removedAgents.length || removedSkills.length || removedHooks.length || removedRules.length;

  if (!inventoryTouched && !versionBumped) return ok();

  const readme = fs.readFileSync(readmePath, 'utf8');
  const changelog = fs.readFileSync(changelogPath, 'utf8');
  const landingPath = path.join(root, 'docs', 'index.html');
  const landing = fs.existsSync(landingPath) ? fs.readFileSync(landingPath, 'utf8') : null;

  const hardProblems = [];
  const warnings = [];

  // ── Agents: HARD table row + count, WARN changelog entry ────────────────
  for (const agentFile of newAgents) {
    const name = path.basename(agentFile, '.md');
    const tableRow = new RegExp('\\|\\s*`' + escapeRegex(name) + '`\\s*\\|');
    if (!tableRow.test(readme)) {
      hardProblems.push(`README.md agent table missing row for \`${name}\``);
    }
    if (!changelog.includes(name)) {
      warnings.push(`CHANGELOG.md [Unreleased] has no entry for new agent \`${name}\``);
    }
  }
  if (newAgents.length || removedAgents.length) {
    const actual = countAgents(root);
    const m = readme.match(/(\d+)\s+agents/);
    if (m && parseInt(m[1], 10) !== actual) {
      hardProblems.push(`README.md says ${m[1]} agents but agents/ has ${actual} .md files`);
    }
    if (landing) {
      const lc = landingCount(landing, 'Agents');
      if (lc !== null && lc !== actual) {
        warnings.push(`docs/index.html shows ${lc} Agents but agents/ has ${actual}`);
      }
    }
  }

  // ── Skills: HARD count, WARN changelog entry ────────────────────────────
  for (const skillFile of newSkills) {
    const skillName = skillFile.split('/')[1];
    if (!changelog.includes(skillName)) {
      warnings.push(`CHANGELOG.md [Unreleased] has no entry for new skill \`${skillName}\``);
    }
  }
  if (newSkills.length || removedSkills.length) {
    const actual = countSkills(root);
    const m = readme.match(/(\d+)\s+skills/);
    if (m && parseInt(m[1], 10) !== actual) {
      hardProblems.push(`README.md says ${m[1]} skills but skills/ has ${actual}`);
    }
    if (landing) {
      const lc = landingCount(landing, 'Skills');
      if (lc !== null && lc !== actual) {
        warnings.push(`docs/index.html shows ${lc} Skills but skills/ has ${actual}`);
      }
    }
  }

  // ── WARN: removed skills/agents ─────────────────────────────────────────
  for (const f of removedSkills) {
    warnings.push(`Skill \`${f.split('/')[1]}\` removed — update README, CHANGELOG, and docs/index.html`);
  }
  for (const f of removedAgents) {
    warnings.push(`Agent \`${path.basename(f, '.md')}\` removed — update README, CHANGELOG, and docs/index.html`);
  }

  // ── WARN: new/removed hooks & rules ─────────────────────────────────────
  for (const f of newHooks) warnings.push(`New hook \`${path.basename(f)}\` — consider a CHANGELOG [Unreleased] entry`);
  for (const f of removedHooks) warnings.push(`Hook \`${path.basename(f)}\` removed — consider a CHANGELOG [Unreleased] entry`);
  for (const f of newRules) warnings.push(`New rule \`${path.basename(f)}\` — consider a CHANGELOG [Unreleased] entry`);
  for (const f of removedRules) warnings.push(`Rule \`${path.basename(f)}\` removed — consider a CHANGELOG [Unreleased] entry`);

  // ── HARD: release gate — VERSION bumped but [Unreleased] empty ──────────
  if (versionBumped && unreleasedIsEmpty(changelog)) {
    hardProblems.push('VERSION is being changed but CHANGELOG [Unreleased] has no entries — fill it before cutting a release');
  }

  if (hardProblems.length) {
    let reason =
      'Inventory check failed — fix before committing:\n' +
      hardProblems.map((p) => '  - ' + p).join('\n');
    if (warnings.length) {
      reason +=
        '\n\nAlso worth updating (not blocking):\n' +
        warnings.map((w) => '  - ' + w).join('\n');
    }
    deny(reason, 'inventory-check');
  }

  if (warnings.length) {
    injectContext(
      'PreToolUse',
      'Docs reminder (not blocking) — ' + warnings.join('; ') + '.'
    );
  }

  return ok();
});

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
