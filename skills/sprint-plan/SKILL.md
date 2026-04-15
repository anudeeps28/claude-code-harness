---
name: sprint-plan
description: Sprint planning — reads issues from your tracker and codebase, creates the sprint file, and surfaces gaps. Use when starting a new sprint, planning sprint N, or setting up a sprint file. Usage: /sprint-plan <N>
argument-hint: Sprint number e.g. 5
---

**Core Philosophy:** Read the tracker and the docs before writing anything — the sprint file is a synthesis of both, not a copy-paste of ticket fields.

**Triggers:** "sprint planning", "plan sprint 5", "set up sprint file", "run weekly planning", "create sprint 5 file"

---

You are running the weekly sprint planning workflow for Sprint $ARGUMENTS.

Follow these phases in order. Complete each phase fully before moving to the next.

---

## Phase 1: Load Standing Context

Do all of these in parallel:
1. Read `tasks/lessons.md` — refresh all rules and known fixes
2. Read `tasks/sprint-template.md` — this is the exact template structure for the new sprint file
3. Read `tasks/pr-queue.md` — understand current branch and PR state going into this sprint

---

## Phase 2: Gather Sprint Data

Launch BOTH agents in the **same message** as parallel foreground calls (no background flag on either).
This is mandatory — launching them in the same message guarantees you wait for both results before proceeding.

**Agent A: `sprint-plan-docs-reader`** (foreground)
- It will read every file in `docs/` and return a project context summary

**Agent B: `sprint-plan-tracker-reader`** (foreground)
- Tell it the sprint number: $ARGUMENTS
- It needs Bash permissions to call the tracker CLI
- It will return all issues in Sprint $ARGUMENTS with full details:
  title, description, acceptance criteria, story points, priority, state, and all child tasks with their descriptions

Do NOT proceed to Phase 3 until both agents have returned their results in the same response.

---

## Phase 3: Create the Sprint File

**First: check if `tasks/sprint$ARGUMENTS.md` already exists.**
- If it does NOT exist: create it fresh using `tasks/sprint-template.md` as the exact structure.
- If it ALREADY exists: read it first, then update it with the tracker data — do not overwrite content that is already correct. Add new stories, update stale sections, and preserve any hand-written notes.

1. Create or update `tasks/sprint$ARGUMENTS.md` using `tasks/sprint-template.md` as the structure guide
2. Populate every story section with real tracker data:
   - Story ID, title, story points, priority
   - User story (from the description field)
   - Acceptance criteria (from the AcceptanceCriteria field)
   - Child tasks list — each with ID, title, and description
   - "What we do / What we build" — your analysis based on the docs context and story details
   - Dependencies — infer from story descriptions, child task details, and known project state
3. Fill in the Master Status Table — all new stories get status "New", carried-over stories get their current status
4. Fill in the Sprint Summary Table with all stories and total story points
5. Leave "Recommended Order of Work" blank for now — this gets filled after the planning meeting

---

## Phase 4: Analyze Gaps

Launch a `sprint-plan-gap-analyzer` subagent with:
- The full sprint story data from Phase 2
- The project context summary from Phase 2

Wait for it to return, then output the questions clearly under this heading:

**Questions to raise at the sprint planning meeting:**

---

## STOP HERE

After outputting the questions, say exactly this:

"Sprint $ARGUMENTS file created at tasks/sprint$ARGUMENTS.md

Here are the questions to raise at your planning meeting. Paste the meeting transcript here when you're done and I'll fill in the gaps and finalize the file."

Do not proceed further until YOUR_NAME pastes the transcript.

---

## Phase 5: After Transcript (runs when YOUR_NAME pastes the meeting transcript)

When YOUR_NAME pastes the transcript:

1. Read `tasks/sprint$ARGUMENTS.md` to see the current state of the file
2. Read through the transcript carefully
3. Before writing anything, output a plain-English summary of every change you intend to make:
   - Stories being added, removed, or scoped down
   - Fields being updated (owner, SP, Work Pending, What we build, dependencies)
   - Sections being rewritten (Recommended Order, Open Questions, Key Decisions)
   Wait for YOUR_NAME to confirm before proceeding to step 4.
4. Update `tasks/sprint$ARGUMENTS.md` with clarifications from the meeting:
   - Fill in any blocked items that were unblocked or clarified
   - Update or add dependencies that were discussed
   - Add or remove stories if any were added or removed in the meeting
   - Fill in "Recommended Order of Work" based on what was discussed
   - Update the Master Status Table if any statuses changed
5. Ask YOUR_NAME clarifying questions one at a time until you are fully confident that every story is understood well enough to be delivered — no cap on questions, keep asking until there are zero remaining unknowns
6. Once all gaps are resolved, confirm: "`tasks/sprint$ARGUMENTS.md` is finalized and ready for the sprint."
