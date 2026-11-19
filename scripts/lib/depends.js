'use strict';
// Private to the scripts module: check 6, the architecture map's Depends on column matches the real
// dependencies (rules/modules.md, "The boundary check"). The graph is built from the detectors the
// other checks already use: check 1's requires (readmes.js), check 2's file pointers (pointers.js) and
// check 3's launch lines (common.js), plus a launch line naming a skill (`run /x`), a string-literal
// path in a non-test .js file and the literal arguments of a path.join / path.resolve call joined into
// one. A pointer into `trackers/active/` or `code-platform/active/` (the adapter folder, which exists
// only in an installed project) counts, however it ends. rules/ and templates/ are never a dependency,
// and neither are tests, comments, the RENAMED / RETIRED* migration tables and the self-edge. An agent
// a skill owns is part of that skill.

const fs = require('node:fs');
const path = require('node:path');
const { agentOwners } = require('./interface.js');
const { PATH_BOUNDARY, escapeRe, skillFolders, checkOptions, exemptSet, pointerSources, isLaunchLine } = require('./common.js');
const { CODE_MODULES, jsFiles, moduleOf, scanRequires, resolveTarget } = require('./readmes.js');
const { buildPointerIndex } = require('./pointers.js');
const { readArchitectureMap, bare } = require('./context.js');

