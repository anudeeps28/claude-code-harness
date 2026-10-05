#!/usr/bin/env node
// resume-point.js — where `/implement --resume <id>` re-enters a stopped run (#25). Reads
// tasks/stories/<id>/executor-state.md (the saved state, see "State and progress" in ../SKILL.md)
// and tasks/stories/<id>/plan.md (the task XML), and prints plain `key: value` lines:
//
//   run-mode:   interactive | autonomous   (an autonomous run resumes autonomous)
//   branch:     the branch the run was on, when saved
//   next:       wave-<n>, or the saved next step once every task is finished
//   finished:   tasks already verified or done; never redone
//   to-run:     tasks still to run, in id order
//   restore:    half-done tasks whose declared <files> must be restored before the retry
//   keep-as-is: half-done must_fail tasks, never restored (rules/wave-execution.md)
//   reopened:   tasks a review finding reopened; fixed in the review step, not re-run
//
// Exits 1 with a message when there is no saved state or no plan; it never invents a fresh start.
//
// Usage: node resume-point.js [--root <project-root>] <story-id>

const fs = require('node:fs');
const path = require('node:path');

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const FINISHED = new Set(['verified', 'done']);
const HALF_DONE = new Set(['running', 'failed']);
// Older state files wrote "✅ PASS" / "❌ ESCALATED"; read them as the statuses they meant.
const LEGACY = { pass: 'verified', escalated: 'failed', blocked: 'failed', fail: 'failed' };

function fail(message) {
  process.stdout.write(`${message}\n`);
  process.exit(1);
}

function readTasks(planText) {
  const tasks = [];
  for (const m of planText.matchAll(/<task\s([^>]*)>([\s\S]*?)<\/task>/g)) {
    const attr = (name) => (m[1].match(new RegExp(`\\b${name}="([^"]*)"`)) || [])[1];
    const files = (m[2].match(/<files>([\s\S]*?)<\/files>/) || [])[1] || '';
    tasks.push({
      id: Number(attr('id')),
      wave: Number(attr('parallel_group')),
      mustFail: attr('must_fail') === 'true',
      files: files.split(',').map((f) => f.trim()).filter(Boolean),
    });
  }
  return tasks.filter((t) => Number.isInteger(t.id)).sort((a, b) => a.id - b.id);
}

function readState(stateText) {
  const key = (name) => (stateText.match(new RegExp(`^${name}:\\s*(.+)$`, 'm')) || [])[1]?.trim();
  const statuses = new Map();
  let taskCol = -1;
  let statusCol = -1;
  for (const line of stateText.split('\n')) {
    if (!line.trim().startsWith('|')) { taskCol = statusCol = -1; continue; }
    const cells = line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
    if (taskCol === -1) {
      const lower = cells.map((c) => c.toLowerCase());
      taskCol = lower.indexOf('task');
      statusCol = lower.indexOf('status');
      if (statusCol === -1) statusCol = lower.indexOf('result');
      if (taskCol === -1 || statusCol === -1) taskCol = statusCol = -1;
      continue;
    }
    const id = Number(cells[taskCol]);
    if (!Number.isInteger(id) || id <= 0) continue;
    const word = ((cells[statusCol] || '').toLowerCase().match(/[a-z-]+/) || ['pending'])[0];
    statuses.set(id, LEGACY[word] || word);
  }
  return { runMode: key('run-mode') || 'interactive', branch: key('branch'), next: key('next'), statuses };
}

function main() {
  const argv = process.argv.slice(2);
  let root = process.cwd();
  if (argv[0] === '--root') { root = argv[1]; argv.splice(0, 2); }
  const id = argv[0];
  if (!id || !ID_RE.test(id) || id.includes('..')) fail(`invalid story id: ${JSON.stringify(id)}`);

  const dir = path.join(root, 'tasks', 'stories', id);
  const statePath = path.join(dir, 'executor-state.md');
  const planPath = path.join(dir, 'plan.md');
  if (!fs.existsSync(statePath)) fail(`no saved state for story ${id} (${statePath} does not exist) — nothing to resume`);
  if (!fs.existsSync(planPath)) fail(`saved state for story ${id} but no plan (${planPath}) — cannot tell what is left`);

  const tasks = readTasks(fs.readFileSync(planPath, 'utf8').replace(/\r/g, ''));
  const state = readState(fs.readFileSync(statePath, 'utf8').replace(/\r/g, ''));
  const status = (t) => state.statuses.get(t.id) || 'pending';

  const finished = tasks.filter((t) => FINISHED.has(status(t)));
  const reopened = tasks.filter((t) => status(t) === 'reopened');
  const toRun = tasks.filter((t) => !FINISHED.has(status(t)) && status(t) !== 'reopened');
  const halfDone = toRun.filter((t) => HALF_DONE.has(status(t)));
  const restore = halfDone.filter((t) => !t.mustFail);
  const keep = halfDone.filter((t) => t.mustFail);

  const ids = (list) => (list.length ? list.map((t) => t.id).join(', ') : 'none');
  const next = toRun.length ? `wave-${Math.min(...toRun.map((t) => t.wave))}` : (state.next || 'review');

  const out = [`run-mode: ${state.runMode}`];
  if (state.branch) out.push(`branch: ${state.branch}`);
  out.push(
    `next: ${next}`,
    `finished: ${ids(finished)}`,
    `to-run: ${ids(toRun)}`,
    `restore: ${restore.length ? restore.map((t) => `task ${t.id}: ${t.files.join(', ')}`).join('; ') : 'none'}`,
  );
  if (keep.length) out.push(`keep-as-is: ${keep.map((t) => `task ${t.id} (must_fail: its test file is the evidence)`).join('; ')}`);
  if (reopened.length) out.push(`reopened: ${ids(reopened)}`);
  process.stdout.write(out.join('\n') + '\n');
}

main();
