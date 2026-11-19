'use strict';
// Private to the scripts module: check 5, tests stay in their lane (rules/modules.md, "Tests check the
// interface"), and interfaceOf, the way a test reads another module's Interface block.
// A test file reads only its own module's files, rules/, files that belong to no module (root docs, docs/,
// templates/, examples/, CONTEXT.md) and other modules' ## Interface blocks. A relative require of another
// module's file must name a file that module's Interface lists. The boundary check's own files read module
// bodies by the rule's carve-out, and tests in agents/__tests__/ belong to agents/ and read any agent's file.

const fs = require('node:fs');
const path = require('node:path');
const { checkOptions, fenceMask } = require('./common.js');
const { readInterface } = require('./interface.js');
const { CODE_MODULES, resolveTarget } = require('./readmes.js');
const { fileContext, readsOf, requiresOf } = require('./testpaths.js');

const SKIP_ANYWHERE = new Set(['node_modules', '.git']);
const SKIP_AT_ROOT = new Set(['tasks', '.claude', '_local']);

// The boundary check's own files (the rule's carve-out): they read module bodies to check them.
const isBoundaryCheck = (rel) =>
  rel.startsWith('scripts/lib/') || rel === 'scripts/__tests__/helpers.js' || /^scripts\/__tests__\/boundaries-[^/]*\.test\.js$/.test(rel);

// Every .js file inside a __tests__ folder: the tests and the helpers they require.
function testFiles(root) {
  const out = [];
  const walk = (dir, rel, inTests) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (SKIP_ANYWHERE.has(e.name) || (!rel && SKIP_AT_ROOT.has(e.name))) continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(dir, e.name), r, inTests || e.name === '__tests__');
      else if (inTests && e.isFile() && e.name.endsWith('.js')) out.push(r);
    }
  };
  if (fs.existsSync(root)) walk(root, '', false);
  return out.sort();
}

// What a repo-relative path is: { module } for a module's file, { open: true } for rules/ and for files
// that belong to no module, { listing } for the skills/ or agents/ folder itself.
function classify(rel) {
  const segs = rel.split('/').filter(Boolean);
  if (segs[0] === '.claude') {
    const inner = classify(segs.slice(1).join('/'));
    return inner.module ? { ...inner, copy: true } : { open: true };
  }
  if (segs[0] === 'skills') return segs.length === 1 ? { listing: 'skills' } : { module: `skills/${segs[1]}` };
  if (segs[0] === 'agents') {
    if (segs.length === 1) return { listing: 'agents' };
    if (segs[1] === '__tests__' || !segs[1].endsWith('.md')) return { module: 'agents' };
    return { module: `agents/${segs[1].replace(/\.md$/, '')}` };
  }
  if (CODE_MODULES.includes(segs[0])) return { module: segs[0] };
  return { open: true };
}

// The module a test file belongs to.
const ownerOf = (rel) => classify(rel).module || null;

const isAgentsTest = (owner) => owner === 'agents';
const inAgents = (module) => module === 'agents' || module.startsWith('agents/');

// The Interface block of a module: skills/<x> in its SKILL.md, agents/<x> in its .md, a code module in
// its README.md. The text from the `## Interface` heading to the next heading or `---` line.
function interfaceFile(id) {
  if (id.startsWith('skills/')) return `${id}/SKILL.md`;
  if (id.startsWith('agents/')) return `${id}.md`;
  return `${id}/README.md`;
}

