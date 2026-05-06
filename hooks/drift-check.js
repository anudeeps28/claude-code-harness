#!/usr/bin/env node
// PostToolUse drift detector for task files and project artifacts.
//
// Fires on two classes of files:
//  A) Task files: lessons.md, todo.md, pr-queue.md, flags-and-notes.md,
//     tracker-config.md, people.md, sprint<N>.md.
//  B) Artifact files: PRD.md, ARCHITECTURE.md, docs/adr/*.md
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
// Artifact drift (batch 3) — always on when artifact files exist:
//  7. NFR-not-in-arch: PRD NFR keywords missing from ARCHITECTURE.md
//  8. arch-service-not-in-work-items: Mermaid components not in todo.md
//  9. work-item-section-mismatch: PRD section refs in todo.md that don't exist
// 10. AC-not-tested: acceptance criteria keywords not found in test files
// 11. ADR-vs-architecture: ADR tech choice contradicted by architecture doc
//
// Artifact invariants 7-9 produce soft warnings (gaps).
// Invariant 10 produces a soft warning.
// Invariant 11 produces a HARD BLOCK (contradiction).
//
// Hard block uses `decision: "block"` per PostToolUse protocol; it cannot
// undo the edit, but tells Claude to stop and run /sync-tasks.
//
// Current-sprint disambiguation: when multiple sprint<N>.md files coexist,
// use the highest-numbered one.

const fs = require('node:fs');
const path = require('node:path');
const { readStdinJson, blockPost, injectContext, ok, runHook } = require('./lib/hook-io');
const ap = require('./lib/artifact-parsers');

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

// ── artifact file detection ──────────────────────────────────────────

const ARTIFACT_BASENAMES = new Set(['prd.md', 'architecture.md']);

function isArtifactFile(normalized) {
  const basename = path.posix.basename(normalized).toLowerCase();
  if (ARTIFACT_BASENAMES.has(basename)) return true;
  // docs/adr/NNNN-*.md
  if (/\/docs\/adr\/\d{4}.*\.md$/i.test(normalized)) return true;
  return false;
}

// ── artifact drift checks (batch 3) ─────────────────────────────────

// Invariant 7: NFR keywords in PRD but not in architecture doc
function checkNfrCoverage(projectRoot, warnings) {
  const prdPath = ap.findPrdPath(projectRoot);
  const archPath = ap.findArchPath(projectRoot);
  if (!prdPath || !archPath) return;

  const prdText = read(prdPath);
  const archText = read(archPath);
  if (!prdText || !archText) return;

  const nfrs = ap.extractNfrKeywords(prdText);
  if (!nfrs.length) return;

  const missing = ap.findMissingNfrs(archText, nfrs);
  for (const kw of missing) {
    warnings.push(
      `Artifact drift: PRD mentions NFR "${kw}" but ARCHITECTURE.md does not address it`
    );
  }
}

// Invariant 8: Architecture components not referenced in work items
function checkServiceCoverage(projectRoot, warnings) {
  const archPath = ap.findArchPath(projectRoot);
  const todoPath = ap.findTodoPath(projectRoot);
  if (!archPath || !todoPath) return;

  const archText = read(archPath);
  const todoText = read(todoPath);
  if (!archText || !todoText) return;

  const components = ap.extractMermaidComponents(archText);
  if (!components.length) return;

  const todoLower = todoText.toLowerCase();
  for (const name of components) {
    if (name.length < 3) continue; // skip very short names like "UI"
    if (!todoLower.includes(name.toLowerCase())) {
      warnings.push(
        `Artifact drift: ARCHITECTURE.md component "${name}" not referenced in todo.md work items`
      );
    }
  }
}

// Invariant 9: Work item references to PRD sections that don't exist
function checkPrdSectionRefs(projectRoot, warnings) {
  const prdPath = ap.findPrdPath(projectRoot);
  const todoPath = ap.findTodoPath(projectRoot);
  if (!prdPath || !todoPath) return;

  const prdText = read(prdPath);
  const todoText = read(todoPath);
  if (!prdText || !todoText) return;

  const refs = ap.extractPrdSectionRefs(todoText);
  if (!refs.length) return;

  const headings = ap.extractHeadings(prdText);
  const sectionNumbers = new Set(headings.map((h) => h.number).filter(Boolean));
  // Also match heading text containing the number (e.g., "3.2 User Stories")
  const headingTexts = headings.map((h) => h.text);

  for (const ref of refs) {
    const exists = sectionNumbers.has(ref)
      || headingTexts.some((t) => t.startsWith(ref));
    if (!exists) {
      warnings.push(
        `Artifact drift: todo.md references "PRD Section ${ref}" but that section does not exist in PRD.md`
      );
    }
  }
}

