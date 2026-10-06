#!/usr/bin/env node
// progress.js — prints one [harness] progress line and appends it to the story's progress.log
// (#24). Format and events: ARCHITECTURE.md §7. Sanitising: rules/phase-markers.md "Writing
// detail safely" — the detail is one line, has no control characters, no double quote that could
// close detail="...", and is cut to 200 characters.
//
// Usage: node progress.js [--root <project-root>] [--feature <fid>] <story-id> <event> <phase> [detail...]
// Writes <root>/tasks/stories/<story-id>/progress.log (root defaults to the current directory).
// In a Feature run (--feature, F4 #47) the line carries feature=<fid> and story=<sid>, and goes to
// <root>/tasks/features/<fid>/progress.log; a story id of "-" marks a Feature-level line.

const fs = require('node:fs');
const path = require('node:path');

const EVENTS = new Set([
  'run-started', 'run-resumed', 'run-paused', 'run-finished',
  'phase', 'step', 'task-verified', 'task-done', 'task-reopened', 'review-done', 'pr-opened',
  'tracker-error',
  'story-started', 'story-merged', 'story-stuck', 'merge-tested',
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
  let feature = null;
  for (;;) {
    if (argv[0] === '--root') { root = argv[1]; argv.splice(0, 2); }
    else if (argv[0] === '--feature') { feature = argv[1]; argv.splice(0, 2); }
    else break;
  }
  const [id, event, phase, ...rest] = argv;
  const validId = (v) => v && ID_RE.test(v) && !v.includes('..');
  if (feature !== null && !validId(feature)) fail(`invalid feature id: ${JSON.stringify(feature)}`);
  const featureLevel = feature !== null && id === '-';
  if (!featureLevel && !validId(id)) fail(`invalid story id: ${JSON.stringify(id)}`);
  if (!EVENTS.has(event)) fail(`unknown event: ${JSON.stringify(event)} (one of ${[...EVENTS].join(', ')})`);
  if (!PHASES.has(phase)) fail(`unknown phase: ${JSON.stringify(phase)} (one of ${[...PHASES].join(', ')})`);

  const ts = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const who = feature === null ? `story=${id}` : `feature=${feature}${featureLevel ? '' : ` story=${id}`}`;
  const line = `[harness] ts=${ts} ${who} event=${event} phase=${phase} detail="${cleanDetail(rest.join(' '))}"`;
  const dir = feature === null ? path.join(root, 'tasks', 'stories', id) : path.join(root, 'tasks', 'features', feature);
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(path.join(dir, 'progress.log'), line + '\n');
  process.stdout.write(line + '\n');
}

main();
