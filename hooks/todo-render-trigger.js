#!/usr/bin/env node
// @ts-check
// PostToolUse hook — re-render tasks/todo.md when a file under tasks/issues/
// is edited directly. Only active in local tracker mode (reads manifest).

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { readStdinJson, ok, runHook } = require('./lib/hook-io');

runHook('todo-render-trigger', async () => {
  const input = await readStdinJson();
  const filePath = (input.tool_input && input.tool_input.file_path) || '';
  if (!filePath) return ok();

  const normalized = filePath.replace(/\\/g, '/');
  if (!/\/tasks\/issues\//.test(normalized)) return ok();

  // Check manifest — only fire in local mode
  const manifestPath = path.join(process.cwd(), '.claude', '.harness-manifest.json');
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (manifest.tracker !== 'local') return ok();
  } catch {
    // No manifest or unreadable — assume not local mode
    return ok();
  }

  // Fire render-todo.sh (fire and forget)
  const renderScript = path.join(__dirname, '..', 'trackers', 'lib', 'render-todo.sh');
  if (!fs.existsSync(renderScript)) {
    process.stderr.write(`todo-render-trigger.js: render-todo.sh not found at '${renderScript}'\n`);
    return ok();
  }

  const child = spawn('bash', [renderScript, 'tasks/issues'], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();

  ok();
});
