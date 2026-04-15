#!/usr/bin/env node
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
  const tasksFile = path.join(projectRoot(), 'tasks', 'todo.md');
  if (fs.existsSync(tasksFile)) {
    const marker = [
      '',
      `## ⚠️ CONTEXT COMPACTED AT ${timestamp()}`,
      'Claude Code compacted the context window. If you are resuming after this point:',
      '- Re-read tasks/todo.md from the top to understand current state',
      '- Re-read tasks/lessons.md before writing any code',
      '- Check git status to confirm what is staged/committed',
      '- Ask the user to confirm which task to continue from',
      '',
    ].join('\n');
    try { fs.appendFileSync(tasksFile, marker); } catch { /* best-effort */ }
  }

  injectContext(
    'PreCompact',
    '⚠️ CONTEXT IS ABOUT TO BE COMPACTED. Before compaction proceeds, you must: ' +
    '(1) Update tasks/todo.md with exactly which task you are currently in the middle of — be specific ' +
    '(file, action, what is done, what is not done yet). (2) Write the current git status (any uncommitted changes). ' +
    '(3) Note any test results or errors seen. A timestamp marker has already been appended to todo.md. ' +
    'Add the in-progress detail now.'
  );
});
