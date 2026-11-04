#!/usr/bin/env node
// run-report.js — the run report and combined decisions log for a Feature's one PR (F4 #47;
// ARCHITECTURE.md §7). Reads tasks/features/<fid>/feature-state.md and the Feature's one
// tasks/features/<fid>/decisions-log.md (primary); each story's own tasks/stories/<sid>/decisions-log.md
// is a fallback for single-story runs and older Feature runs. Prints Markdown for the PR body.
//
// Usage: node run-report.js --feature <fid> [--root <home folder>]
//
// Per story it shows time taken (started → finished), attempts, findings, and the measured agent
// count, tokens and agents per model the orchestrator recorded from each agent's result (agents=,
// tokens=, models=sonnet:7,opus:2). A story with no measurement shows "not measured" rather than a
// guess. Decisions come from the Feature's own decisions-log.md, then any per-story logs.

const fs = require('node:fs');
const path = require('node:path');
const { readState } = require('./feature-state.js');

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function duration(start, end) {
  const ms = Date.parse(end) - Date.parse(start);
  if (!Number.isFinite(ms) || ms < 0) return null;
  const s = Math.round(ms / 1000);
  return s;
}

function fmtDuration(s) {
  if (s === null) return 'not measured';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}m ${s % 60}s` : `${m}m ${s % 60}s`;
}

const num = (v) => (v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
const fmtNum = (n) => n.toLocaleString('en-US');

// The "- " lines of a decisions log, without the dash; [] when the file does not exist.
function logLines(file) {
  if (!fs.existsSync(file)) return [];
  const out = [];
  for (const line of fs.readFileSync(file, 'utf8').replace(/\r/g, '').split('\n')) {
    const m = line.match(/^\s*-\s+(.*\S)/);
    if (m) out.push(m[1]);
  }
  return out;
}

function main() {
  const argv = process.argv.slice(2);
  const opt = (k) => { const i = argv.indexOf(k); return i === -1 ? undefined : argv[i + 1]; };
  const fid = opt('--feature');
  const root = opt('--root') || process.cwd();
  if (!fid || !ID_RE.test(fid) || fid.includes('..')) { process.stderr.write('usage: run-report.js --feature <fid> [--root <dir>]\n'); process.exit(2); }
  const state = readState(root, fid);
  if (!state) { process.stderr.write(`no feature-state.md for Feature #${fid}\n`); process.exit(1); }

  const lines = ['## Run report', '', '| Story | Status | Time | Attempts | Findings | Agents | Tokens | By model |', '|---|---|---|---|---|---|---|---|'];
  const total = { time: 0, attempts: 0, findings: 0, agents: 0, tokens: 0, noAgents: 0, noTokens: 0 };
  const totalModels = new Map();
  for (const s of state.stories) {
    // models=sonnet:7,opus:2 -> "sonnet 7, opus 2"
    const models = (s.models || '').split(',').map((p) => p.split(':')).filter(([name, n]) => name && Number.isFinite(Number(n)) && n !== '');
    for (const [name, n] of models) totalModels.set(name, (totalModels.get(name) || 0) + Number(n));
    const byModel = models.length ? models.map(([name, n]) => `${name} ${Number(n)}`).join(', ') : 'not measured';
    const t = duration(s.started, s.finished);
    const agents = num(s.agents);
    const tokens = num(s.tokens);
    if (t !== null) total.time += t;
    total.attempts += num(s.attempts) || 0;
    total.findings += num(s.findings) || 0;
    if (agents === null) total.noAgents++; else total.agents += agents;
    if (tokens === null) total.noTokens++; else total.tokens += tokens;
    lines.push(`| #${s.id} ${s.title || ''} | ${s.status} | ${fmtDuration(t)} | ${num(s.attempts) ?? 0} | ${num(s.findings) ?? 0} | ${agents === null ? 'not measured' : fmtNum(agents)} | ${tokens === null ? 'not measured' : fmtNum(tokens)} | ${byModel} |`);
  }
  const totalByModel = totalModels.size ? [...totalModels].map(([name, n]) => `${name} ${n}`).join(', ') : 'not measured';
  const missing = (n) => (n ? ` (${n} ${n === 1 ? 'story' : 'stories'} not measured)` : '');
  lines.push(`| **Total** | | ${fmtDuration(total.time)} | ${total.attempts} | ${total.findings} | ${fmtNum(total.agents)}${missing(total.noAgents)} | ${fmtNum(total.tokens)}${missing(total.noTokens)} | ${totalByModel} |`);

  lines.push('', '## Decisions made on your behalf', '');
  const decisions = [];
  // The Feature's own log first (since F72 the main session builds every story and writes here, each
  // line already prefixed "#<sid>:" when it is a story's), shown as written.
  for (const text of logLines(path.join(root, 'tasks', 'features', fid, 'decisions-log.md'))) decisions.push(`- ${text}`);
  // Then any per-story logs (older runs, and /implement's single-story runs).
  for (const s of state.stories) {
    for (const text of logLines(path.join(root, 'tasks', 'stories', s.id, 'decisions-log.md'))) {
      decisions.push(text.startsWith(`#${s.id}:`) ? `- ${text}` : `- #${s.id}: ${text}`);
    }
  }
  lines.push(...(decisions.length ? decisions : ['None.']));
  process.stdout.write(lines.join('\n') + '\n');
}

main();
