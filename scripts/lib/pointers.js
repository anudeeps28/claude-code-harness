'use strict';
// Private to the scripts module: the "files other modules name" checks behind
// scripts/__tests__/boundaries.test.js. Each check takes a repo root and returns a list of problem
// strings naming the module.

const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('../../hooks/lib/frontmatter.js');
const { skipSet, listModules, readModule } = require('./interface.js');

// Folders whose files may point at a skill's files. Tests (__tests__) are not pointers.
const POINTER_DIRS = ['agents', 'rules', 'skills', 'hooks', 'install', 'templates', 'trackers', 'code-platform'];
const MAX_SCAN_BYTES = 2 * 1024 * 1024;

function* walkFiles(dir) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '__tests__' || e.name === 'node_modules' || e.name === '.git') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* walkFiles(full);
    else if (e.isFile()) yield full;
  }
}

// Pointers other modules make to a skill's files. Recognised forms:
//   - `skills/<name>/<path>` anywhere;
//   - `<skill-dir>/<path>` or `${CLAUDE_SKILL_DIR}/<path>`: the owner skill's path in an agent whose
//     frontmatter has `owner: <skill>`; in any other file, the skill that file names as
//     "the /<name> skill folder" (only when it names exactly one, so two skills never get mixed up);
//   - a bare `bin/x.js`, `reference/x.md` or `templates/x` in an owner agent, resolved against the
//     owner's folder (only when that file exists).
// Limits: only files are found. A directory pointer such as `<skill-dir>/bin` with no file after it
// names nothing, so a script an agent mentions only that way stays invisible. README.md, docs/ and
// CONTEXT.md are not scanned (POINTER_DIRS), and tests are skipped.
const SKILL_DIR_RE = /(?:<skill-dir>|\$\{CLAUDE_SKILL_DIR\})\/([A-Za-z0-9_./-]+)/g;
const BARE_RE = /(?<![A-Za-z0-9_./<>}-])((?:bin|reference|templates)\/[A-Za-z0-9_./-]+)/g;
const SKILL_FOLDER_RE = /\/([a-z0-9-]+) skill folder/g;

function skillNames(root) {
  const dir = path.join(root, 'skills');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
}

// Scans every pointer file once. Returns Map skill -> Map rel -> Set of pointing files.
function buildPointerIndex(root) {
  const skills = new Set(skillNames(root));
  const index = new Map([...skills].map((s) => [s, new Map()]));
  const record = (skill, relRaw, byFile) => {
    const rel = relRaw.replace(/[.\-/]+$/, '');
    if (!rel || rel === 'SKILL.md') return;
    const abs = path.join(root, 'skills', skill, rel);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return;
    const by = path.relative(root, byFile).split(path.sep).join('/');
    const map = index.get(skill);
    if (!map.has(rel)) map.set(rel, new Set());
    map.get(rel).add(by);
  };
  for (const top of POINTER_DIRS) {
    for (const file of walkFiles(path.join(root, top))) {
      if (fs.statSync(file).size > MAX_SCAN_BYTES) continue;
      const text = fs.readFileSync(file, 'utf8');
      const rootRel = path.relative(root, file).split(path.sep);
      const ownSkill = rootRel[0] === 'skills' ? rootRel[1] : null;
      const isAgent = rootRel[0] === 'agents' && rootRel.length === 2 && file.endsWith('.md');
      const owner = isAgent ? parse(text).owner : null;
      const ownerSkill = owner && skills.has(owner) ? owner : null;
      const named = new Set([...text.matchAll(SKILL_FOLDER_RE)].map((m) => m[1]).filter((n) => skills.has(n)));
      const dirSkill = ownerSkill || (!isAgent && named.size === 1 ? [...named][0] : null);
      for (const m of text.matchAll(/skills\/([a-z0-9-]+)\/([A-Za-z0-9_./-]+)/g)) {
        if (skills.has(m[1]) && m[1] !== ownSkill) record(m[1], m[2], file);
      }
      if (dirSkill && dirSkill !== ownSkill) {
        for (const m of text.matchAll(SKILL_DIR_RE)) record(dirSkill, m[1], file);
      }
      if (ownerSkill && ownerSkill !== ownSkill) {
        for (const m of text.matchAll(BARE_RE)) record(ownerSkill, m[1], file);
      }
    }
  }
  return index;
}

function namedFiles(root, skill, index = buildPointerIndex(root)) {
  return [...(index.get(skill) || new Map()).keys()].sort();
}

function mentions(text, rel) {
  let from = 0;
  for (;;) {
    const i = text.indexOf(rel, from);
    if (i === -1) return false;
    const before = i === 0 ? '' : text[i - 1];
    const after = text[i + rel.length] || '';
    if (!/[A-Za-z0-9_.-]/.test(before) && !/[A-Za-z0-9_-]/.test(after)) return true;
    from = i + 1;
  }
}

function checkCallableParts(root, options = {}) {
  const exe = skipSet(options);
  const problems = [];
  const index = buildPointerIndex(root);
  for (const mod of listModules(root).filter((m) => m.kind === 'skill')) {
    if (exe.has(mod.name)) continue;
    const iface = readModule(root, mod);
    if (!iface || !iface.found) continue;
    for (const [rel, by] of [...(index.get(mod.name) || new Map())].sort((a, b) => a[0].localeCompare(b[0]))) {
      if (!mentions(iface.parts.callable, rel)) {
        problems.push(`${mod.id}/${rel}: named by ${[...by].sort().join(', ')} but not in ${mod.file} Callable parts`);
      }
    }
  }
  return problems;
}

module.exports = { buildPointerIndex, namedFiles, checkCallableParts };
