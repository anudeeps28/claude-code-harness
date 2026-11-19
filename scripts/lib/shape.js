'use strict';
// Private to the scripts module: check 4, every module has the standard shape (rules/modules.md,
// "Every module has the same shape"). A skill folder holds only SKILL.md, bin/, reference/, templates/
// and __tests__/; agents/ holds only <name>.md files and __tests__/; a code module holds only README.md,
// lib/, __tests__/ and the top-level names its `## Interface` block mentions. rules/, templates/, docs/
// and examples/ are never modules. Hidden OS files (.DS_Store) are ignored, and no other dot entry.

const fs = require('node:fs');
const path = require('node:path');
const { checkOptions, exemptSet, skillFolders } = require('./common.js');
const { readInterface } = require('./interface.js');
const { CODE_MODULES } = require('./readmes.js');

const SKILL_ENTRIES = new Set(['SKILL.md', 'bin', 'reference', 'templates', '__tests__']);
const CODE_ENTRIES = new Set(['README.md', 'lib', '__tests__']);
const IGNORED = new Set(['.DS_Store']);

const odd = (rel) => `${rel}: not part of the standard shape (rules/modules.md)`;

function entries(dir) {
  return fs.readdirSync(dir).filter((n) => !IGNORED.has(n)).sort();
}

// Whole names inside backticks in the Interface block (never substrings, never plain prose words): `ado/` names ado, `lib/walk.js` names lib and walk.js.
function namesInInterface(readmePath) {
  const parts = readInterface(fs.readFileSync(readmePath, 'utf8')).parts;
  const text = Object.values(parts).join('\n');
  const names = new Set();
  for (const [, code] of text.matchAll(/`([^`\n]+)`/g)) {
    for (const raw of code.split(/[^A-Za-z0-9_.-]+/)) {
      const name = raw.replace(/^[.-]+|[.-]+$/g, '');
      if (name) names.add(name);
    }
  }
  return names;
}

function checkShape(root, options = {}) {
  checkOptions(options);
  const exe = exemptSet(options);
  const problems = [];
  for (const name of skillFolders(root)) {
    if (exe.has(name)) continue;
    for (const e of entries(path.join(root, 'skills', name))) {
      if (!SKILL_ENTRIES.has(e)) problems.push(odd(`skills/${name}/${e}`));
    }
  }
  const agentsDir = path.join(root, 'agents');
  if (fs.existsSync(agentsDir)) {
    for (const e of entries(agentsDir)) {
      const ok = e === '__tests__' || (e.endsWith('.md') && fs.statSync(path.join(agentsDir, e)).isFile());
      if (!ok) problems.push(odd(`agents/${e}`));
    }
  }
  for (const mod of CODE_MODULES) {
    const dir = path.join(root, mod);
    if (!fs.existsSync(dir)) continue;
    const readme = path.join(dir, 'README.md');
    if (!fs.existsSync(readme)) {
      problems.push(`${mod}: no README.md`);
      continue;
    }
    const named = namesInInterface(readme);
    for (const e of entries(dir)) {
      if (!CODE_ENTRIES.has(e) && !named.has(e)) problems.push(odd(`${mod}/${e}`));
    }
  }
  return problems;
}

module.exports = { checkShape };
