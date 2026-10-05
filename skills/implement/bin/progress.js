#!/usr/bin/env node
// progress.js — prints one [harness] progress line and appends it to the story's progress.log
// (#24). Format and events: ARCHITECTURE.md §7. Sanitising: rules/phase-markers.md "Writing
// detail safely" — the detail is one line, has no control characters, no double quote that could
// close detail="...", and is cut to 200 characters.
//
// Usage: node progress.js [--root <project-root>] <story-id> <event> <phase> [detail...]
// Writes <root>/tasks/stories/<story-id>/progress.log (root defaults to the current directory).

const fs = require('node:fs');
const path = require('node:path');

const EVENTS = new Set([
  'run-started', 'run-resumed', 'run-paused', 'run-finished',
  'phase', 'step', 'task-verified', 'task-done', 'task-reopened', 'review-done', 'pr-opened',
]);
const PHASES = new Set(['planning', 'coding', 'testing', 'reviewing', 'shipping']);
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const MAX_DETAIL = 200;

function cleanDetail(text) {
  return text
    .replace(/[\r\n]+/g, ' ')
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x7f]/g, '')
    .replace(/"/g, "'")
    .replace(/ {2,}/g, ' ')
    .trim()
    .slice(0, MAX_DETAIL);
}

function fail(message) {
  process.stderr.write(`progress.js: ${message}\n`);
  process.exit(1);
}

function main() {
  const argv = process.argv.slice(2);
  let root = process.cwd();
  if (argv[0] === '--root') { root = argv[1]; argv.splice(0, 2); }
  const [id, event, phase, ...rest] = argv;
  if (!id || !ID_RE.test(id) || id.includes('..')) fail(`invalid story id: ${JSON.stringify(id)}`);
  if (!EVENTS.has(event)) fail(`unknown event: ${JSON.stringify(event)} (one of ${[...EVENTS].join(', ')})`);
  if (!PHASES.has(phase)) fail(`unknown phase: ${JSON.stringify(phase)} (one of ${[...PHASES].join(', ')})`);

  const ts = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const line = `[harness] ts=${ts} story=${id} event=${event} phase=${phase} detail="${cleanDetail(rest.join(' '))}"`;
  const dir = path.join(root, 'tasks', 'stories', id);
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(path.join(dir, 'progress.log'), line + '\n');
  process.stdout.write(line + '\n');
}

main();
