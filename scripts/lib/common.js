'use strict';
// Private to the scripts module: the generic helpers the check families share. Nothing here knows what
// an Interface block, an ADR or the architecture map is.

const fs = require('node:fs');
const path = require('node:path');

// A `/` or a name must not follow one of these: it would be part of a path (`skills/debug/...`).
const PATH_BOUNDARY = '(?<![A-Za-z0-9_./-])';

// Text as a literal inside a RegExp.
function escapeRe(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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

// A line that starts an agent: it has a start verb (spawn, launch, start, run), it introduces the agent
// as "Agent <X>:" or "Agent <X> —", or the line before has a start verb (the name on the next line).
const START_VERB_RE = /\b(?:spawn|launch|start|run)(?:s|es|ed|ing)?\b/i;
const AGENT_INTRO_RE = /\bAgent [A-Z0-9]+\s*[:—–-]/;
function isLaunchLine(lines, i) {
  return START_VERB_RE.test(lines[i]) || AGENT_INTRO_RE.test(lines[i]) || (i > 0 && START_VERB_RE.test(lines[i - 1]));
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

// The markdown files that make file and heading pointers (check 2): every .md under skills/ (tests
// excluded), agents/*.md and rules/*.md. Each is { rel, lines } with the lines inside ``` code fences
// blanked, so a line number is still the real one. A file over 2 MB is skipped.
const MAX_POINTER_BYTES = 2 * 1024 * 1024;

function* mdUnder(dir) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '__tests__' || e.name === 'node_modules' || e.name === '.git') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* mdUnder(full);
    else if (e.isFile() && e.name.endsWith('.md')) yield full;
  }
}

function pointerSources(root) {
  const files = [
    ...mdUnder(path.join(root, 'skills')),
    ...mdFiles(path.join(root, 'agents')).map((f) => path.join(root, 'agents', f)),
    ...mdFiles(path.join(root, 'rules')).map((f) => path.join(root, 'rules', f)),
  ];
  return files.filter((f) => fs.statSync(f).size <= MAX_POINTER_BYTES).map((f) => {
    const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
    const mask = fenceMask(lines);
    return {
      rel: path.relative(root, f).split(path.sep).join('/'),
      lines: lines.map((l, i) => (mask[i] ? '' : l)),
    };
  });
}

module.exports = { PATH_BOUNDARY, escapeRe, mdFiles, skillFolders, fenceMask, unfenced, checkOptions, exemptSet, pointerSources, isLaunchLine };
