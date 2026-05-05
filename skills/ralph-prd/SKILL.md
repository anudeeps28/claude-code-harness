---
name: prd
description: Generate a Product Requirements Document for a new feature — clarifying questions, stories sized to one context window, ordered by dependency. Use when planning a feature, starting a project, or asked to write a spec or PRD.
context: fork
model: opus
---

**Core Philosophy:** Ask before writing, then size every story to one context window — a PRD that can't be executed autonomously is just decoration.

**Triggers:** "create a PRD", "write a spec for", "plan this feature", "requirements for", "I need a PRD for", "spec out this feature"

---

# PRD Generator

Create detailed Product Requirements Documents that are clear, actionable, and suitable for autonomous AI implementation via the Ralph loop.

---

## Step 0 — Determine output mode

Before starting, read the PRD output mode from the project's task configuration:

1. **Enterprise pack:** read `tasks/tracker-config.md` and look for a `## PRD Configuration` section with a `prd_mode` value.
2. **Solo pack:** read `tasks/notes.md` and look for a `## PRD Configuration` section with a `prd_mode` value.
3. **If no config found:** default to `file` mode.

Valid modes:
- `file` — write `PRD.md` to the repo (default)
- `tracker` — publish as a single tracker issue with label `needs-triage`
- `both-file-canonical` — write `PRD.md` AND publish to tracker; file is canonical
- `both-tracker-canonical` — write `PRD.md` AND publish to tracker; tracker is canonical

Store the resolved mode for use in the Output step.

---

## The Job

1. Receive a feature description from the user
2. Ask 3-5 essential clarifying questions (with lettered options)
3. Generate a structured PRD based on answers
4. Output the PRD according to the configured mode (see Step 0 and Output section)
5. If mode includes `file`: create empty `progress.txt`

**Important:** Do NOT start implementing. Just create the PRD.

---

## Step 1: Clarifying Questions

Ask only critical questions where the initial prompt is ambiguous. Focus on:

- **Problem/Goal:** What problem does this solve?
- **Core Functionality:** What are the key actions?
- **Scope/Boundaries:** What should it NOT do?
- **Success Criteria:** How do we know it's done?

### Format Questions Like This:

```
1. What is the primary goal of this feature?
   A. Improve user onboarding experience
   B. Increase user retention
   C. Reduce support burden
   D. Other: [please specify]

2. Who is the target user?
   A. New users only
   B. Existing users only
   C. All users
   D. Admin users only

3. What is the scope?
   A. Minimal viable version
   B. Full-featured implementation
   C. Just the backend/API
   D. Just the UI
```

This lets users respond with "1A, 2C, 3B" for quick iteration.

---

## Step 2: Story Sizing (THE NUMBER ONE RULE)

**Each story must be completable in ONE context window (~10 min of AI work).**

Ralph spawns a fresh instance per iteration with no memory of previous work. If a story is too big, the AI runs out of context before finishing and produces broken code.

### Right-sized stories:
- Add a database column and migration
- Add a single UI component to an existing page
- Update a server action with new logic
- Add a filter dropdown to a list

### Too big (MUST split):
| Too Big | Split Into |
|---------|-----------|
| "Build the dashboard" | Schema, queries, UI components, filters |
| "Add authentication" | Schema, middleware, login UI, session handling |
| "Add drag and drop" | Drag events, drop zones, state update, persistence |
| "Refactor the API" | One story per endpoint or pattern |

**Rule of thumb:** If you cannot describe the change in 2-3 sentences, it is too big.

---

## Step 3: Story Ordering (Dependencies First)

Stories execute in priority order. Earlier stories must NOT depend on later ones.

**Correct order:**
1. Schema/database changes (migrations)
2. Server actions / backend logic
3. UI components that use the backend
4. Dashboard/summary views that aggregate data

**Wrong order:**
```
US-001: UI component (depends on schema that doesn't exist yet!)
US-002: Schema change
```

---

## Step 4: Acceptance Criteria (Must Be Verifiable)

Each criterion must be something Ralph can CHECK, not something vague.

### Good criteria (verifiable):
- "Add `status` column to tasks table with default 'pending'"
- "Filter dropdown has options: All, Active, Completed"
- "Clicking delete shows confirmation dialog"
- "Typecheck passes"
- "Tests pass"

### Bad criteria (vague):
- "Works correctly"
- "User can do X easily"
- "Good UX"
- "Handles edge cases"

### Always include as final criterion:
```
"Typecheck passes"
```

### For stories that change UI, also include:
```
"Verify changes work in browser"
```

---

## PRD Structure

Generate the PRD with these sections:

### 1. Introduction
Brief description of the feature and the problem it solves.

### 2. Goals
Specific, measurable objectives (bullet list).

### 3. User Stories
Each story needs:
- **ID:** Sequential (US-001, US-002, etc.)
- **Title:** Short descriptive name
- **Description:** "As a [user], I want [feature] so that [benefit]"
- **Acceptance Criteria:** Verifiable checklist

**Format:**
```markdown
### US-001: [Title]
**Description:** As a [user], I want [feature] so that [benefit].

**Acceptance Criteria:**
- [ ] Specific verifiable criterion
- [ ] Another criterion
- [ ] Typecheck passes
- [ ] [UI stories] Verify changes work in browser
```

