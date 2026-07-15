#!/usr/bin/env node
// @ts-check
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
  let mirror = false;

  // Read manifest for tracker, workflow pack, and mirror flag
  try {
    const manifestPath = path.join(projectRoot, '.claude', '.harness-manifest.json');
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      tracker = manifest.tracker || null;
      workflowPack = manifest.workflowPack || 'solo';
      mirror = manifest.trackerMirror === true;
    }
  } catch { /* fail-open */ }

  // Derive the mode: local (tasks/issues/ is the registry) | both (external
  // tracker + generated todo.md mirror) | tracker (external, no local board).
  // A generated todo.md dashboard exists only in local and both modes.
  const hasBoard = tracker === 'local' || (!!tracker && mirror);
  const names = { todoist: 'Todoist', github: 'GitHub Issues', ado: 'Azure DevOps' };
  const trackerName = names[tracker] || tracker;

  // Build the message based on the mode
  const parts = ['SESSION START:'];

  if (tracker === 'local') {
    parts.push('This project tracks tasks locally in tasks/issues/ — that is your task registry. tasks/todo.md is a generated dashboard of it (glance only — never hand-edit it). For exact task state, use the trackers/active/ scripts (list-issues.sh, get-issue.sh). tasks/notes.md is your scratch/notes.');
  } else if (tracker && mirror) {
    parts.push(`This project tracks tasks in ${trackerName} — the source of truth. tasks/todo.md is a generated mirror of it. When asked about tasks, status, or what to work on, query ${trackerName} first (via trackers/active/ scripts); todo.md is a local glance only, never hand-edited.`);
  } else if (tracker) {
    parts.push(`This project tracks tasks in ${trackerName}. When asked about tasks, status, or what to work on, query ${trackerName} first (via trackers/active/ scripts), not local files. There is no local task board.`);
  }

  if (workflowPack === 'solo') {
    parts.push(`Read tasks/notes.md${hasBoard ? ' and tasks/todo.md' : ''} for project context and conventions.`);
  } else {
    const files = ['tasks/lessons.md'];
    if (hasBoard) files.push('todo.md');
    files.push('pr-queue.md', 'flags-and-notes.md');
    parts.push(`Read ${files.join(', ')} for project context.`);
  }

  console.log(parts.join(' '));
});
