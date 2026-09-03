#!/usr/bin/env node
// @ts-check
// PostToolUse hook — lints tasks/stories/<id>/plan.md for red-window
// violations after it is written or edited.

const fs = require('node:fs');
const { readStdinJson, ok, blockPost, runHook } = require('./lib/hook-io');
const { lintRedWindow } = require('./lib/plan-lint');

// Coerces any untrusted value into a safe single-line string: nothing from
// the plan XML or tool input may reach the reason with a newline still in
// it. A plain character-for-character replace of CR/LF/other C0 control
// chars with a space is not enough on its own -- it neutralizes the newline
// but leaves everything the attacker put after it sitting inline in the
// same field (e.g. a forged status line embedded via a crafted id="...").
// So on the first control character found, the value is truncated there --
// nothing after it survives -- and only then is the remaining (already
// single-line) text whitespace-collapsed and length-capped.
function oneLine(value, max) {
  let str;
  if (value === null) str = 'null';
  else if (value === undefined) str = 'unknown';
  else str = String(value);

  let controlIndex = -1;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) { controlIndex = i; break; }
  }
  let truncated = false;
  if (controlIndex !== -1) {
    str = str.slice(0, controlIndex);
    truncated = true;
  }

  str = str.replace(/\s+/g, ' ').trim();

  if (str.length > max) {
    str = str.slice(0, max).trimEnd();
    truncated = true;
  }

  if (truncated) str += '…';
  return str;
}

runHook('plan-lint-check', async () => {
  const input = await readStdinJson();
  const filePath = (input.tool_input && input.tool_input.file_path) || '';
  if (!filePath) return ok();

  const normalized = filePath.replace(/\\/g, '/');
  if (!/\/tasks\/stories\/[^/]+\/plan\.md$/.test(normalized)) return ok();

  let text = input.tool_input && input.tool_input.content;
  if (typeof text !== 'string' || text.length === 0) {
    try {
      text = fs.readFileSync(filePath, 'utf8');
    } catch (err) {
      if (err && err.code === 'ENOENT') return ok();
      const code = (err && err.code) || 'UNKNOWN';
      const message = (err && err.message) || String(err);
      const lines = [
        `${oneLine(filePath, 200)} is present but could not be read:`,
        `- [plan_unreadable] ${oneLine(code, 200)}: ${oneLine(message, 500)}`,
        'Fix the plan\'s wave structure before running it.',
      ];
      return blockPost(lines.join('\n'));
    }
  }

  const violations = lintRedWindow(text);
  if (violations.length === 0) return ok();

  const lines = [
    `${oneLine(filePath, 200)} has ${violations.length} red-window violation(s):`,
    ...violations.map((v) => `- [${oneLine(v.rule, 200)}] ${oneLine(v.taskId, 200)}: ${oneLine(v.message, 500)}`),
    'Fix the plan\'s wave structure before running it.',
  ];
  blockPost(lines.join('\n'));
});