### 4. Non-Goals
What this feature will NOT include. Critical for scope.

### 5. Technical Considerations (Optional)
- Known constraints
- Existing components to reuse

---

## Example PRD

```markdown
# PRD: Task Priority System

## Introduction

Add priority levels to tasks so users can focus on what matters most. Tasks can be marked as high, medium, or low priority, with visual indicators and filtering.

## Goals

- Allow assigning priority (high/medium/low) to any task
- Provide clear visual differentiation between priority levels
- Enable filtering by priority
- Default new tasks to medium priority

## User Stories

### US-001: Add priority field to database
**Description:** As a developer, I need to store task priority so it persists across sessions.

**Acceptance Criteria:**
- [ ] Add priority column: 'high' | 'medium' | 'low' (default 'medium')
- [ ] Generate and run migration successfully
- [ ] Typecheck passes

### US-002: Display priority indicator on task cards
**Description:** As a user, I want to see task priority at a glance so I know what needs attention first.

**Acceptance Criteria:**
- [ ] Each task card shows colored priority badge (red=high, yellow=medium, gray=low)
- [ ] Priority visible without hovering or clicking
- [ ] Typecheck passes
- [ ] Verify changes work in browser

### US-003: Add priority selector to task edit
**Description:** As a user, I want to change a task's priority when editing it.

**Acceptance Criteria:**
- [ ] Priority dropdown in task edit modal
- [ ] Shows current priority as selected
- [ ] Saves immediately on selection change
- [ ] Typecheck passes
- [ ] Verify changes work in browser

### US-004: Filter tasks by priority
**Description:** As a user, I want to filter the task list to see only high-priority items when I'm focused.

**Acceptance Criteria:**
- [ ] Filter dropdown with options: All | High | Medium | Low
- [ ] Filter persists in URL params
- [ ] Empty state message when no tasks match filter
- [ ] Typecheck passes
- [ ] Verify changes work in browser

## Non-Goals

- No priority-based notifications or reminders
- No automatic priority assignment based on due date
- No priority inheritance for subtasks

## Technical Considerations

- Reuse existing badge component with color variants
- Filter state managed via URL search params
```

---

## Output

Output according to the mode resolved in Step 0:

### Mode: `file` (default)

Save to `PRD.md` in the current directory. Also create `progress.txt`:
```markdown
# Progress Log

## Learnings
(Patterns discovered during implementation)

---
```

### Mode: `tracker`

Publish the PRD as a single tracker issue using `trackers/active/create-issue.sh`:
```bash
bash trackers/active/create-issue.sh "PRD: <feature title>" "<full PRD content as markdown>" "needs-triage"
```
Do NOT create `PRD.md` or `progress.txt`.

### Mode: `both-file-canonical`

1. Save `PRD.md` and `progress.txt` as in `file` mode — this is the canonical copy.
2. Publish to the tracker as in `tracker` mode.
3. Add a note at the top of the tracker issue: `> Canonical source: PRD.md in the repo. This tracker copy is a mirror — update the file, not this issue.`

### Mode: `both-tracker-canonical`

1. Publish to the tracker as in `tracker` mode — this is the canonical copy.
2. Save `PRD.md` and `progress.txt` as in `file` mode.
3. Add a note at the top of `PRD.md`: `<!-- Canonical source: tracker issue. This file is a mirror — update the tracker issue, not this file. -->`

### After output

Report which mode was used and where the PRD was written:
> "PRD written to [location(s)]. Mode: `[mode]`.
> [If both mode:] Canonical source is [file / tracker]. The other copy is a mirror — update only the canonical source."

---

## Running the Ralph Loop

Once `PRD.md` and `progress.txt` exist, execute the loop runner from this skill folder:

**macOS / Linux:**
```bash
./ralph.sh                                  # 10 iterations, defaults
./ralph.sh --max 25 --sleep 5               # custom budget
./ralph.sh --prd specs/PRD.md --progress specs/progress.txt
```

**Windows / cross-platform PowerShell:**
```powershell
./ralph.ps1                                 # 10 iterations, defaults
./ralph.ps1 -MaxIterations 25 -SleepSeconds 5
./ralph.ps1 -PrdPath specs/PRD.md -ProgressPath specs/progress.txt
```

Each iteration spawns a fresh `claude -p` instance that picks the first user story with unchecked `[ ]` acceptance criteria, implements it, runs the verify command from the criteria, and only commits if it passes. The loop terminates when Ralph emits `<promise>COMPLETE</promise>` or when `--max` is reached.

---

## Checklist Before Saving

- [ ] Asked clarifying questions with lettered options
- [ ] Incorporated user's answers
- [ ] User stories use US-001 format
- [ ] Each story completable in ONE iteration (small enough)
- [ ] Stories ordered by dependency (schema → backend → frontend)
- [ ] All criteria are verifiable (not vague)
- [ ] Every story has "Typecheck passes" as criterion
- [ ] UI stories have "Verify changes work in browser"
- [ ] Non-goals section defines clear boundaries
- [ ] Saved PRD.md and progress.txt
