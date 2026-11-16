'use strict';
// Private to the scripts module: the code-module README checks behind scripts/__tests__/boundaries-*.test.js
// (rules/modules.md, "Where an interface is written"). Each takes a repo root and returns problem strings.

const fs = require('node:fs');
const path = require('node:path');
const { readInterface, PART_LABELS } = require('./interface.js');
const { checkOptions } = require('./common.js');

const CODE_MODULES = ['hooks', 'trackers', 'code-platform', 'install', 'scripts'];
// Folders the require scan does not enter. node_modules and .git are skipped at any depth. tasks, .claude
// and _local are skipped only at the repo root, where they hold run state, installed copies and scratch;
// a nested folder that happens to share the name (skills/x/tasks/) is real code and is scanned.
const SKIP_ANYWHERE = new Set(['node_modules', '.git']);
const SKIP_AT_ROOT = new Set(['tasks', '.claude', '_local']);
// __tests__ is skipped at any depth: a test is not a requirer of a module's interface, it is checked
// against it ("Tests check the interface" in rules/modules.md).
const TEST_DIR = '__tests__';

// The purpose line is the first non-blank line under the `# ` title.
function purposeLine(text) {
  const lines = text.split(/\r?\n/);
  const title = lines.findIndex((l) => /^# \S/.test(l));
  if (title === -1) return '';
  const next = lines.slice(title + 1).find((l) => l.trim() !== '');
  return next && !/^#/.test(next) ? next.trim() : '';
}

function checkReadmes(root, options = {}) {
  checkOptions(options);
  const problems = [];
  for (const mod of CODE_MODULES) {
    const file = path.join(root, mod, 'README.md');
    if (!fs.existsSync(file)) {
      problems.push(`${mod}/README.md: missing`);
      continue;
    }
    const text = fs.readFileSync(file, 'utf8');
    if (!purposeLine(text)) problems.push(`${mod}/README.md: no purpose line under the title`);
    const iface = readInterface(text);
    if (!iface.found) {
      problems.push(`${mod}/README.md: no ## Interface section`);
      continue;
    }
    for (const [part, key] of Object.entries(PART_LABELS)) {
      if (!iface.parts[key]) problems.push(`${mod}/README.md: Interface part "${part}" is missing or empty`);
    }
  }
  return problems;
}

function jsFiles(dir, rel = '') {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_ANYWHERE.has(e.name) || e.name === TEST_DIR || (!rel && SKIP_AT_ROOT.has(e.name))) continue;
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...jsFiles(path.join(dir, e.name), r));
    else if (/\.(js|cjs|mjs)$/.test(e.name)) out.push(r);
  }
  return out;
}

const moduleOf = (rel) => rel.split('/')[0];

const lineOf = (text, index) => text.slice(0, index).split('\n').length;
const isRelative = (spec) => /^\.{1,2}\//.test(spec);

// Every require, require.resolve, import() and static import/export-from in a file's text:
// { line, spec } for a string-literal argument, { line, spec: null } for any other argument.
function scanRequires(text) {
  const out = [];
  // An argument cannot start with `?`, so this skips the `(?:` of a regex group that follows the word.
  const call = /(?<![.\w$])(?:require(?:\.resolve)?|import)\s*\(\s*(?:(['"])([^'"\n]*)\1\s*[,)]|[^\s)?])/g;
  let m;
  while ((m = call.exec(text))) out.push({ line: lineOf(text, m.index), spec: m[2] === undefined ? null : m[2] });
  const from = /(?:^|[;}\n])\s*(?:import|export)\s+[\w$*{}\s,]+?\s+from\s*(['"])([^'"\n]+)\1/g;
  while ((m = from.exec(text))) out.push({ line: lineOf(text, m.index + m[0].search(/\S/)), spec: m[2] });
  const bare = /(?:^|[;}\n])\s*import\s*(['"])([^'"\n]+)\1/g;
  while ((m = bare.exec(text))) out.push({ line: lineOf(text, m.index + m[0].search(/\S/)), spec: m[2] });
  return out;
}

// Resolve a relative specifier from `rel` to a file under root, or null (missing, or outside the root).
function resolveTarget(root, rel, spec) {
  const target = path.posix.normalize(path.posix.join(path.posix.dirname(rel), spec));
  if (target.startsWith('../') || target === '..') return null;
  const abs = (t) => path.join(root, t);
  const isFile = (t) => fs.existsSync(abs(t)) && fs.statSync(abs(t)).isFile();
  for (const t of [target, `${target}.js`, `${target}/index.js`]) if (isFile(t)) return t;
  return null;
}

// Files in `module` that code in another folder requires by a relative string-literal path.
function requiredExports(root, module) {
  const found = new Map();
  for (const rel of jsFiles(root)) {
    if (moduleOf(rel) === module) continue;
    for (const { spec } of scanRequires(fs.readFileSync(path.join(root, rel), 'utf8'))) {
      if (spec === null || !isRelative(spec)) continue;
      const target = resolveTarget(root, rel, spec);
      if (!target || moduleOf(target) !== module || target.split('/').length < 2) continue;
      if (!found.has(target)) found.set(target, new Set());
      found.get(target).add(rel);
    }
  }
  return [...found].sort(([a], [b]) => a.localeCompare(b))
    .map(([file, by]) => ({ file, requiredBy: [...by].sort() }));
}

// A require whose argument is not a string literal cannot be resolved, so a cross-module use through it
// would never reach the Callable parts check. Each one is a problem naming the file and line.
function unresolvedRequires(root) {
  const problems = [];
  for (const rel of jsFiles(root)) {
    for (const { line, spec } of scanRequires(fs.readFileSync(path.join(root, rel), 'utf8'))) {
      if (spec === null) problems.push(`${rel}:${line}: cannot check a non-literal require: use a string-literal relative path`);
    }
  }
  return problems;
}

function checkReadmeCallable(root, options = {}) {
  checkOptions(options);
  const problems = unresolvedRequires(root);
  for (const mod of CODE_MODULES) {
    const file = path.join(root, mod, 'README.md');
    const callable = fs.existsSync(file) ? readInterface(fs.readFileSync(file, 'utf8')).parts.callable : '';
    for (const { file: target, requiredBy } of requiredExports(root, mod)) {
      const inModule = target.slice(mod.length + 1);
      if (!callable.includes(`\`${inModule}\``) && !callable.includes(`\`${target}\``)) {
        problems.push(`${mod}/README.md: Callable parts does not list ${target} (required by ${requiredBy.join(', ')})`);
      }
    }
  }
  return problems;
}

module.exports = { CODE_MODULES, checkReadmes, requiredExports, checkReadmeCallable };
