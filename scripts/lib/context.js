'use strict';
// Private to the scripts module: the architecture-map checks behind scripts/__tests__/boundaries-*.test.js
// (rules/modules.md, "The architecture map"). The map is the first table of CONTEXT.md.

const fs = require('node:fs');
const path = require('node:path');
const { agentOwners, readInterface } = require('./interface.js');
const { skillFolders, checkOptions, exemptSet } = require('./common.js');
const { CODE_MODULES } = require('./readmes.js');

const MAP_HEADING = 'Architecture map';
const MAP_COLUMNS = ['Module', 'Kind', 'Owns', 'Private agents', 'Depends on', 'Interface'];
const NAME = /^[a-z][a-z0-9-]*$/;

const splitCells = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());

// The first `## ` section of a CONTEXT.md and its first table: { heading, header, rows, rowLines }, each
// row an object keyed by the header cells and rowLines[n] the 1-based line of row n. A text with no
// `## ` heading or no table gives empty values.
function readArchitectureMap(text) {
  const lines = String(text).split(/\r?\n/);
  const start = lines.findIndex((l) => /^## /.test(l));
  const result = { heading: '', header: [], rows: [], rowLines: [] };
  if (start === -1) return result;
  result.heading = lines[start].replace(/^## /, '').trim();
  let i = start + 1;
  while (i < lines.length && !/^## /.test(lines[i]) && !lines[i].trim().startsWith('|')) i++;
  if (i >= lines.length || !lines[i].trim().startsWith('|')) return result;
  result.header = splitCells(lines[i]);
  i += 2; // the header and its `|---|` line
  for (; i < lines.length && lines[i].trim().startsWith('|'); i++) {
    const cells = splitCells(lines[i]);
    result.rows.push(Object.fromEntries(result.header.map((h, n) => [h, cells[n] === undefined ? '' : cells[n]])));
    result.rowLines.push(i + 1);
  }
  return result;
}

const bare = (cell) => String(cell || '').replace(/`/g, '').trim();
// The tokens of a comma-separated cell; a dash or an empty cell has none.
const tokens = (cell) => bare(cell).split(',').map((n) => n.trim()).filter((n) => n && n !== '—');
const cellNames = (cell) => tokens(cell).filter((n) => NAME.test(n));
const linkTarget = (cell) => {
  const m = String(cell || '').match(/\]\(([^)]+)\)/);
  return bare(m ? m[1] : cell);
};

// One clear problem when the first section is not the Architecture map or its table is missing or has
// other columns; the row checks would only pile up noise after that.
function checkShape(map) {
  if (map.heading !== MAP_HEADING) {
    return [`CONTEXT.md: the first ## section is "${map.heading}", not "${MAP_HEADING}"`];
  }
  if (!map.header.length) return [`CONTEXT.md: the "${MAP_HEADING}" section has no table`];
  if (map.header.join('|') !== MAP_COLUMNS.join('|')) {
    return [`CONTEXT.md: the table header is "${map.header.join(' | ')}", not "${MAP_COLUMNS.join(' | ')}"`];
  }
  return [];
}

// What a row's Module cell says it is: its Kind and the one link its Interface cell must hold.
function describe(id, ctx) {
  if (id.startsWith('/')) {
    const name = id.slice(1);
    // The exempt skill (frontend-design) is a bundle of sub-skills with no SKILL.md and no Interface
    // block (rules/modules.md, "Known exception"): its row links its own README.md, with no anchor.
    const link = ctx.exe.has(name) ? `skills/${name}/README.md` : `skills/${name}/SKILL.md#interface`;
    return { kind: 'skill', link, isSkill: true };
  }
  if (CODE_MODULES.includes(id)) return { kind: 'code module', link: `${id}/README.md#interface` };
  const agent = ctx.agents.find((a) => a.name === id);
  if (agent) {
    const kind = agent.owner === 'person' ? 'agent (person)' : 'agent (shared)';
    return { kind, link: `agents/${id}.md#interface` };
  }
  return null;
}

function checkRowSet(ctx) {
  const problems = [];
  const seen = new Map();
  for (const e of ctx.entries) seen.set(e.id, [...(seen.get(e.id) || []), e]);
  for (const [id, list] of seen) {
    if (list.length > 1) problems.push(`CONTEXT.md:${list[1].line}: ${id} has ${list.length} rows, more than one`);
  }
  const wanted = new Set([...ctx.skills.map((s) => `/${s}`), ...CODE_MODULES]);
  for (const a of ctx.agents) {
    const owned = a.owner && a.owner !== 'shared' && a.owner !== 'person';
    if (!owned) wanted.add(a.name);
    else if (seen.has(a.name)) problems.push(`CONTEXT.md:${seen.get(a.name)[0].line}: ${a.name} is owned by ${a.owner}, so it has no row of its own`);
    else if (!seen.has(`/${a.owner}`)) problems.push(`CONTEXT.md: ${a.name} is owned by ${a.owner}, which has no row to list it in`);
  }
  for (const id of wanted) {
    if (!seen.has(id)) problems.push(`CONTEXT.md: ${id} has no row in the architecture map`);
  }
  for (const e of ctx.entries) {
    if (!wanted.has(e.id) && !ctx.agents.some((a) => a.name === e.id)) {
      problems.push(`CONTEXT.md:${e.line}: row ${e.id} is not a skill, an agent or a code module`);
    }
  }
  return problems;
}

function checkKinds(ctx) {
  const problems = [];
  for (const e of ctx.entries) {
    const d = describe(e.id, ctx);
    if (d && bare(e.row.Kind) !== d.kind) {
      problems.push(`CONTEXT.md:${e.line}: ${e.id} has Kind "${bare(e.row.Kind)}", expected "${d.kind}"`);
    }
  }
  return problems;
}

function checkPrivateAgents(ctx) {
  const problems = [];
  for (const e of ctx.entries) {
    const d = describe(e.id, ctx);
    if (!d) continue;
    const cell = e.row['Private agents'];
    const bad = tokens(cell).filter((n) => !NAME.test(n));
    for (const n of bad) problems.push(`CONTEXT.md:${e.line}: ${e.id} Private agents cell has "${n}", which is not an agent name`);
    const listed = cellNames(cell).sort();
    const expected = d.isSkill
      ? ctx.agents.filter((a) => a.owner === e.id.slice(1)).map((a) => a.name).sort()
      : [];
    if (listed.join(',') !== expected.join(',')) {
      const owner = d.isSkill ? `the agents owned by ${e.id.slice(1)} are "${expected.join(', ')}"` : 'only a skill has Private agents';
      problems.push(`CONTEXT.md:${e.line}: ${e.id} Private agents cell lists "${listed.join(', ')}" but ${owner}`);
    }
  }
  return problems;
}

// A link is followed only when it is a relative path that stays inside the repo root.
function insideRoot(rel) {
  const file = rel.split('#')[0];
  if (path.isAbsolute(file) || path.win32.isAbsolute(file)) return false;
  const target = path.posix.normalize(file.split('\\').join('/'));
  return target !== '..' && !target.startsWith('../');
}

// Every Interface link is the row's own main file and anchor, resolves to a file, and (unless the
// skill is exempt) that file holds an `## Interface` block.
function checkLinks(ctx) {
  const problems = [];
  for (const e of ctx.entries) {
    const d = describe(e.id, ctx);
    const rel = linkTarget(e.row.Interface);
    if (!insideRoot(rel)) {
      problems.push(`CONTEXT.md:${e.line}: ${e.id} links ${rel}, which is absolute or outside the repo`);
      continue;
    }
    if (d && rel !== d.link) {
      problems.push(`CONTEXT.md:${e.line}: ${e.id} links ${rel || '(nothing)'}, expected ${d.link}`);
      continue;
    }
    const abs = path.join(ctx.root, rel.split('#')[0]);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
      problems.push(`CONTEXT.md:${e.line}: ${e.id} links ${rel || '(nothing)'}, which does not exist`);
    } else if (!(d && d.isSkill && ctx.exe.has(e.id.slice(1))) && !readInterface(fs.readFileSync(abs, 'utf8')).found) {
      problems.push(`CONTEXT.md:${e.line}: ${e.id} links ${rel}, which has no ## Interface block`);
    }
  }
  return problems;
}

// One row per skill folder, per shared or person agent and per code module; an agent a skill owns is
// in that skill's Private agents cell and has no row. Each row has the Kind and the Interface link its
// category gives it.
function checkContextMap(root, options = {}) {
  checkOptions(options);
  const exe = exemptSet(options);
  const file = path.join(root, 'CONTEXT.md');
  if (!fs.existsSync(file)) return ['CONTEXT.md: missing, so there is no architecture map'];
  const map = readArchitectureMap(fs.readFileSync(file, 'utf8'));
  const shape = checkShape(map);
  if (shape.length) return shape;
  const entries = map.rows.map((row, n) => ({ row, id: bare(row.Module), line: map.rowLines[n] }));
  const ctx = { root, exe, entries, skills: skillFolders(root), agents: agentOwners(root) };
  return [...checkRowSet(ctx), ...checkKinds(ctx), ...checkPrivateAgents(ctx), ...checkLinks(ctx)];
}

module.exports = { readArchitectureMap, checkContextMap, bare, linkTarget, cellNames };
