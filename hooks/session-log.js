#!/usr/bin/env node
// SessionEnd hook — appends a session log entry to tasks/sessions.jsonl.
// Logs: timestamp, session_id, branch, story_id (parsed from branch).
// Rotates at 10MB (gzip-compresses old, keeps last 5). Never blocks session exit.

const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { readStdinJson, ok, runHook, appendWithRotation } = require('./lib/hook-io');

function git(args) {
  try { return execFileSync('git', args, { encoding: 'utf8' }).trim(); }
  catch { return ''; }
}

runHook('session-log', async () => {
  const input = await readStdinJson();
  const sessionId = input.session_id || 'unknown';
  const source = input.matcher || 'unknown';

  const projectRoot = git(['rev-parse', '--show-toplevel']) || process.cwd();
  const branch = git(['branch', '--show-current']) || 'unknown';
  const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

  const storyId = (branch.match(/\d{4,5}/) || [''])[0];

  const logFile = path.join(projectRoot, 'tasks', 'sessions.jsonl');
  const entry = JSON.stringify({
    timestamp, session_id: sessionId, branch, story_id: storyId, source,
  });
  appendWithRotation(logFile, entry);

  ok();
});
