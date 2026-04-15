#!/usr/bin/env node
// PostToolUse hook — re-run the skills catalog when a .claude/skills,
// .claude/agents, or .claude/commands file was edited.

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { readStdinJson, ok, runHook } = require('./lib/hook-io');

runHook('catalog-trigger', async () => {
  const input = await readStdinJson();
  const filePath = (input.tool_input && input.tool_input.file_path) || '';
  if (!filePath) return ok();

  const normalized = filePath.replace(/\\/g, '/');
  if (!/\/\.claude\/(skills|agents|commands)\//.test(normalized)) return ok();

  const catalogScript = path.join(__dirname, 'catalog-skills.js');
  if (!fs.existsSync(catalogScript)) {
    process.stderr.write(`catalog-trigger.js: catalog-skills.js not found at '${catalogScript}'\n`);
    process.exit(1);
  }

  // Fire and forget — don't block the PostToolUse return.
  const child = spawn(process.execPath, [catalogScript, '--silent'], {
    detached: true, stdio: 'ignore',
  });
  child.unref();

  ok();
});
