#!/usr/bin/env node
// @ts-check
// SessionStart hook — prints contextual next-step guidance based on detected
// project state (greenfield vs active). Reads planning artifacts and open
// GitHub issues to determine which state applies, then injects a short prompt
// nudging the developer toward the right next action.
//
// Fail-open: if project state can't be determined, the session starts normally.

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { readStdinJson, injectContext, ok, runHook } = require('./lib/hook-io');
const { detectProjectState, detectFirstOpenIssue, readTodoistProject, renderGuidance, verifyTrackerAdapters } = require('./lib/project-state');

function git(args) {
  try { return execFileSync('git', args, { encoding: 'utf8' }).trim(); }
  catch { return ''; }
}

runHook('session-router', async () => {
  await readStdinJson();
  const projectRoot = git(['rev-parse', '--show-toplevel']) || process.cwd();
  const { state, signals } = detectProjectState(projectRoot);
  // Only fetch the first issue/task when detection already confirmed an open
  // one exists (signals.openIssues >= 1). This skips a redundant CLI subprocess
  // for active-by-artifact projects and when the tracker is unavailable.
  let firstIssue = null;
  if (state === 'active' && signals.openIssues >= 1) {
    firstIssue = detectFirstOpenIssue({ activeTracker: signals.tracker });
  }
  const message = renderGuidance(state, signals, firstIssue);

  // Check tracker configuration
  let trackerInfo = '';
  try {
    const manifestPath = path.join(projectRoot, '.claude', '.harness-manifest.json');
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      if (!manifest.tracker) {
        trackerInfo = '\n\n## Tracker not configured\nNo tracker is set for this project. Run `/update-harness` to choose one (GitHub, Todoist, or ADO). Until configured, /implement cannot fetch tasks from your tracker.';
      } else {
        const { match, manifestTracker, detectedTracker } = verifyTrackerAdapters(projectRoot);
        if (!match && detectedTracker) {
          trackerInfo = `\n\n## Tracker mismatch\nManifest says "${manifestTracker}" but adapter scripts look like "${detectedTracker}". Run \`/update-harness\` to fix.`;
        } else {
          const names = { todoist: 'Todoist', github: 'GitHub Issues', ado: 'Azure DevOps' };
          trackerInfo = `\n\n## Active tracker: ${names[manifest.tracker] || manifest.tracker}\nAll task queries (/implement, "what's next?", status checks) should go to ${names[manifest.tracker] || manifest.tracker} first. Use \`trackers/active/\` adapter scripts. Local files (tasks/) are for implementation notes, not task tracking.`;
          if (manifest.tracker === 'todoist' && !readTodoistProject(projectRoot)) {
            trackerInfo += `\n\n## ⚠ Todoist project not configured\nNo \`todoist_project\` is set in \`tasks/tracker-config.md\`. Without it, task queries return ALL tasks across ALL Todoist projects (expensive and noisy). Fix: add \`todoist_project = Your Project Name\` to \`tasks/tracker-config.md\`, or re-run the harness installer.`;
          }
        }
      }
    }
  } catch { /* fail-open */ }

  if (!message && !trackerInfo) return ok();
  injectContext('SessionStart', '## Next step\n' + (message || '') + trackerInfo);
});
