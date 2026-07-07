#!/usr/bin/env node
// SessionStart hook — emits a tracker-aware startup message.
// Reads the manifest to determine the active tracker, then tells Claude
// where to look for tasks and project state.

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { readStdinJson, ok: _ok, runHook } = require('./lib/hook-io');

function git(args) {
  try { return execFileSync('git', args, { encoding: 'utf8' }).trim(); }
  catch { return ''; }
}

runHook('session-start-msg', async () => {
  await readStdinJson();
  const projectRoot = git(['rev-parse', '--show-toplevel']) || process.cwd();

  let tracker = null;
  let workflowPack = 'solo';

  // Read manifest for tracker and workflow pack
  try {
    const manifestPath = path.join(projectRoot, '.claude', '.harness-manifest.json');
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      tracker = manifest.tracker || null;
      workflowPack = manifest.workflowPack || 'solo';
    }
  } catch { /* fail-open */ }

  // Build the message based on tracker
  const parts = ['SESSION START:'];

  if (tracker === 'todoist') {
    parts.push('This project tracks tasks in Todoist. When asked about tasks, status, or what to work on, query Todoist first (via trackers/active/ scripts), not local files.');
  } else if (tracker === 'ado') {
    parts.push('This project tracks tasks in Azure DevOps. When asked about tasks, status, or what to work on, query ADO first (via trackers/active/ scripts), not local files.');
  } else if (tracker === 'github') {
    parts.push('This project tracks tasks in GitHub Issues. When asked about tasks, status, or what to work on, query GitHub first (via trackers/active/ scripts), not local files.');
  }

  if (workflowPack === 'solo') {
    parts.push('Read tasks/notes.md and tasks/plan.md for project context and conventions.');
  } else {
    parts.push('Read tasks/lessons.md, todo.md, pr-queue.md, and flags-and-notes.md for project context.');
  }

  console.log(parts.join(' '));
});
