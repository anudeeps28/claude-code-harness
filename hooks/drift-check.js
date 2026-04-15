#!/usr/bin/env node
// PostToolUse drift detector for the 7 enterprise task files.
// Fires only when the edited file is one of: lessons.md, todo.md, pr-queue.md,
// flags-and-notes.md, tracker-config.md, people.md, or sprint<N>.md.
//
// MVP invariants (batch 1) — always on:
//  1. PR status enum (pr-queue.md)           — soft warning on mismatch
//  2. Sprint status enum (sprint<N>.md)       — soft warning on mismatch
//  3. people.md ↔ flags-and-notes.md xref    — HARD BLOCK on missing ref
//  4. people.md one-liner rule (>140 chars)   — soft warning
//
// Extended invariants (batch 2) — opt in with CLAUDE_HARNESS_DRIFT_LEVEL=full:
//  5. Branch naming pattern (pr-queue.md)     — soft warning if non-standard
//  6. Sprint story ↔ brief.md cross-ref      — soft warning if brief missing
//
// Hard block uses `decision: "block"` per PostToolUse protocol; it cannot
// undo the edit, but tells Claude to stop and run /sync-tasks.
//
// Current-sprint disambiguation: when multiple sprint<N>.md files coexist,
// use the highest-numbered one.

const fs = require('node:fs');
const path = require('node:path');
const { readStdinJson, blockPost, injectContext, ok, runHook } = require('./lib/hook-io');

const TRACKED_BASENAMES = new Set([
  'lessons.md', 'todo.md', 'pr-queue.md', 'flags-and-notes.md',
  'tracker-config.md', 'people.md',
]);
const SPRINT_RE = /^sprint\d+\.md$/i;

const PR_STATUSES = new Set([
  'No PR yet',
  'PR raised',
  'CR comments — action needed',
  'CR comments fixed — awaiting human review',
  'Human review in progress',
  'Merged',
  'Abandoned',
]);

const SPRINT_STATUSES = new Set([
  'New', 'In Progress', 'Code Review', 'Done', 'Blocked', 'Carried Over',
]);

const ONE_LINER_MAX = 140;

const DRIFT_LEVEL = (process.env.CLAUDE_HARNESS_DRIFT_LEVEL || 'mvp').toLowerCase();
const FULL_LEVEL = DRIFT_LEVEL === 'full';

// Branch must look like: feature/<digits>-<slug>, fix/<digits>-<slug>,
// hotfix/<digits>-<slug>, or chore/<slug>. The slug after the dash is freeform.
const BRANCH_RE = /^(?:feature|fix|hotfix|chore)\/(?:\d{3,6}-)?[a-z0-9][a-z0-9-]*$/i;

function read(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
}

function isTracked(basename) {
  return TRACKED_BASENAMES.has(basename) || SPRINT_RE.test(basename);
}

function findCurrentSprintFile(tasksDir) {
  let entries;
  try { entries = fs.readdirSync(tasksDir); } catch { return null; }
  const sprints = entries
    .filter((f) => SPRINT_RE.test(f))
    .map((f) => ({ name: f, n: parseInt(f.match(/\d+/)[0], 10) }))
    .sort((a, b) => b.n - a.n);
  return sprints.length ? path.join(tasksDir, sprints[0].name) : null;
}

// Parse a markdown table section by header line. Returns array of row arrays.
function parseTable(text, headerPredicate) {
  const lines = text.split(/\r?\n/);
  const rows = [];
  let inTable = false;
  let separatorSeen = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!inTable) {
      if (headerPredicate(line)) inTable = true;
      continue;
    }
    if (!separatorSeen) {
      if (/^\|\s*:?-+/.test(line)) { separatorSeen = true; continue; }
      if (line === '' || !line.startsWith('|')) break;
      continue;
    }
    if (!line.startsWith('|')) break;
    const cells = line
      .replace(/^\|/, '').replace(/\|$/, '')
      .split('|').map((c) => c.trim());
    rows.push(cells);
  }
  return rows;
}

function isPlaceholderRow(cells) {
  return cells.every((c) => c === '' || c === '—' || c === '-' || c === '<!-- Add rows here -->');
}

// ── invariants ────────────────────────────────────────────────────────

function checkPrStatuses(tasksDir, warnings) {
  const text = read(path.join(tasksDir, 'pr-queue.md'));
  if (!text) return;
  const rows = parseTable(text, (line) =>
    /\|\s*PR\s*#\s*\|\s*Branch\s*\|\s*Status\s*\|/i.test(line));
  for (const cells of rows) {
    if (cells.length < 3 || isPlaceholderRow(cells)) continue;
    const status = cells[2];
    if (!PR_STATUSES.has(status)) {
      warnings.push(`pr-queue.md: Status "${status}" not in allowed enum`);
    }
  }
}

function checkSprintStatuses(tasksDir, warnings) {
  const sprintPath = findCurrentSprintFile(tasksDir);
  if (!sprintPath) return;
  const text = read(sprintPath);
  if (!text) return;
  const rows = parseTable(text, (line) =>
    /\|\s*Story\s*ID\s*\|.*\|\s*Status\s*\|/i.test(line));
  for (const cells of rows) {
    if (cells.length < 5 || isPlaceholderRow(cells)) continue;
    const status = cells[4];
    if (!SPRINT_STATUSES.has(status)) {
      warnings.push(`${path.basename(sprintPath)}: Status "${status}" not in allowed enum`);
    }
  }
}

function extractWaitingBullets(text) {
  // Returns { peopleMdBullets: [{itemText, line}], allBulletsUnderWaiting: [{raw, line}] }
  const lines = text.split(/\r?\n/);
  const items = [];
  const allBullets = [];
  let inWaiting = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\*\*Waiting on (from|for) them:\*\*/.test(line.trim())) {
      inWaiting = true; continue;
    }
    if (/^#{1,6}\s/.test(line) || /^\*\*[^*]+:\*\*/.test(line.trim())) {
      inWaiting = inWaiting && /Waiting on/.test(line);
      if (!/Waiting on/.test(line)) inWaiting = false;
    }
    if (inWaiting) {
      const bulletMatch = /^-\s+(.*)$/.exec(line);
      if (bulletMatch) {
        const bulletText = bulletMatch[1];
        allBullets.push({ raw: bulletText, line: i + 1 });
        const checkboxMatch = /^\[\s\]\s+(.*?)\s*\(see flags-and-notes\.md\)\s*$/.exec(bulletText);
        if (checkboxMatch) {
          const itemText = checkboxMatch[1].trim();
          items.push({ itemText, line: i + 1 });
        }
      } else if (line.trim() === '' || /^---/.test(line)) {
        // blank line or hr keeps us in the section until next header
      }
    }
  }
  return { items, allBullets };
}

