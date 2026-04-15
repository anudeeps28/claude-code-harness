#!/usr/bin/env node
// Scans Claude Code skills, agents, and hooks across WORK_ROOT and the global
// ~/.claude folder. Writes SKILLS_CATALOG.md to WORK_ROOT.
//
// Run manually:   node "<repo>/.claude/hooks/catalog-skills.js"
// Auto-triggered: PostToolUse via catalog-trigger.js on skill/agent edits.
//
// Config: set env var CLAUDE_HARNESS_WORK_ROOT to the folder containing your
// projects (e.g. "$HOME/projects"). The installer writes this into the env
// block of settings.json so re-installing doesn't wipe your config.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const frontmatter = require('./lib/frontmatter');
const { walk } = require('./lib/walk');

const SILENT = process.argv.includes('--silent');
const WORK_ROOT = process.env.CLAUDE_HARNESS_WORK_ROOT || '';
const GLOBAL_CLAUDE = path.join(os.homedir(), '.claude');

function die(msg) {
  process.stderr.write(`catalog-skills.js: ${msg}\n`);
  process.exit(1);
}

if (!WORK_ROOT || !fs.existsSync(WORK_ROOT)) {
  die(
    `CLAUDE_HARNESS_WORK_ROOT "${WORK_ROOT}" is not set or does not exist.\n` +
    `  Set it in settings.json env block, or export CLAUDE_HARNESS_WORK_ROOT=<path-to-your-projects-folder>`
  );
}

const OUTPUT_PATH = path.join(WORK_ROOT, 'SKILLS_CATALOG.md');

function pad(n) { return String(n).padStart(2, '0'); }
function nowStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function agentRefs(filePath) {
  let text = '';
  try { text = fs.readFileSync(filePath, 'utf8'); } catch { return ''; }
  const refs = new Set();
  for (const m of text.matchAll(/`([a-zA-Z][a-zA-Z0-9_-]*-agent)`/g)) refs.add(m[1]);
  for (const m of text.matchAll(/subagent_type\s*[=:]\s*"([a-zA-Z0-9_-]+)"/g)) refs.add(m[1]);
  return [...refs].sort().join(',');
}

function readSettings(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch { return null; }
}

function hookRows(settingsPath, projectLabel) {
  const data = readSettings(settingsPath);
  if (!data || !data.hooks) return [];
  const rows = [];
  for (const [event, groups] of Object.entries(data.hooks)) {
    if (!Array.isArray(groups)) continue;
    for (const group of groups) {
      const matcher = group.matcher || '*';
      const hooks = Array.isArray(group.hooks) ? group.hooks : [];
      for (const hook of hooks) {
        const cmd = (hook.command || '').slice(0, 80);
        rows.push(`| ${projectLabel} | ${event} | \`${matcher}\` | \`${cmd}\` |`);
      }
    }
  }
  return rows;
}