function interfaceOf(root, id) {
  const file = path.join(root, interfaceFile(String(id)));
  if (!fs.existsSync(file)) throw new Error(`${id}: no Interface block (${interfaceFile(String(id))} is missing)`);
  const text = fs.readFileSync(file, 'utf8');
  if (!readInterface(text).found) throw new Error(`${id}: no Interface block in ${interfaceFile(String(id))}`);
  const lines = text.split(/\r?\n/);
  const fenced = fenceMask(lines);
  const start = lines.findIndex((l, i) => !fenced[i] && /^## Interface\s*$/.test(l));
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^(## |# |---)/.test(lines[i])) { end = i; break; }
  }
  return lines.slice(start, end).join('\n').trim();
}

// The Callable parts a module lists, or '' when it has no Interface block.
function callableOf(root, module, cache) {
  if (!cache.has(module)) {
    const file = path.join(root, interfaceFile(module));
    cache.set(module, fs.existsSync(file) ? readInterface(fs.readFileSync(file, 'utf8')).parts.callable : '');
  }
  return cache.get(module);
}

const NON_LITERAL = 'cannot check a non-literal path';
const THROUGH = 'read its Interface through interfaceOf';

// The problem for one path a test reads, or null. `value` comes from ./testpaths.js.
function readProblem(file, line, value, owner) {
  const at = `${file}:${line}`;
  if (value.k === 'unknown') return `${at}: ${NON_LITERAL}`;
  if (value.k !== 'repo') return null;
  const c = classify(value.p);
  const shown = value.full ? value.p : `${value.p ? `${value.p}/` : ''}...`;
  if (!value.full && !value.p) return `${at}: ${NON_LITERAL}`;
  if (c.open) return null;
  if (c.listing) {
    if (value.full || (isAgentsTest(owner) && c.listing === 'agents')) return null;
    return `${at}: ${NON_LITERAL}`;
  }
  if (c.module === owner || (isAgentsTest(owner) && inAgents(c.module))) return null;
  const copy = c.copy ? ' (an installed copy)' : '';
  return `${at}: reads ${shown} inside ${c.module}${copy}; ${THROUGH}`;
}

function requireProblem(root, file, line, req, owner, cache) {
  const at = `${file}:${line}`;
  let target;
  if (req.spec !== undefined) {
    if (!/^\.{1,2}\//.test(req.spec)) return null;
    target = resolveTarget(root, file, req.spec);
  } else if (req.value.k === 'unknown') {
    return `${at}: ${NON_LITERAL}`;
  } else if (req.value.k === 'repo' && req.value.full) {
    target = [req.value.p, `${req.value.p}.js`, `${req.value.p}/index.js`]
      .find((t) => fs.existsSync(path.join(root, t)) && fs.statSync(path.join(root, t)).isFile()) || null;
  }
  if (!target) return null;
  const c = classify(target);
  if (c.open || c.listing || c.module === owner) return null;
  const inModule = target.slice(c.module.length + 1);
  const callable = callableOf(root, c.module, cache);
  if (callable.includes(`\`${inModule}\``) || callable.includes(`\`${target}\``)) return null;
  return `${at}: requires ${target} inside ${c.module}, whose Interface does not list it`;
}

// check 5. Returns one problem per read of another module's insides, `<test>:<line>: reads <path> inside
// <module>; read its Interface through interfaceOf`, and one per path it cannot resolve statically,
// `<test>:<line>: cannot check a non-literal path`. A repeat of the same read in one file is reported once.
// The options object takes `exempt` like every check; no skill is exempt from this one.
function checkTestReads(root, options = {}) {
  checkOptions(options);
  const problems = [];
  const files = new Map();
  const callables = new Map();
  for (const rel of testFiles(root)) {
    if (isBoundaryCheck(rel)) continue;
    const owner = ownerOf(rel);
    const ctx = fileContext(root, rel, files);
    const seen = new Set();
    const add = (line, problem) => {
      if (!problem) return;
      const key = problem.includes(NON_LITERAL) ? problem : problem.slice(problem.indexOf(': ', rel.length + 1));
      if (seen.has(key)) return;
      seen.add(key);
      problems.push(problem);
    };
    for (const { line, value } of readsOf(ctx)) add(line, readProblem(rel, line, value, owner));
    for (const req of requiresOf(ctx)) add(req.line, requireProblem(root, rel, req.line, req, owner, callables));
  }
  return problems;
}

module.exports = { checkTestReads, interfaceOf };
