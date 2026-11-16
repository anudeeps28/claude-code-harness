'use strict';
// Private to the scripts module: the ADR checks (rules/modules.md, "The boundary check", check 7).
// Each takes a repo root and returns a list of problem strings naming the module or ADR at fault.

const fs = require('node:fs');
const path = require('node:path');
const { readInterface, listModules } = require('./interface.js');
const { mdFiles, unfenced, checkOptions, exemptSet } = require('./common.js');
const { CODE_MODULES } = require('./readmes.js');

const PLACEHOLDER = '[module, module]';

// The module ids an ADR's Modules: line may name: skill folders, agent names and the code modules.
function moduleIds(root) {
  return [...new Set([...listModules(root).map((m) => m.name), ...CODE_MODULES])].sort();
}

// The one parser of an ADR's (or the template's) header: the lines before the first `## `, outside
// code fences. Returns the raw text of each `- **Name:**` field, or null when it is absent.
function readHeader(text) {
  const lines = unfenced(text.split(/\r?\n/));
  const end = lines.findIndex((l) => /^## /.test(l));
  const header = end === -1 ? lines : lines.slice(0, end);
  const field = (name) => {
    const m = header.map((l) => new RegExp(`^- \\*\\*${name}:\\*\\*\\s*(.*)$`).exec(l)).find(Boolean);
    return m ? m[1].trim() : null;
  };
  return { status: field('Status'), modules: field('Modules') };
}

const STATUSES = ['proposed', 'accepted', 'superseded'];

// The first word of a Status, lower-cased, with decoration (`**Superseded**`) stripped; null if empty.
function statusWord(status) {
  if (!status) return null;
  const first = status.trim().split(/[\s(:|]/)[0].replace(/^[*_`]+|[*_`.,;]+$/g, '').toLowerCase();
  return first || null;
}

// The module ids a Modules value names (empty list for `,` or blank).
const moduleList = (value) => value.split(',').map((s) => s.trim()).filter(Boolean);

// Every ADR in docs/adr: the numbered ones as { number, file, status, word, modules }, and the problems
// found reading the folder (a stray file, a duplicate number, a missing or unknown Status).
function readAdrs(root) {
  const dir = path.join(root, 'docs', 'adr');
  const adrs = [];
  const problems = [];
  const seen = new Map();
  for (const f of mdFiles(dir)) {
    const file = `docs/adr/${f}`;
    if (f === 'README.md') continue;
    if (!/^\d{4}-.+\.md$/.test(f)) {
      problems.push(`${file}: is not README.md and is not named NNNN-*.md`);
      continue;
    }
    const number = f.slice(0, 4);
    if (seen.has(number)) {
      problems.push(`${file}: ADR-${number} is also ${seen.get(number)}`);
      continue;
    }
    seen.set(number, file);
    const h = readHeader(fs.readFileSync(path.join(dir, f), 'utf8'));
    const word = statusWord(h.status);
    if (!word) problems.push(`${file}: no - **Status:** line in the header`);
    else if (!STATUSES.includes(word)) problems.push(`${file}: Status "${h.status}" does not start with proposed, accepted or superseded`);
    adrs.push({ number, file, status: h.status || '', word, modules: h.modules });
  }
  return { adrs, problems };
}

function checkAdrModules(root, options = {}) {
  // Refuses an unknown option by name; this check has nothing to exempt, because it reads ADRs, not
  // Interface blocks.
  checkOptions(options);
  const known = new Set(moduleIds(root));
  const { adrs, problems } = readAdrs(root);
  for (const a of adrs) {
    if (a.modules === null || a.modules === '') {
      problems.push(`${a.file}: no - **Modules:** line in the header`);
      continue;
    }
    if (a.modules === PLACEHOLDER) {
      problems.push(`${a.file}: Modules is the template placeholder`);
      continue;
    }
    const ids = moduleList(a.modules);
    if (ids.length === 0) problems.push(`${a.file}: Modules names no module`);
    for (const id of ids) {
      if (!known.has(id)) problems.push(`${a.file}: Modules names "${id}", which is not a module`);
    }
  }
  const template = path.join(root, 'templates', 'docs', 'adr', '0000-template.md');
  const value = fs.existsSync(template) ? readHeader(fs.readFileSync(template, 'utf8')).modules : null;
  if (value === null) problems.push('templates/docs/adr/0000-template.md: no - **Modules:** line in the header');
  else if (value !== PLACEHOLDER) problems.push(`templates/docs/adr/0000-template.md: Modules must be the placeholder ${PLACEHOLDER}, not "${value}"`);
  return problems;
}

// Every module with an Interface block: label (for messages), the whole block text and its Never breaks.
function blocks(root, exe) {
  const out = [];
  const add = (label, name, file) => {
    if (!fs.existsSync(path.join(root, file))) return;
    const iface = readInterface(fs.readFileSync(path.join(root, file), 'utf8'));
    if (!iface.found) return;
    const p = iface.parts;
    out.push({ label, name, all: [p.inputs, p.outputs, p.callable, p.neverBreaks].join('\n'), neverBreaks: p.neverBreaks });
  };
  for (const m of listModules(root)) {
    if (m.kind === 'skill' && exe.has(m.name)) continue;
    add(m.id, m.name, m.file);
  }
  for (const mod of CODE_MODULES) add(mod, mod, `${mod}/README.md`);
  return out;
}

// What an Interface block's text says about ADRs, outside code fences. A citation is an id inside a
// parenthetical that holds only ADR ids: `(ADR-0005)` or `(ADR-0004, ADR-0005)`. Any other well-formed
// id is a mention and is not checked. A token that looks like an ADR id but is not `ADR-NNNN` is malformed.
function scanAdrText(text) {
  const clean = unfenced(text.split(/\r?\n/)).join('\n');
  const cited = [];
  for (const m of clean.matchAll(/\(\s*(ADR-\d{4}(?:\s*,\s*ADR-\d{4})*)\s*\)/g)) {
    for (const id of m[1].matchAll(/\d{4}/g)) cited.push(id[0]);
  }
  const malformed = [...clean.matchAll(/\badr[-_ ]?\d+/gi)].map((m) => m[0]).filter((t) => !/^ADR-\d{4}$/.test(t));
  return { cited: [...new Set(cited)], malformed: [...new Set(malformed)] };
}

function checkAdrCitations(root, options = {}) {
  checkOptions(options);
  const exe = exemptSet(options);
  const byNumber = new Map(readAdrs(root).adrs.map((a) => [a.number, a]));
  const problems = [];
  for (const b of blocks(root, exe)) {
    const { cited, malformed } = scanAdrText(b.all);
    for (const t of malformed) problems.push(`${b.label}: Interface has the malformed ADR token "${t}" (write ADR-NNNN)`);
    for (const n of cited) {
      const a = byNumber.get(n);
      if (!a) problems.push(`${b.label}: Interface cites ADR-${n}, which does not exist`);
      else if (a.word === 'superseded') problems.push(`${b.label}: Interface cites ADR-${n}, which is superseded`);
      else if (!moduleList(a.modules || '').includes(b.name)) problems.push(`${b.label}: Interface cites ADR-${n}, but ${a.file} Modules does not name ${b.name}`);
    }
  }
  return problems;
}

function checkAcceptedAdrsCited(root, options = {}) {
  checkOptions(options);
  const exe = exemptSet(options);
  const cited = new Set(blocks(root, exe).flatMap((b) => scanAdrText(b.neverBreaks).cited));
  return readAdrs(root).adrs
    .filter((a) => a.word === 'accepted' && !cited.has(a.number))
    .map((a) => `${a.file}: ADR-${a.number} is accepted but no Never breaks promise cites it`);
}

module.exports = { moduleIds, checkAdrModules, checkAdrCitations, checkAcceptedAdrsCited };