function isPlaceholderItem(text) {
  return /^\[.*\]/.test(text.trim()) || text.trim() === '' || text.trim() === '(none)';
}

function checkPeopleCrossRef(tasksDir, hardBlockReasons) {
  const peopleText = read(path.join(tasksDir, 'people.md'));
  const flagsText = read(path.join(tasksDir, 'flags-and-notes.md'));
  if (!peopleText || !flagsText) return;
  const { items } = extractWaitingBullets(peopleText);
  for (const { itemText, line } of items) {
    if (isPlaceholderItem(itemText)) continue;
    if (!flagsText.includes(itemText)) {
      hardBlockReasons.push(
        `people.md:${line} references "${itemText}" but it is not found in flags-and-notes.md`
      );
    }
  }
}

function checkPeopleOneLiner(tasksDir, warnings) {
  const peopleText = read(path.join(tasksDir, 'people.md'));
  if (!peopleText) return;
  const { allBullets } = extractWaitingBullets(peopleText);
  for (const { raw, line } of allBullets) {
    if (raw.length > ONE_LINER_MAX || /\n/.test(raw)) {
      warnings.push(`people.md:${line}: bullet exceeds ${ONE_LINER_MAX} chars (one-liner rule)`);
    }
  }
}

// ── extended invariants (CLAUDE_HARNESS_DRIFT_LEVEL=full) ────────────

function checkBranchNaming(tasksDir, warnings) {
  const text = read(path.join(tasksDir, 'pr-queue.md'));
  if (!text) return;
  const rows = parseTable(text, (line) =>
    /\|\s*PR\s*#\s*\|\s*Branch\s*\|\s*Status\s*\|/i.test(line));
  for (const cells of rows) {
    if (cells.length < 2 || isPlaceholderRow(cells)) continue;
    const branch = cells[1];
    if (!branch || branch === '—') continue;
    if (!BRANCH_RE.test(branch)) {
      warnings.push(`pr-queue.md: branch "${branch}" doesn't match feature/fix/hotfix/chore pattern`);
    }
  }
}

function checkStoryBriefCrossRef(tasksDir, warnings) {
  const sprintPath = findCurrentSprintFile(tasksDir);
  if (!sprintPath) return;
  const text = read(sprintPath);
  if (!text) return;
  const storiesDir = path.join(tasksDir, 'stories');
  if (!fs.existsSync(storiesDir)) return;
  const rows = parseTable(text, (line) =>
    /\|\s*Story\s*ID\s*\|.*\|\s*Status\s*\|/i.test(line));
  for (const cells of rows) {
    if (cells.length < 5 || isPlaceholderRow(cells)) continue;
    const status = cells[4];
    // Only check active stories — done/abandoned don't need a live brief.
    if (status === 'Done' || status === 'Carried Over' || status === 'New') continue;
    const storyId = (cells[0].match(/\d+/) || [''])[0];
    if (!storyId) continue;
    const briefPath = path.join(storiesDir, storyId, 'brief.md');
    if (!fs.existsSync(briefPath)) {
      warnings.push(
        `${path.basename(sprintPath)}: story #${storyId} (${status}) has no tasks/stories/${storyId}/brief.md`
      );
    }
  }
}

// ── entry point ───────────────────────────────────────────────────────

runHook('drift-check', async () => {
  const input = await readStdinJson();
  const rawPath = (input.tool_input && input.tool_input.file_path) || '';
  if (!rawPath) return ok();

  const normalized = rawPath.replace(/\\/g, '/');
  const basename = path.posix.basename(normalized);
  if (!isTracked(basename)) return ok();

  // Derive tasks/ directory from the edited file's parent.
  const tasksDir = path.posix.dirname(normalized);
  if (path.posix.basename(tasksDir) !== 'tasks') return ok();

  const warnings = [];
  const hardBlockReasons = [];

  try {
    checkPrStatuses(tasksDir, warnings);
    checkSprintStatuses(tasksDir, warnings);
    checkPeopleCrossRef(tasksDir, hardBlockReasons);
    checkPeopleOneLiner(tasksDir, warnings);
    if (FULL_LEVEL) {
      checkBranchNaming(tasksDir, warnings);
      checkStoryBriefCrossRef(tasksDir, warnings);
    }
  } catch { /* fail open — never block on checker bugs */ }

  if (hardBlockReasons.length) {
    const summary = hardBlockReasons.join('; ');
    blockPost(
      `Drift detected: ${summary}. Run /sync-tasks before further edits.`
    );
  }

  if (warnings.length) {
    injectContext(
      'PostToolUse',
      `Task-file drift warnings: ${warnings.join('; ')}. ` +
      `Not blocking, but consider running /sync-tasks.`
    );
  }

  ok();
});