const MODULE_PATH_RE = new RegExp(`(?:(?<=\\.claude\\/)|${PATH_BOUNDARY})((?:${CODE_MODULES.join('|')})\\/[A-Za-z0-9_./*-]*)`, 'g');
const AGENT_PATH_RE = new RegExp(`${PATH_BOUNDARY}agents\\/([a-z0-9-]+)\\.md\\b`, 'g');
const SKILL_PATH_RE = new RegExp(`${PATH_BOUNDARY}skills\\/([a-z0-9-]+)\\/SKILL\\.md\\b`, 'g');
const JS_STRING_RE = /(['"`])((?:\.claude\/)?[A-Za-z0-9_.*-]+\/[^'"`\s]*)\1/g;
const PATH_CALL_RE = /\bpath\.(?:join|resolve)\(([^()]*)\)/g;
const PATH_NOISE = new Set(['.claude', '..', '.']);
// The adapter folder an install builds from one adapter: it is never in the source, so it is no file.
const ADAPTER_RE = /^(?:trackers|code-platform)\/active\//;
// A migration table: `const RENAMED = [...]` or `const RETIRED_X = [...]` names files that are gone.
const MIGRATION_TABLE_RE = /^[ \t]*const (?:RENAMED|RETIRED\w*)\s*=\s*\[[\s\S]*?\];/gm;
// A start or invoke verb, but not "started by" / "run from": that names the caller.
const VERB = '(?:spawn|launch|start|run|invoke)(?:s|es|ed|ing)?';
const INVOKE_VERB_RE = new RegExp(`\\b${VERB}\\b(?!\\s+(?:by|from)\\b)`, 'i');
// "never starts", "does not run", "doesn't invoke": a negated verb starts nothing.
const NEGATED_VERB_RE = new RegExp(`\\b(?:never|not|cannot)\\s+(?:\\w+\\s+)?${VERB}\\b|n't\\s+(?:\\w+\\s+)?${VERB}\\b`, 'gi');
// `<x-skill-dir>/bin/y.js`: a file of skill x, named from another skill's folder.
const NAMED_SKILL_DIR_RE = /<([a-z0-9-]+)-skill-dir>\/([A-Za-z0-9_./-]+)/g;

const blank = (m) => m.replace(/[^\n]/g, ' ');

// Full-line and block comments and the migration tables are not dependencies.
function withoutComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, blank).replace(MIGRATION_TABLE_RE, blank)
    .split('\n').map((l) => (/^\s*\/\//.test(l) ? '' : l)).join('\n');
}

function isFile(root, rel) {
  try { return fs.statSync(path.join(root, rel)).isFile(); } catch { return false; }
}

// The module a path in prose names, or null: a folder or a glob names no file, except the adapter folder.
function targetOfModulePath(raw) {
  const mod = raw.split('/')[0];
  if (ADAPTER_RE.test(raw)) return mod;
  if (raw.endsWith('/') || raw.includes('*')) return null;
  const target = raw.replace(/[.\-/]+$/, '');
  return target.length > mod.length + 1 ? mod : null;
}

// The consecutive string-literal arguments of each path.join / path.resolve call, joined with `/`. A
// `.claude`, `..` or `.` argument adds nothing and an argument that is not a literal ends the path.
function joinedPaths(text) {
  const out = [];
  for (const call of text.matchAll(PATH_CALL_RE)) {
    let run = [];
    const flush = () => { if (run.length) out.push(run.join('/')); run = []; };
    for (const arg of call[1].split(',').map((a) => a.trim())) {
      const lit = /^(['"`])(.*)\1$/.exec(arg);
      if (!lit || lit[2].includes('${')) flush();
      else if (!PATH_NOISE.has(lit[2])) run.push(lit[2]);
    }
    flush();
  }
  return out;
}

// A line invokes a skill when a start or invoke verb comes before its `/name` on the same line, and the
// name is not "first" advice: "run `/x`", not "`/x` runs", "called from `/x`" or "run `/x` first".
function invokes(line, re) {
  const at = line.search(re);
  if (at === -1 || !INVOKE_VERB_RE.test(line.slice(0, at).replace(NEGATED_VERB_RE, ''))) return false;
  return !/^[`'")\]\s]*first\b/.test(line.slice(at).replace(/^\/[a-z0-9-]+/, ''));
}

// The graph's nodes, and the helpers every scan shares: `add(from, to)` and `sourceOf(rel)`.
function newContext(root, options) {
  checkOptions(options);
  const exe = exemptSet(options);
  const skills = skillFolders(root);
  const agents = agentOwners(root);
  const graph = new Map();
  const ensure = (id) => { if (!graph.has(id)) graph.set(id, new Set()); return graph.get(id); };
  for (const s of skills) ensure(`/${s}`);
  for (const m of CODE_MODULES) ensure(m);
  // An owned agent is its skill; a shared or person agent is itself.
  const agentModule = new Map(agents.map(({ name, owner }) => [name, owner && skills.includes(owner) ? `/${owner}` : name]));
  for (const id of agentModule.values()) ensure(id);
  const sourceOf = (rel) => {
    const parts = rel.split('/');
    if (parts[0] === 'skills' && parts.length > 2 && skills.includes(parts[1])) return exe.has(parts[1]) ? null : `/${parts[1]}`;
    if (parts[0] === 'agents' && parts.length === 2 && rel.endsWith('.md')) return agentModule.get(parts[1].replace(/\.md$/, '')) || null;
    return CODE_MODULES.includes(parts[0]) ? parts[0] : null;
  };
  const add = (from, to) => { if (from && to && from !== to && graph.has(to)) ensure(from).add(to); };
  return { root, skills, agents, agentModule, graph, sourceOf, add };
}

// The module a string-literal path in non-test JS names, when it names a file there.
function jsPathModule(ctx, raw) {
  const rel = raw.replace(/^\.claude\//, '');
  const sk = /^skills\/([a-z0-9-]+)\/(.+)$/.exec(rel);
  const ag = /^agents\/([a-z0-9-]+)\.md$/.exec(rel);
  if (sk) return ctx.skills.includes(sk[1]) && isFile(ctx.root, rel) ? `/${sk[1]}` : null;
  if (ag) return ctx.agentModule.get(ag[1]) || null;
  const mod = targetOfModulePath(rel);
  if (!mod || !CODE_MODULES.includes(mod)) return null;
  return ADAPTER_RE.test(rel) || isFile(ctx.root, rel.replace(/[.\-/]+$/, '')) ? mod : null;
}

// Check 1, and the string-literal paths of every non-test JS file.
function addJsEdges(ctx) {
  const { root, add, sourceOf } = ctx;
  for (const rel of jsFiles(root)) {
    const from = sourceOf(rel);
    const text = fs.readFileSync(path.join(root, rel), 'utf8');
    for (const { spec } of scanRequires(text)) {
      if (spec === null || !/^\.{1,2}\//.test(spec)) continue;
      const target = resolveTarget(root, rel, spec);
      if (!target) continue;
      const t = moduleOf(target);
      add(from, t.startsWith('skills/') ? `/${t.slice('skills/'.length)}` : t);
    }
    const code = withoutComments(text);
    for (const m of code.matchAll(JS_STRING_RE)) add(from, jsPathModule(ctx, m[2]));
    for (const joined of joinedPaths(code)) add(from, jsPathModule(ctx, joined));
  }
}

// Check 2, the pointers into a skill: the index reads every pointer form.
function addSkillPointerEdges(ctx) {
  for (const [skill, files] of buildPointerIndex(ctx.root)) {
    for (const by of new Set([...files.values()].flatMap((s) => [...s]))) {
      if (!by.endsWith('.js')) ctx.add(ctx.sourceOf(by), `/${skill}`);
    }
  }
}

// The paths one line of a Markdown file points at: a code module's file, an agent, a skill.
function addLinePathEdges(ctx, from, line, inFence) {
  // A command in a fence is a real call, except `scripts/...`, which a skill's example uses for the
  // user's own project.
  for (const m of line.matchAll(MODULE_PATH_RE)) if (!inFence || !m[1].startsWith('scripts/')) ctx.add(from, targetOfModulePath(m[1]));
  for (const m of line.matchAll(AGENT_PATH_RE)) ctx.add(from, ctx.agentModule.get(m[1]));
  for (const m of line.matchAll(SKILL_PATH_RE)) if (ctx.skills.includes(m[1])) ctx.add(from, `/${m[1]}`);
  for (const m of line.matchAll(NAMED_SKILL_DIR_RE)) if (isFile(ctx.root, `skills/${m[1]}/${m[2]}`)) ctx.add(from, `/${m[1]}`);
}

// Check 3: a launch line naming an agent. A skill invocation is a launch line naming `/x`, or a command
// line in a fence that starts with it; an agent's text names the skills that call it, which is not one.
function addLaunchEdges(ctx) {
  const { agents, agentModule, skills, add } = ctx;
  const person = new Set(agents.filter((a) => a.owner === 'person').map((a) => `agents/${a.name}.md`));
  const skillRe = skills.map((s) => ({ id: `/${s}`, re: new RegExp(`${PATH_BOUNDARY}/${escapeRe(s)}(?![A-Za-z0-9_/-]|\\.[A-Za-z0-9_])`) }));
  const agentRe = agents.map(({ name }) => ({
    id: agentModule.get(name),
    re: new RegExp(`${PATH_BOUNDARY}${escapeRe(name)}(?![A-Za-z0-9_-]|['’]s\\b)`),
  }));
  for (const { rel, lines, raw } of pointerSources(ctx.root)) {
    const from = ctx.sourceOf(rel);
    if (!from) continue;
    const startsSkills = !rel.startsWith('agents/') || person.has(rel);
    raw.forEach((line, i) => {
      addLinePathEdges(ctx, from, line, !lines[i]);
      if (rel.startsWith('rules/')) return;
      if (lines[i]) {
        for (const { id, re } of agentRe) if (re.test(lines[i]) && isLaunchLine(lines, i)) add(from, id);
        if (startsSkills) for (const { id, re } of skillRe) if (invokes(lines[i], re)) add(from, id);
      } else if (startsSkills) {
        const cmd = /^\s*\/([a-z0-9-]+)(?=\s|$)/.exec(line);
        if (cmd && skills.includes(cmd[1])) add(from, `/${cmd[1]}`);
      }
    });
  }
}

function dependencies(root, options = {}) {
  const ctx = newContext(root, options);
  addJsEdges(ctx);
  addSkillPointerEdges(ctx);
  addLaunchEdges(ctx);
  return ctx.graph;
}

const listOf = (cell) => bare(cell).split(',').map((n) => n.trim()).filter((n) => n && n !== '—');

function checkDependsOn(root, options = {}) {
  checkOptions(options);
  const file = path.join(root, 'CONTEXT.md');
  if (!fs.existsSync(file)) return [];
  const map = readArchitectureMap(fs.readFileSync(file, 'utf8'));
  if (!map.header.includes('Depends on')) return [];
  const graph = dependencies(root, options);
  const problems = [];
  map.rows.forEach((row, n) => {
    const id = bare(row.Module);
    const real = graph.get(id) || new Set();
    const listed = new Set(listOf(row['Depends on']));
    const at = `CONTEXT.md:${map.rowLines[n]}: ${id} Depends on`;
    const missing = [...real].filter((d) => !listed.has(d)).sort();
    const extra = [...listed].filter((d) => !real.has(d)).sort();
    if (missing.length) problems.push(`${at} is missing ${missing.join(', ')}`);
    if (extra.length) problems.push(`${at} lists ${extra.join(', ')}, which it does not depend on`);
  });
  return problems;
}

module.exports = { dependencies, checkDependsOn };
