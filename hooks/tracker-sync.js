#!/usr/bin/env node
// @ts-check
// SessionStart + SessionEnd hook — tracker sync sweep (D19).
//
// SessionStart: reports drift (open items that look delivered) and injects
// a context hint. Also notices todo-manual-backup.md (D23).
//
// SessionEnd: mechanically closes items with explicit written evidence
// (merged PRs with closing keywords or Task: trailers). Ambiguous evidence
// is NEVER auto-acted on (D20). Regenerates the mirror in both mode.
//
// Invocation context is determined by argv: the installer wires this script
// into both SessionStart and SessionEnd hook groups. The hook reads
// process.argv[2] to distinguish ('start' vs 'end').

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { readStdinJson, injectContext, ok, runHook } = require('./lib/hook-io');

function git(args) {
  try { return execFileSync('git', args, { encoding: 'utf8' }).trim(); }
  catch { return ''; }
}

function readManifest(projectRoot) {
  try {
    const p = path.join(projectRoot, '.claude', '.harness-manifest.json');
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch { /* fail-open */ }
  return null;
}

function deriveMode(manifest) {
  if (!manifest) return null;
  const tracker = manifest.tracker;
  if (!tracker) return null;
  if (tracker === 'local') return 'local';
  if (manifest.trackerMirror) return 'both';
  return 'tracker';
}

function ghAvailable() {
  try {
    execFileSync('gh', ['--version'], { encoding: 'utf8', timeout: 1500, stdio: 'ignore' });
    return true;
  } catch { return false; }
}

function fetchMergedPRs() {
  try {
    const raw = execFileSync('gh', [
      'pr', 'list', '--state', 'merged', '--limit', '50',
      '--json', 'number,title,body,mergedAt',
    ], { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] });
    return JSON.parse(raw);
  } catch { return []; }
}

