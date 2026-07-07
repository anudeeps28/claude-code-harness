#!/usr/bin/env node
// @ts-check
// SessionEnd hook — appends session log with outcome data and scores learnings.
//
// 1. Logs: timestamp, session_id, branch, story_id, outcome metrics.
// 2. Reads .learnings-injected-<session_id>.json (written by session-context.js).
// 3. Checks metrics.jsonl for deny/block events this session to detect recurrence.
// 4. Scores each injected learning per-category:
//    - If the learning's category matches a recurred category → -1
//    - If the learning's category had no recurrence → +1
// 5. Cleans up the session-specific injected file.
//
// Rotates sessions.jsonl at 10MB (gzip, keeps 5). Never blocks session exit.

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { readStdinJson, ok, runHook, appendWithRotation } = require('./lib/hook-io');
const { scoreLearning, readLearnings } = require('./lib/learnings');

function git(args) {
  try { return execFileSync('git', args, { encoding: 'utf8' }).trim(); }
  catch { return ''; }
}

function readMetricsForSession(projectRoot, sessionStart) {
  const metricsPath = path.join(projectRoot, 'tasks', 'metrics.jsonl');
  const result = { denials: 0, blocks: 0, errors: 0, deniedRules: [] };
  try {
    const lines = fs.readFileSync(metricsPath, 'utf8').split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const m = JSON.parse(line);
        if (sessionStart && new Date(m.ts).getTime() < new Date(sessionStart).getTime()) continue;
        if (m.decision === 'deny') {
          result.denials++;
          if (m.rule) result.deniedRules.push(m.rule);
        }
        if (m.decision === 'block') result.blocks++;
        if (m.decision === 'error') result.errors++;
      } catch { /* skip malformed */ }
    }
  } catch { /* no metrics file — that's fine */ }
  return result;
}

function injectedFilePath(projectRoot, sessionId) {
  return path.join(projectRoot, 'tasks', `.learnings-injected-${sessionId}.json`);
}

function readInjectedLearnings(projectRoot, sessionId) {
  const filePath = injectedFilePath(projectRoot, sessionId);
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch { return null; }
}

function cleanupInjectedFile(projectRoot, sessionId) {
  try { fs.unlinkSync(injectedFilePath(projectRoot, sessionId)); } catch { /* already gone */ }
}

function recurrenceCategories(metrics) {
  const categories = new Set();
  if (metrics.denials > 0) categories.add('security');
  if (metrics.blocks > 0) categories.add('drift');
  for (const rule of metrics.deniedRules) {
    const lower = (rule || '').toLowerCase();
    if (lower.includes('secret') || lower.includes('credential')) categories.add('security');
    if (lower.includes('build') || lower.includes('compile')) categories.add('build-fix');
    if (lower.includes('style') || lower.includes('lint')) categories.add('code-rabbit');
  }
  return categories;
}

runHook('session-log', async () => {
  const input = await readStdinJson();
  const sessionId = input.session_id || 'unknown';
  const source = input.matcher || 'unknown';

  const projectRoot = git(['rev-parse', '--show-toplevel']) || process.cwd();
  const branch = git(['branch', '--show-current']) || 'unknown';
  const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const storyId = (branch.match(/\d{4,5}/) || [''])[0];

  const injected = readInjectedLearnings(projectRoot, sessionId);
  const sessionStart = injected ? injected.timestamp : null;
  const injectedEntries = injected ? (injected.entries || []) : [];
  const injectedHashes = injectedEntries.map(e => e.hash);

  const metrics = readMetricsForSession(projectRoot, sessionStart);

  const entry = JSON.stringify({
    timestamp,
    session_id: sessionId,
    branch,
    story_id: storyId,
    source,
    outcome: {
      safety_denials: metrics.denials,
      drift_blocks: metrics.blocks,
      errors: metrics.errors,
    },
    learnings_injected: injectedHashes,
  });

  const logFile = path.join(projectRoot, 'tasks', 'sessions.jsonl');
  appendWithRotation(logFile, entry);

  if (injectedEntries.length) {
    const recurred = recurrenceCategories(metrics);
    const { project, global } = readLearnings(projectRoot);
    const allByHash = new Map();
    for (const l of project) allByHash.set(l.hash, 'project');
    for (const l of global) allByHash.set(l.hash, 'global');

    for (const { hash, category } of injectedEntries) {
      const scope = allByHash.get(hash);
      if (!scope) continue;
      const delta = recurred.has(category) ? -1 : 1;
      scoreLearning(hash, delta, scope, projectRoot, { injected: true });
    }
    cleanupInjectedFile(projectRoot, sessionId);
  }

  ok();
});
