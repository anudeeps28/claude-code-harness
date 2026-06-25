#!/usr/bin/env node
// SessionStart hook — prints contextual next-step guidance based on detected
// project state (greenfield vs active). Reads planning artifacts and open
// GitHub issues to determine which state applies, then injects a short prompt
// nudging the developer toward the right next action.
//
// Fail-open: if project state can't be determined, the session starts normally.

const { execFileSync } = require('node:child_process');
const { readStdinJson, injectContext, ok, runHook } = require('./lib/hook-io');
const { detectProjectState, detectFirstOpenIssue, renderGuidance } = require('./lib/project-state');

function git(args) {
  try { return execFileSync('git', args, { encoding: 'utf8' }).trim(); }
  catch { return ''; }
}

runHook('session-router', async () => {
  await readStdinJson();
  const projectRoot = git(['rev-parse', '--show-toplevel']) || process.cwd();
  const { state, signals } = detectProjectState(projectRoot);
  // Only fetch the first issue when detection already confirmed an open issue
  // exists (signals.openIssues >= 1). This skips a redundant ~1.5s gh subprocess
  // for active-by-artifact projects and when gh is unavailable (openIssues null).
  let firstIssue = null;
  if (state === 'active' && signals.openIssues >= 1) firstIssue = detectFirstOpenIssue();
  const message = renderGuidance(state, signals, firstIssue);
  if (!message) return ok();
  injectContext('SessionStart', '## Next step\n' + message);
});