function listOpenItems(projectRoot) {
  const script = path.join(projectRoot, '.claude', 'trackers', 'active', 'list-issues.sh');
  try {
    const raw = execFileSync('bash', [script], {
      encoding: 'utf8', timeout: 5000,
      cwd: projectRoot,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return JSON.parse(raw);
  } catch { return []; }
}

function closeItem(projectRoot, id, reason) {
  const script = path.join(projectRoot, '.claude', 'trackers', 'active', 'close-issue.sh');
  const args = [script, String(id)];
  if (reason) args.push(reason);
  const result = spawnSync('bash', args, {
    encoding: 'utf8', timeout: 10000,
    cwd: projectRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return result.status === 0;
}

function regenerateMirror(projectRoot) {
  const renderScript = path.join(projectRoot, '.claude', 'trackers', 'lib', 'render-todo.sh');
  const listScript = path.join(projectRoot, '.claude', 'trackers', 'active', 'list-issues.sh');
  if (!fs.existsSync(renderScript)) return;

  const issuesDir = path.join(projectRoot, 'tasks', 'issues');
  if (fs.existsSync(issuesDir)) {
    spawnSync('bash', [renderScript, issuesDir], {
      cwd: projectRoot, timeout: 10000, stdio: 'ignore',
    });
    return;
  }

  if (!fs.existsSync(listScript)) return;

  try {
    const raw = execFileSync('bash', [listScript], {
      encoding: 'utf8', timeout: 5000, cwd: projectRoot,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const items = JSON.parse(raw);
    if (!Array.isArray(items)) return;

    const tmpDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'mirror-'));
    try {
      for (const item of items) {
        const id = item.id || item.number;
        if (!id) continue;
        const lines = [
          `id: ${id}`,
          `title: ${item.title || ''}`,
          `state: open`,
          `labels: [${(item.labels || []).join(', ')}]`,
        ];
        fs.writeFileSync(path.join(tmpDir, `${id}.md`), lines.join('\n') + '\n');
      }
      spawnSync('bash', [renderScript, tmpDir], {
        cwd: projectRoot, timeout: 10000, stdio: 'ignore',
      });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  } catch { /* best-effort */ }
}

// --- Evidence extraction ---

// GitHub/ADO closing keywords in PR bodies (D21): "Closes #123", "Fixes AB#204"
function extractClosingRefs(prBody) {
  if (!prBody) return [];
  const refs = [];
  const ghPattern = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/gi;
  let m;
  while ((m = ghPattern.exec(prBody)) !== null) {
    refs.push({ type: 'github', id: m[1] });
  }
  const adoPattern = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+AB#(\d+)/gi;
  while ((m = adoPattern.exec(prBody)) !== null) {
    refs.push({ type: 'ado', id: m[1] });
  }
  return refs;
}

// Local-mode trailers: anchored "Task: 42" lines in PR body (D21)
function extractTaskTrailers(prBody) {
  if (!prBody) return [];
  const refs = [];
  const lines = prBody.split('\n');
  for (const line of lines) {
    const m = line.match(/^Task: (\d+)$/);
    if (m) refs.push({ type: 'local', id: m[1] });
  }
  return refs;
}

// --- SessionStart ---

function sessionStart(projectRoot, manifest, mode) {
  const hints = [];

  // Backup notice (D23)
  const backupPath = path.join(projectRoot, 'tasks', 'todo-manual-backup.md');
  if (fs.existsSync(backupPath)) {
    hints.push('Found todo-manual-backup.md from the mode migration — run /sync-tracker --import-backup to convert its unchecked items into tasks.');
  }

  // Regenerate mirror at SessionStart so session-start read is current (both mode)
  if (mode === 'both') {
    regenerateMirror(projectRoot);
  }

  // Drift scan: find items that look delivered but are still open
  const openItems = listOpenItems(projectRoot);
  if (!openItems.length) {
    if (hints.length) {
      injectContext('SessionStart', hints.join('\n'));
      return;
    }
    return ok();
  }

  const openIds = new Set(openItems.map(i => String(i.id || i.number)));
  const driftIds = [];

  if (ghAvailable()) {
    const prs = fetchMergedPRs();
    for (const pr of prs) {
      const body = (pr.body || '') + '\n' + (pr.title || '');
      const closingRefs = mode === 'local'
        ? extractTaskTrailers(pr.body || '')
        : extractClosingRefs(body);
      for (const ref of closingRefs) {
        if (openIds.has(ref.id) && !driftIds.includes(ref.id)) {
          driftIds.push(ref.id);
        }
      }
    }
  }

  if (driftIds.length) {
    const ids = driftIds.map(id => `#${id}`).join(', ');
    hints.push(`Tracker sync: ${driftIds.length} item${driftIds.length === 1 ? '' : 's'} look${driftIds.length === 1 ? 's' : ''} delivered but ${driftIds.length === 1 ? 'is' : 'are'} still open (${ids}) — run /sync-tracker to reconcile.`);
  }

  if (hints.length) {
    injectContext('SessionStart', hints.join('\n'));
  } else {
    ok();
  }
}

// --- SessionEnd ---

function sessionEnd(projectRoot, manifest, mode) {
  if (!ghAvailable()) return ok();

  const prs = fetchMergedPRs();
  if (!prs.length) return ok();

  const openItems = listOpenItems(projectRoot);
  if (!openItems.length) return ok();

  const openIds = new Set(openItems.map(i => String(i.id || i.number)));
  let closedCount = 0;
  const skipped = [];

  for (const pr of prs) {
    const body = pr.body || '';

    // Extract evidence based on mode
    let refs;
    if (mode === 'local') {
      refs = extractTaskTrailers(body);
    } else {
      refs = extractClosingRefs(body + '\n' + (pr.title || ''));
    }

    for (const ref of refs) {
      if (!openIds.has(ref.id)) continue;
      const success = closeItem(projectRoot, ref.id, `Delivered in PR #${pr.number}`);
      if (success) {
        closedCount++;
        openIds.delete(ref.id);
      }
    }
  }

  // Log ambiguous evidence that was NOT acted on
  if (skipped.length) {
    process.stderr.write(JSON.stringify({
      hook: 'tracker-sync',
      phase: 'session-end',
      skipped_ambiguous: skipped,
    }) + '\n');
  }

  // Mirror regeneration (both mode only, D18)
  if (mode === 'both' && closedCount > 0) {
    regenerateMirror(projectRoot);
  }

  ok();
}

// --- Main ---

const phase = process.argv[2] || 'start';

runHook('tracker-sync', async () => {
  await readStdinJson();
  const projectRoot = git(['rev-parse', '--show-toplevel']) || process.cwd();
  const manifest = readManifest(projectRoot);
  const mode = deriveMode(manifest);

  if (!mode) return ok();

  if (phase === 'end') {
    sessionEnd(projectRoot, manifest, mode);
  } else {
    sessionStart(projectRoot, manifest, mode);
  }
});
