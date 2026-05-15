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

const path = require('node:path');
const { readStdinJson, blockPost, injectContext, ok, runHook } = require('./lib/hook-io');
const ap = require('./lib/artifact-parsers');
const {
  checkPrStatuses,
  checkSprintStatuses,
  checkPeopleCrossRef,
  checkPeopleOneLiner,
  checkBranchNaming,
  checkStoryBriefCrossRef,
  checkNfrCoverage,
  checkServiceCoverage,
  checkPrdSectionRefs,
  checkAcTestCoverage,
  checkAdrConsistency,
} = require('./lib/invariants');

const TRACKED_BASENAMES = new Set([
  'lessons.md', 'todo.md', 'pr-queue.md', 'flags-and-notes.md',
  'tracker-config.md', 'people.md',
]);
const SPRINT_RE = /^sprint\d+\.md$/i;

const DRIFT_LEVEL = (process.env.CLAUDE_HARNESS_DRIFT_LEVEL || 'mvp').toLowerCase();
const FULL_LEVEL = DRIFT_LEVEL === 'full';

function isTracked(basename) {
  return TRACKED_BASENAMES.has(basename) || SPRINT_RE.test(basename);
}

// ── artifact file detection ──────────────────────────────────────────

const ARTIFACT_BASENAMES = new Set(['prd.md', 'architecture.md']);

function isArtifactFile(normalized) {
  const basename = path.posix.basename(normalized).toLowerCase();
  if (ARTIFACT_BASENAMES.has(basename)) return true;
  if (/\/docs\/adr\/\d{4}.*\.md$/i.test(normalized)) return true;
  return false;
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