function listProjects(workRoot) {
  try {
    return fs.readdirSync(workRoot, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  } catch { return []; }
}

function findSkills(dir) {
  return walk(dir, {
    match: (_full, name) => name === 'SKILL.md',
    maxDepth: 2,
  });
}

function findAgents(dir) {
  return walk(dir, {
    match: (_full, name) => name.endsWith('.md') && name !== 'README.md',
    maxDepth: 1,
  });
}

function skillBlock(skillPath, scopeLabel) {
  const fm = frontmatter.readFile(skillPath);
  const dirName = path.basename(path.dirname(skillPath));
  const name = fm.name || dirName;
  const desc = fm.description || '—';
  const argHint = fm['argument-hint'];
  const refs = agentRefs(skillPath);
  const lines = [
    `#### \`/${name}\``,
    '',
    '| Field | Value |',
    '|---|---|',
    `| **Scope** | ${scopeLabel} |`,
    `| **Description** | ${desc} |`,
  ];
  if (argHint) lines.push(`| **Usage** | \`${argHint}\` |`);
  lines.push(`| **Agents used** | ${refs || '_(none)_'} |`);
  lines.push(`| **File** | \`${skillPath}\` |`);
  lines.push('');
  return lines.join('\n');
}

function agentRow(agentPath) {
  const fm = frontmatter.readFile(agentPath);
  const base = path.basename(agentPath, '.md');
  const name = fm.name || base;
  const desc = fm.description || '—';
  const tools = fm.tools || '—';
  const model = fm.model || '—';
  return `| \`${name}\` | ${desc} | ${tools} | ${model} |`;
}

// ── build catalog ─────────────────────────────────────────────────────

const out = [];
let skillCount = 0;
let agentCount = 0;
let hookCount = 0;

out.push('# Claude Code Skills Catalog', '');
out.push(`_Auto-generated ${nowStr()} - do not edit by hand. Re-run catalog-skills.js to refresh._`, '');
out.push('---', '');
out.push('## Contents', '', '1. [Skills](#skills)', '2. [Agents](#agents)', '3. [Hooks](#hooks)', '', '---', '');

// Section 1: Skills ────────────────────────────────────────────────────
out.push('## Skills', '');

const globalSkills = findSkills(path.join(GLOBAL_CLAUDE, 'skills'));
if (globalSkills.length) {
  out.push('### Global Skills', '');
  for (const sp of globalSkills) { out.push(skillBlock(sp, 'Global')); skillCount++; }
}

for (const proj of listProjects(WORK_ROOT)) {
  const skillsDir = path.join(WORK_ROOT, proj, '.claude', 'skills');
  const skills = findSkills(skillsDir);
  if (!skills.length) continue;
  out.push(`### Project: ${proj}`, '');
  for (const sp of skills) { out.push(skillBlock(sp, `Project: ${proj}`)); skillCount++; }
}

out.push('---', '');

// Section 2: Agents ────────────────────────────────────────────────────
out.push('## Agents', '');

let hadAgents = false;
for (const proj of listProjects(WORK_ROOT)) {
  const agentsDir = path.join(WORK_ROOT, proj, '.claude', 'agents');
  const agents = findAgents(agentsDir);
  if (!agents.length) continue;
  hadAgents = true;
  out.push(`### Project: ${proj}`, '');
  out.push('| Agent | Description | Tools | Model |');
  out.push('|---|---|---|---|');
  for (const ap of agents) { out.push(agentRow(ap)); agentCount++; }
  out.push('');
}
if (!hadAgents) out.push('_No agents found._', '');
out.push('---', '');

// Section 3: Hooks ─────────────────────────────────────────────────────
out.push('## Hooks', '');
let hadHooks = false;

const globalRows = hookRows(path.join(GLOBAL_CLAUDE, 'settings.json'), 'Global');
if (globalRows.length) {
  hadHooks = true;
  out.push('### Global', '', '| Project | Event | Matcher | Command |', '|---|---|---|---|');
  out.push(...globalRows, '');
  hookCount++;
}

for (const proj of listProjects(WORK_ROOT)) {
  for (const fname of ['settings.json', 'settings.local.json']) {
    const sp = path.join(WORK_ROOT, proj, '.claude', fname);
    const rows = hookRows(sp, proj);
    if (!rows.length) continue;
    hadHooks = true;
    out.push(`### ${proj} (${fname})`, '', '| Project | Event | Matcher | Command |', '|---|---|---|---|');
    out.push(...rows, '');
    hookCount++;
  }
}
if (!hadHooks) out.push('_No hooks configured._', '');
out.push('---', '');

// Summary ──────────────────────────────────────────────────────────────
out.push('## Summary', '', '| Category | Count |', '|---|---|');
out.push(`| Total skills | ${skillCount} |`);
out.push(`| Total agents | ${agentCount} |`);
out.push(`| Total hook configs | ${hookCount} |`, '');

fs.writeFileSync(OUTPUT_PATH, out.join('\n'));

if (!SILENT) {
  process.stdout.write(`SKILLS_CATALOG.md written to ${OUTPUT_PATH}\n`);
  process.stdout.write(`  Skills: ${skillCount}  |  Agents: ${agentCount}  |  Hooks: ${hookCount}\n`);
}
