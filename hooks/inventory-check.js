#!/usr/bin/env node
// @ts-check
// PreToolUse hook — validates README/CHANGELOG consistency when committing
// new agents, skills, or hooks. Only fires on `git commit` commands.
// Fail-open: if staged files can't be determined, allows the commit.

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { readStdinJson, deny, ok, runHook } = require('./lib/hook-io');

function git(args) {
  try { return execFileSync('git', args, { encoding: 'utf8' }).trim(); }
  catch { return ''; }
}

function repoRoot() {
  return git(['rev-parse', '--show-toplevel']) || process.cwd();
}

runHook('inventory-check', async () => {
  const input = await readStdinJson();
  const command = (input.tool_input && input.tool_input.command) || '';

  if (!/\bgit\s+commit\b/i.test(command)) return ok();

  const root = repoRoot();
  const readmePath = path.join(root, 'README.md');
  const changelogPath = path.join(root, 'CHANGELOG.md');

  if (!fs.existsSync(readmePath) || !fs.existsSync(changelogPath)) return ok();

  const staged = git(['diff', '--cached', '--name-only', '--diff-filter=A']);
  if (!staged) return ok();

  const stagedFiles = staged.split('\n').filter(Boolean);
  const newAgents = stagedFiles.filter(f => f.startsWith('agents/') && f.endsWith('.md'));
  const newSkills = stagedFiles.filter(f => f.match(/^skills\/[^/]+\/SKILL\.md$/));

  if (!newAgents.length && !newSkills.length) return ok();

  const readme = fs.readFileSync(readmePath, 'utf8');
  const changelog = fs.readFileSync(changelogPath, 'utf8');
  const problems = [];

  for (const agentFile of newAgents) {
    const name = path.basename(agentFile, '.md');

    const tableRow = new RegExp('\\|\\s*`' + escapeRegex(name) + '`\\s*\\|');
    if (!tableRow.test(readme)) {
      problems.push(`README.md agent table missing row for \`${name}\``);
    }

    if (!changelog.includes(name)) {
      problems.push(`CHANGELOG.md [Unreleased] missing entry for \`${name}\``);
    }
  }

  if (newAgents.length) {
    const agentDir = path.join(root, 'agents');
    if (fs.existsSync(agentDir)) {
      const actualCount = fs.readdirSync(agentDir).filter(f => f.endsWith('.md')).length;
      const countMatch = readme.match(/(\d+)\s+agents/);
      if (countMatch) {
        const readmeCount = parseInt(countMatch[1], 10);
        if (readmeCount !== actualCount) {
          problems.push(`README.md says ${readmeCount} agents but agents/ has ${actualCount} .md files`);
        }
      }
    }
  }

  for (const skillFile of newSkills) {
    const skillName = skillFile.split('/')[1];

    if (!changelog.includes(skillName)) {
      problems.push(`CHANGELOG.md [Unreleased] missing entry for skill \`${skillName}\``);
    }
  }

  if (newSkills.length) {
    const skillsDir = path.join(root, 'skills');
    if (fs.existsSync(skillsDir)) {
      const actualCount = fs.readdirSync(skillsDir).filter(d => {
        const skillPath = path.join(skillsDir, d, 'SKILL.md');
        return fs.existsSync(skillPath);
      }).length;
      const countMatch = readme.match(/(\d+)\s+skills/);
      if (countMatch) {
        const readmeCount = parseInt(countMatch[1], 10);
        if (readmeCount !== actualCount) {
          problems.push(`README.md says ${readmeCount} skills but skills/ has ${actualCount}`);
        }
      }
    }
  }

  if (problems.length) {
    deny(
      'Inventory check failed — update these before committing:\n' +
      problems.map(p => '  - ' + p).join('\n'),
      'inventory-check'
    );
  }

  return ok();
});

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
