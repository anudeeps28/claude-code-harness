#!/usr/bin/env node
// @ts-check
// PreCompact hook — save in-progress state before context window compaction.
// Appends a timestamp marker to tasks/todo.md and injects a reminder to Claude.

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { injectContext, runHook } = require('./lib/hook-io');

function projectRoot() {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  } catch {
    return process.cwd();
  }
}

function pad(n) { return String(n).padStart(2, '0'); }

function timestamp() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

runHook('pre-compact', async () => {
  const root = projectRoot();
  const notesFile = path.join(root, 'tasks', 'notes.md');

  // Read tracker from manifest
  let tracker = null;
  try {
    const manifestPath = path.join(root, '.claude', '.harness-manifest.json');
    if (fs.existsSync(manifestPath)) {
      tracker = JSON.parse(fs.readFileSync(manifestPath, 'utf8')).tracker || null;
    }
  } catch { /* fail-open */ }

  const resumeSteps = [
    '- Check git status to confirm what is staged/committed',
    '- Ask the user to confirm which task to continue from',
  ];
  if (tracker) {
    resumeSteps.unshift(`- Query the ${tracker} tracker for current task status (via trackers/active/ scripts)`);
  }
  if (fs.existsSync(path.join(root, 'tasks', 'lessons.md'))) {
    resumeSteps.unshift('- Re-read tasks/lessons.md before writing any code');
  }

  // Breadcrumb goes to notes.md (D12: session narrative → notes.md), NOT todo.md
  // (D9: nothing hand-writes todo.md — it is a generated dashboard).
  const notesDir = path.dirname(notesFile);
  try { fs.mkdirSync(notesDir, { recursive: true }); } catch { /* exists */ }
  const marker = [
    '',
    `## ⚠️ CONTEXT COMPACTED AT ${timestamp()}`,
    'Claude Code compacted the context window. If you are resuming after this point:',
    ...resumeSteps,
    '',
  ].join('\n');
  try { fs.appendFileSync(notesFile, marker); } catch { /* best-effort */ }

  const trackerNote = tracker
    ? ` Check the ${tracker} tracker for current task state.`
    : '';

  injectContext(
    'PreCompact',
    '⚠️ CONTEXT IS ABOUT TO BE COMPACTED. Before compaction proceeds, you must: ' +
    '(1) Update tasks/notes.md with exactly which task you are currently in the middle of — be specific ' +
    '(file, action, what is done, what is not done yet). (2) Write the current git status (any uncommitted changes). ' +
    '(3) Note any test results or errors seen.' + trackerNote +
    ' A timestamp marker has already been appended to notes.md. ' +
    'Add the in-progress detail now.'
  );
});
