'use strict';
// Private to the scripts module: the checks behind scripts/__tests__/boundaries.test.js.
// Each takes a repo root and returns a list of problem strings naming the module.
// The owner and rules-table checks live here; the Interface-block checks are in ./interface.js and
// the file-pointer checks in ./pointers.js. Everything is re-exported from here.

const fs = require('node:fs');
const path = require('node:path');
const { mdFiles, agentOwners, ...iface } = require('./interface.js');
const pointers = require('./pointers.js');

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

module.exports = {
  agentOwners, checkOwners, checkRulesTable,
  readInterface: iface.readInterface,
  checkInterfaces: iface.checkInterfaces,
  checkAgentOutputs: iface.checkAgentOutputs,
  callersOf: iface.callersOf,
  checkSharedInputs: iface.checkSharedInputs,
  checkSkillUsage: iface.checkSkillUsage,
  namedFiles: pointers.namedFiles,
  checkCallableParts: pointers.checkCallableParts,
  buildPointerIndex: pointers.buildPointerIndex,
};
