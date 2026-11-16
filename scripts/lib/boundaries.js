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

// ---- Interface blocks (rules/modules.md, "Where an interface is written") ----

const PART_LABELS = {
  Inputs: 'inputs',
  Outputs: 'outputs',
  'Callable parts': 'callable',
  'Never breaks': 'neverBreaks',
};

function stripFrontmatter(text) {
  const lines = text.split(/\r?\n/);
  if (lines[0] !== '---') return lines;
  const end = lines.indexOf('---', 1);
  return end === -1 ? lines : lines.slice(end + 1);
}

// Reads the Interface block of a SKILL.md or agent file.
// found: an `## Interface` heading exists in the body. firstAfterFrontmatter: it is the first
// non-blank line after the frontmatter. parts: the text of each of the four labelled parts.
// labels: every `**Label:**` found in the block, in order. headings: how many `## Interface` lines.
function readInterface(text) {
  const body = stripFrontmatter(text);
  const isHeading = (l) => /^## Interface\s*$/.test(l);
  // A line inside a ``` code fence is never a heading.
  let fenced = false;
  const inFence = body.map((l) => {
    if (/^\s*```/.test(l)) { fenced = !fenced; return true; }
    return fenced;
  });
  const headingAt = (i) => !inFence[i] && isHeading(body[i]);
  const headings = body.filter((_, i) => headingAt(i)).length;
  const first = body.findIndex((l) => l.trim() !== '');
  const start = body.findIndex((_, i) => headingAt(i));
  const result = {
    found: start !== -1,
    firstAfterFrontmatter: first !== -1 && headingAt(first),
    headings,
    labels: [],
    parts: { inputs: '', outputs: '', callable: '', neverBreaks: '' },
  };
  if (start === -1) return result;
  const chunks = [];
  let current = null;
  // The block ends at the next heading or a `---` line.
  for (const line of body.slice(start + 1)) {
    if (/^(## |# |---)/.test(line)) break;
    const label = /^\*\*([^*:]+):\*\*\s?(.*)$/.exec(line);
    if (label) {
      current = { name: label[1].trim(), lines: [label[2]] };
      chunks.push(current);
      result.labels.push(current.name);
    } else if (current) {
      current.lines.push(line);
    }
  }
  for (const { name, lines } of chunks) {
    const key = PART_LABELS[name];
    if (key && !result.parts[key]) result.parts[key] = lines.join('\n').trim();
  }
  return result;
}

function skipSet(list) {
  return new Set(list || []);
}

function listModules(root) {
  const modules = [];
  const skillsDir = path.join(root, 'skills');
  if (fs.existsSync(skillsDir)) {
    for (const d of fs.readdirSync(skillsDir, { withFileTypes: true }).filter((e) => e.isDirectory())) {
      modules.push({ id: `skills/${d.name}`, name: d.name, kind: 'skill', file: `skills/${d.name}/SKILL.md` });
    }
  }
  for (const f of agentFiles(root)) {
    const name = f.replace(/\.md$/, '');
    modules.push({ id: `agents/${name}`, name, kind: 'agent', file: `agents/${f}` });
  }
  return modules.sort((a, b) => a.id.localeCompare(b.id));
}

function readModule(root, mod) {
  const abs = path.join(root, mod.file);
  return fs.existsSync(abs) ? readInterface(fs.readFileSync(abs, 'utf8')) : null;
}

function checkInterfaces(root, { pending = [], exempt = [] } = {}) {
  const pend = skipSet(pending);
  const exe = skipSet(exempt);
  const problems = [];
  for (const mod of listModules(root)) {
    if (pend.has(mod.id) || (mod.kind === 'skill' && exe.has(mod.name))) continue;
    const iface = readModule(root, mod);
    if (!iface) {
      problems.push(`${mod.file}: file is missing`);
    } else if (!iface.found || !iface.firstAfterFrontmatter) {
      problems.push(`${mod.file}: no ## Interface block right after the frontmatter`);
    } else {
      if (iface.headings > 1) problems.push(`${mod.file}: more than one ## Interface heading`);
      for (const label of Object.keys(PART_LABELS)) {
        if (!iface.labels.includes(label)) problems.push(`${mod.file}: Interface has no **${label}:** part`);
        else if (!iface.parts[PART_LABELS[label]]) problems.push(`${mod.file}: Interface part ${label} is empty`);
      }
      for (const label of new Set(iface.labels)) {
        if (iface.labels.filter((l) => l === label).length > 1) problems.push(`${mod.file}: Interface part ${label} appears more than once`);
      }
      for (const label of iface.labels) {
        if (!(label in PART_LABELS)) problems.push(`${mod.file}: Interface has an unknown part "${label}"`);
      }
    }
  }
  return problems;
}

function checkPending(root, pending = []) {
  const problems = [];
  for (const id of pending) {
    const m = /^(skills|agents)\/([^/]+)$/.exec(id);
    const file = m && (m[1] === 'skills' ? `skills/${m[2]}/SKILL.md` : `agents/${m[2]}.md`);
    if (!file || !fs.existsSync(path.join(root, file))) {
      problems.push(`${id}: does not exist`);
    } else if (readInterface(fs.readFileSync(path.join(root, file), 'utf8')).found) {
      problems.push(`${id}: has an Interface block — remove it from PENDING`);
    }
  }
  return problems;
}

// ---- Files other modules name ----

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

function checkCallableParts(root, { pending = [], exempt = [] } = {}) {
  const pend = skipSet(pending);
  const exe = skipSet(exempt);
  const problems = [];
  const index = buildPointerIndex(root);
  for (const mod of listModules(root).filter((m) => m.kind === 'skill')) {
    if (pend.has(mod.id) || exe.has(mod.name)) continue;
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

function checkAgentOutputs(root, { pending = [] } = {}) {
  const pend = skipSet(pending);
  const problems = [];
  for (const mod of listModules(root).filter((m) => m.kind === 'agent')) {
    if (pend.has(mod.id)) continue;
    const iface = readModule(root, mod);
    if (!iface || !iface.found) continue;
    // The `STATUS:` line must be named as the start of the report, so "no STATUS: line" fails.
    const out = iface.parts.outputs.trim();
    const negated = /\b(?:not|no|never|without)\b[^.\n]*\b(?:starts?|begins?) with\b/i.test(out);
    if (negated || !/^`?STATUS:|\b(?:starts?|begins?) with (?:a |the |its )?(?:first )?(?:line )?`?STATUS:/i.test(out)) {
      problems.push(`${mod.file}: Interface Outputs do not give the STATUS: line`);
    }
  }
  return problems;
}

module.exports = {
  agentOwners, checkOwners, checkRulesTable,
  readInterface, checkInterfaces, checkPending, namedFiles, checkCallableParts, checkAgentOutputs,
};
