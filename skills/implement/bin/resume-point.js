#!/usr/bin/env node
// resume-point.js — where `/implement --resume <id>` re-enters a stopped standalone run (#25, rewritten
// for F73 #83). Reads tasks/stories/<id>/executor-state.md (the saved state, see "State and progress"
// in ../SKILL.md) and checks tasks/stories/<id>/plan.md exists, then prints plain `key: value` lines:
//
//   run-mode:   interactive | autonomous   (an autonomous run resumes autonomous)
//   branch:     the branch the run was on, when saved
//   step:       the saved step: the one in flight, which a resume starts again
//   next:       the step to run now: the step the run re-enters (the same as `step:`, since the saved step
//               is the one in flight). Not printed when the step is `done`: a finished run says so instead.
//   round:      only when the step is `review`: the saved review round, 1 when none was saved
//   red-file:   one line per path listed under `## Red files` (the red set saved at the red step): a
//               resume at `code` restores nothing in this list
//
// The standalone run builds with the story loop, so the saved `step:` (and `round:` in a review) are the
// whole position: there are no task statuses and no waves. A state a run before #83 saved (task XML in
// the plan, a per-task Progress table in the state, a `wave-<n>` step) prints one `legacy:` line and
// exits 1: the person restarts from the plan.
//
// A run saved before its plan was approved (`step: understand|goal|plan`) exits 1 with "re-run
// /implement <id>": there is no approved plan to build from.
//
// Exits 1 with a message when there is no saved state or no plan; it never invents a fresh start.
//
// Usage: node resume-point.js [--root <project-root>] <story-id>

const fs = require('node:fs');
const path = require('node:path');

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function fail(message) {
  process.stdout.write(`${message}\n`);
  process.exit(1);
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

  const planText = fs.readFileSync(planPath, 'utf8').replace(/\r/g, '');
  const stateText = fs.readFileSync(statePath, 'utf8').replace(/\r/g, '');
  const key = (name) => (stateText.match(new RegExp(`^${name}:[ \\t]*(.+)$`, 'm')) || [])[1]?.trim();

  const step = key('step');
  // The task XML itself, not prose that mentions a task tag.
  const legacy = /<tasks\s+story=/.test(planText) || /<task\s+id=/.test(planText)
    || /^\|\s*Task\s*\|.*\bWave\b/mi.test(stateText) || /^wave-\d+$/.test(step || '');
  if (legacy) {
    fail(`legacy: this run was saved with task XML and waves (step: ${step || 'unknown'}), which are retired; restart from the plan`);
  }
  if (!step) fail(`saved state for story ${id} has no step: line — cannot tell where to re-enter`);
  if (['understand', 'goal', 'plan'].includes(step)) {
    fail(`step: ${step} — re-run /implement ${id}: the plan was not approved, so there is nothing to build from`);
  }

  const out = [`run-mode: ${key('run-mode') || 'interactive'}`];
  const branch = key('branch');
  if (branch) out.push(`branch: ${branch}`);
  out.push(`step: ${step}`);
  if (step === 'done') {
    out.push('the run is finished: there is no next build step');
    process.stdout.write(out.join('\n') + '\n');
    return;
  }
  out.push(`next: ${step}`);
  // The red set (tests and stubs) saved at the red step, one `- path` per line under "## Red files".
  // A resume at `code` must not restore these.
  let inRed = false;
  for (const line of stateText.split('\n')) {
    if (/^#{1,6}\s/.test(line)) { inRed = /^#{1,6}\s+Red files\s*$/i.test(line); continue; }
    const m = inRed && line.match(/^- (\S.*?)\s*$/);
    if (m) out.push(`red-file: ${m[1]}`);
  }
  if (step === 'review') {
    const round = Number(key('round'));
    out.push(`round: ${Number.isInteger(round) && round >= 1 ? round : 1}`);
  }
  process.stdout.write(out.join('\n') + '\n');
}

main();
