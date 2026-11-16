'use strict';
// Private to the scripts module: the checks behind scripts/__tests__/boundaries.test.js.
// Each takes a repo root and returns a list of problem strings naming the module.

const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('../../hooks/lib/frontmatter.js');

function mdFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort();
}

function agentFiles(root) {
  return mdFiles(path.join(root, 'agents'));
}

function agentOwners(root) {
  return agentFiles(root).map((file) => {
    const fm = parse(fs.readFileSync(path.join(root, 'agents', file), 'utf8'));
    return { name: file.replace(/\.md$/, ''), owner: fm.owner };
  });
}

function checkOwners(root) {
  const problems = [];
  for (const { name, owner } of agentOwners(root)) {
    const file = `agents/${name}.md`;
    if (!owner) {
      problems.push(`${file}: no owner:`);
      continue;
    }
    const known = owner === 'shared' || owner === 'person' ||
      (/^[a-z0-9-]+$/.test(owner) && fs.existsSync(path.join(root, 'skills', owner, 'SKILL.md')));
    if (!known) problems.push(`${file}: owner "${owner}" is not a skill, shared or person`);
  }
  return problems;
}

function rulesSection(readme) {
  const start = readme.search(/^## Rules\s*$/m);
  if (start === -1) return '';
  const afterHeading = readme.indexOf('\n', start);
  const rest = afterHeading === -1 ? '' : readme.slice(afterHeading);
  const end = rest.search(/\n(?:## |---\s*(?:\n|$))/);
  return end === -1 ? rest : rest.slice(0, end);
}

function checkRulesTable(root) {
  const readmePath = path.join(root, 'README.md');
  const section = fs.existsSync(readmePath) ? rulesSection(fs.readFileSync(readmePath, 'utf8')) : '';
  return mdFiles(path.join(root, 'rules'))
    .filter((rule) => !section.includes(`\`${rule}\``))
    .map((rule) => `README.md: rules section does not list rules/${rule}`);
}

module.exports = { agentOwners, checkOwners, checkRulesTable };
