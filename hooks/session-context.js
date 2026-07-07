#!/usr/bin/env node
// @ts-check
// SessionStart hook — injects relevant learnings from past sessions.
//
// Reads project-local and global learnings, ranks by effectiveness score
// and relevance to the current branch/context, injects the top 5 as
// soft context hints. Records which learnings were injected (with categories)
// so the SessionEnd hook can score them per-category.
//
// The injected-learnings file is namespaced by session ID to avoid races
// when multiple sessions run against the same project.
//
// Fail-open: if learnings can't be read, the session starts normally.

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { readStdinJson, injectContext, ok, runHook } = require('./lib/hook-io');
const { readLearnings, rankLearnings } = require('./lib/learnings');

function git(args) {
  try { return execFileSync('git', args, { encoding: 'utf8' }).trim(); }
  catch { return ''; }
}

function injectedFilePath(projectRoot, sessionId) {
  return path.join(projectRoot, 'tasks', `.learnings-injected-${sessionId}.json`);
}

runHook('session-context', async () => {
  const input = await readStdinJson();
  const sessionId = input.session_id || `unknown-${Date.now()}`;
  const projectRoot = git(['rev-parse', '--show-toplevel']) || process.cwd();
  const branch = git(['branch', '--show-current']) || '';

  const { project, global } = readLearnings(projectRoot);
  const allLearnings = [...project, ...global];

  if (!allLearnings.length) return ok();

  const ranked = rankLearnings(allLearnings, branch);

  if (!ranked.length) return ok();

  const injectedPath = injectedFilePath(projectRoot, sessionId);
  const injectedEntries = ranked.map(l => ({ hash: l.hash, category: l.category }));
  try {
    fs.mkdirSync(path.join(projectRoot, 'tasks'), { recursive: true });
    fs.writeFileSync(injectedPath, JSON.stringify({
      session_id: sessionId,
      timestamp: new Date().toISOString(),
      entries: injectedEntries,
    }, null, 2) + '\n', 'utf8');
  } catch { /* best-effort — don't block session start */ }

  const lines = ranked.map(l =>
    `- [${l.category}] ${l.learning} (score: ${l.score}, seen ${l.injections} times)`
  );

  injectContext('SessionStart',
    '## Learnings from past sessions\n' +
    'These patterns were learned from previous work. Apply where relevant:\n\n' +
    lines.join('\n')
  );
});