// Invariant 10: Acceptance criteria keywords not found in test files
// This is highly heuristic — only checks if the tests/ directory exists and
// has files mentioning key AC terms. Produces soft warnings only.
function checkAcTestCoverage(projectRoot, warnings) {
  const todoPath = ap.findTodoPath(projectRoot);
  if (!todoPath) return;

  const todoText = read(todoPath);
  if (!todoText) return;

  // Extract acceptance criteria from XML-style plan tasks
  const acMatches = todoText.match(/<acceptance[^>]*>([\s\S]*?)<\/acceptance>/gi);
  if (!acMatches || !acMatches.length) return;

  // Check if any test directory exists
  const testDirs = ['tests', 'test', '__tests__', 'spec'];
  let hasTests = false;
  for (const d of testDirs) {
    if (fs.existsSync(path.join(projectRoot, d))) { hasTests = true; break; }
  }
  if (fs.existsSync(path.join(projectRoot, 'src')) && !hasTests) {
    // Also check for test files alongside source
    try {
      const srcFiles = fs.readdirSync(path.join(projectRoot, 'src'));
      hasTests = srcFiles.some((f) => /\.test\.|\.spec\./i.test(f));
    } catch { /* ignore */ }
  }

  if (!hasTests) {
    warnings.push(
      'Artifact drift: todo.md has acceptance criteria but no test directory found — consider adding tests'
    );
  }
}

// Invariant 11: ADR technology choice contradicted by architecture doc
// HARD BLOCK on contradiction (ADR chose X but architecture uses rejected Y)
function checkAdrConsistency(projectRoot, warnings, hardBlockReasons) {
  const archPath = ap.findArchPath(projectRoot);
  if (!archPath) return;
  const archText = read(archPath);
  if (!archText) return;

  const adrPaths = ap.findAdrPaths(projectRoot);
  if (!adrPaths.length) return;

  for (const adrPath of adrPaths) {
    const adrText = read(adrPath);
    if (!adrText) continue;

    const status = ap.extractAdrStatus(adrText);
    if (status !== 'accepted') continue;

    const { chosen, rejected } = ap.extractAdrTechChoices(adrText);
    if (!chosen.length || !rejected.length) continue;

    for (const tech of rejected) {
      // Only flag if the rejected tech appears in architecture's platform selection
      // section AND the chosen tech does NOT appear there
      const section2 = ap.extractSection(archText, /platform|selection|rationale/i);
      if (!section2) continue;
      const s2Lower = section2.toLowerCase();
      const techLower = tech.toLowerCase();
      const anyChosenPresent = chosen.some((c) => s2Lower.includes(c.toLowerCase()));
      if (s2Lower.includes(techLower) && !anyChosenPresent) {
        hardBlockReasons.push(
          `Artifact contradiction: ${path.basename(adrPath)} chose ${chosen.join('/')} ` +
          `over ${tech}, but ARCHITECTURE.md platform rationale references ${tech} ` +
          `without the chosen technology — run /sync-tasks to resolve`
        );
      }
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
  const isTask = isTracked(basename);
  const isArtifact = isArtifactFile(normalized);
  if (!isTask && !isArtifact) return ok();

  const warnings = [];
  const hardBlockReasons = [];

  try {
    // ── Task file invariants (batch 1 + 2) ──────────────────────────
    if (isTask) {
      const tasksDir = path.posix.dirname(normalized);
      if (path.posix.basename(tasksDir) === 'tasks') {
        checkPrStatuses(tasksDir, warnings);
        checkSprintStatuses(tasksDir, warnings);
        checkPeopleCrossRef(tasksDir, hardBlockReasons);
        checkPeopleOneLiner(tasksDir, warnings);
        if (FULL_LEVEL) {
          checkBranchNaming(tasksDir, warnings);
          checkStoryBriefCrossRef(tasksDir, warnings);
        }
      }
    }

    // ── Artifact drift checks (batch 3) ─────────────────────────────
    const projectRoot = ap.findProjectRoot(normalized);
    if (projectRoot) {
      checkNfrCoverage(projectRoot, warnings);
      checkServiceCoverage(projectRoot, warnings);
      checkPrdSectionRefs(projectRoot, warnings);
      checkAcTestCoverage(projectRoot, warnings);
      checkAdrConsistency(projectRoot, warnings, hardBlockReasons);
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
      `Drift warnings: ${warnings.join('; ')}. ` +
      `Not blocking, but consider running /sync-tasks.`
    );
  }

  ok();
});
