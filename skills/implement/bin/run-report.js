#!/usr/bin/env node
// run-report.js — the run report and combined decisions log for a Feature's one PR (F4 #47;
// ARCHITECTURE.md §7). Reads tasks/features/<fid>/feature-state.md and every story's own
// tasks/stories/<sid>/decisions-log.md (one writer per file), and prints Markdown for the PR body.
//
// Usage: node run-report.js --feature <fid> [--root <home folder>]
//
// Per story it shows time taken (started → finished), attempts, findings, and the measured agent
// count and tokens the orchestrator recorded from its runner's result (agents=, tokens=). A story with
// no measurement shows "not measured" rather than a guess.

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

function main() {
  const argv = process.argv.slice(2);
  const opt = (k) => { const i = argv.indexOf(k); return i === -1 ? undefined : argv[i + 1]; };
  const fid = opt('--feature');
  const root = opt('--root') || process.cwd();
  if (!fid || !ID_RE.test(fid) || fid.includes('..')) { process.stderr.write('usage: run-report.js --feature <fid> [--root <dir>]\n'); process.exit(2); }
  const state = readState(root, fid);
  if (!state) { process.stderr.write(`no feature-state.md for Feature #${fid}\n`); process.exit(1); }

  const lines = ['## Run report', '', '| Story | Status | Time | Attempts | Findings | Agents | Tokens |', '|---|---|---|---|---|---|---|'];
  const total = { time: 0, attempts: 0, findings: 0, agents: 0, tokens: 0, noAgents: 0, noTokens: 0 };
  for (const s of state.stories) {
    const t = duration(s.started, s.finished);
    const agents = num(s.agents);
    const tokens = num(s.tokens);
    if (t !== null) total.time += t;
    total.attempts += num(s.attempts) || 0;
    total.findings += num(s.findings) || 0;
    if (agents === null) total.noAgents++; else total.agents += agents;
    if (tokens === null) total.noTokens++; else total.tokens += tokens;
    lines.push(`| #${s.id} ${s.title || ''} | ${s.status} | ${fmtDuration(t)} | ${num(s.attempts) ?? 0} | ${num(s.findings) ?? 0} | ${agents === null ? 'not measured' : fmtNum(agents)} | ${tokens === null ? 'not measured' : fmtNum(tokens)} |`);
  }
  const missing = (n) => (n ? ` (${n} ${n === 1 ? 'story' : 'stories'} not measured)` : '');
  lines.push(`| **Total** | | ${fmtDuration(total.time)} | ${total.attempts} | ${total.findings} | ${fmtNum(total.agents)}${missing(total.noAgents)} | ${fmtNum(total.tokens)}${missing(total.noTokens)} |`);

  lines.push('', '## Decisions made on your behalf', '');
  const decisions = [];
  for (const s of state.stories) {
    const file = path.join(root, 'tasks', 'stories', s.id, 'decisions-log.md');
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').replace(/\r/g, '').split('\n')) {
      const m = line.match(/^\s*-\s+(.*\S)/);
      if (m) decisions.push(`- #${s.id}: ${m[1]}`);
    }
  }
  lines.push(...(decisions.length ? decisions : ['None.']));
  process.stdout.write(lines.join('\n') + '\n');
}

main();
