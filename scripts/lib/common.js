'use strict';
// Private to the scripts module: the generic helpers the check families share. Nothing here knows what
// an Interface block, an ADR or the architecture map is.

const fs = require('node:fs');
const path = require('node:path');

// A `/` or a name must not follow one of these: it would be part of a path (`skills/debug/...`).
const PATH_BOUNDARY = '(?<![A-Za-z0-9_./-])';

// The `.md` files directly in a folder, sorted; a missing folder has none.
function mdFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort();
}

// The folder names under skills/, sorted; a repo with no skills/ has none.
function skillFolders(root) {
  const dir = path.join(root, 'skills');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
}

// For each line, true when it is inside a ``` code fence or is a fence line itself.
function fenceMask(lines) {
  let fenced = false;
  return lines.map((l) => {
    if (/^\s*```/.test(l)) { fenced = !fenced; return true; }
    return fenced;
  });
}

// Lines outside ``` code fences.
function unfenced(lines) {
  const mask = fenceMask(lines);
  return lines.filter((_, i) => !mask[i]);
}

// The one option a check takes is `exempt`, the skill folders whose block is not required. Any other
// key is refused by name, so a second list cannot come back under another name. Every exported check
// calls this first, even one with nothing to exempt.
function checkOptions(options = {}) {
  const unknown = Object.keys(options).filter((k) => k !== 'exempt');
  if (unknown.length) throw new Error(`unknown check option "${unknown[0]}": a check takes only exempt`);
}

// The exempt skill folders as a set. Call checkOptions first: this does not validate.
function exemptSet(options = {}) {
  return new Set(options.exempt || []);
}

module.exports = { PATH_BOUNDARY, mdFiles, skillFolders, fenceMask, unfenced, checkOptions, exemptSet };
