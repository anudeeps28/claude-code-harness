---
name: to-todoist
description: Decompose planning artifacts into Todoist tasks with proper hierarchy — milestones as uncompletable parent tasks, work items as subtasks with descriptions, priorities, and dependencies. Reads from grill-summary, research, architecture, decision-brief, or PRD — no single artifact required. Usage: /to-todoist [--project "X"] [--section "Y"] [--dry-run]
triggers: /to-todoist
---

# /to-todoist

Decompose planning artifacts into Todoist tasks. Each task is an independently demoable story. Stories are grouped under milestone parent tasks and created as subtasks.

This skill is Todoist-specific and valid ONLY when the active tracker is Todoist (a `local` mode with `tracker=todoist` is impossible; this runs under tracker/both mode with `tracker=todoist`). It uses the `td` CLI (resolved from `$TODOIST_CLI` or `PATH`) directly — intentionally — for the milestone/subtask/priority hierarchy the generic adapter cannot express (`--uncompletable` milestone parents, `--parent` subtask nesting, `p1-p4` priorities). That is why it is kept as a separate skill rather than folded into `/to-issues`; do not "fix" it by routing through `create-issue.sh`, which would drop those capabilities.

Reads from ALL available planning artifacts in the decide/define phases. No single artifact is required — uses whatever exists.

**Triggers:** explicitly called with `/to-todoist`

## Input

```
/to-todoist [--project "X"] [--section "Y"] [--dry-run]
```

- `--project "X"` — Todoist project to create tasks in (required — from args or `tasks/notes.md`)
- `--section "Y"` — section within the project to group tasks under (optional — creates it if it doesn't exist)
- `--dry-run` — show full task breakdown without creating anything

## Hard input gate

Before doing anything else:

1. FIRST verify the active tracker actually is Todoist: read `.claude/.harness-manifest.json` `tracker` field (fallback: `tasks/tracker-config.md` **Type:**, or detect the `TODOIST_CLI`/`check_auth_todoist` marker inside `trackers/active/create-issue.sh` per `project-state.js`). If `tracker !== 'todoist'`, refuse cleanly: *"This project's active tracker is <X>, not Todoist. /to-todoist only runs when the harness tracker is 'todoist' — use /to-issues for <X>."* Only after this passes, run the secondary gates: check that `trackers/active/create-issue.sh` exists (Todoist adapter installed) and verify the `td` CLI is available in PATH (or via `$TODOIST_CLI`). If either is missing, halt: *"Todoist tracker adapter not installed. Run the installer and select Todoist, or install the td CLI."*
2. Scan for at least ONE planning artifact (see Phase 1). If none exist, halt: *"No planning artifacts found. Run `/grill-me` to establish shared understanding first, then optionally `/research` and `/architect`."*
3. Resolve project and section:
   - If `--project` is provided, use it.
   - If not, check `tasks/notes.md` for a `## Todoist` section with `project:` and `section:` fields.
   - If still no project, halt: *"No Todoist project specified. Provide `--project \"X\"` or add a `## Todoist` section to `tasks/notes.md` with `project: <name>`."*

## Phase 1 — Read all available artifacts

Read every artifact that exists. Each adds context for decomposition:

| Priority | File | What it provides |
|----------|------|-----------------|
| 1 | `grill-summary.md` | Core concept, scope boundaries, resolved decisions |
| 2 | `ARCHITECTURE.md` or `docs/ARCHITECTURE.md` | System design, components, data model |
| 3 | `research.md` | External tech constraints, API shapes, gotchas |
| 4 | `decision-brief.md` | Risk-ranked assumptions, dealbreaker flags |
| 5 | `PRD.md` | Detailed user stories (if using Ralph workflow) |

Also check `tasks/stories/<id>/` variants of each file.

**At least one must exist.** The more artifacts available, the better the decomposition. Typical paths:

- **Minimal (just grill-me):** shared understanding → tasks are higher-level
- **Full (grill + research + architect):** rich context → tasks are precise and well-scoped
- **Ralph path (PRD):** user stories already defined → convert to proper Todoist hierarchy

## Phase 2 — Synthesize requirements

From the artifacts, extract:

1. **Project name** — from the grill-summary title or PRD title
2. **Feature list** — what needs to be built (from resolved forks, user stories, or architecture components)
3. **Scope boundaries** — what's in and what's out
4. **Technical constraints** — from research gotchas, architecture decisions
5. **Risk flags** — from decision-brief assumptions, architecture security section
6. **Dependencies** — ordering constraints (schema before API before UI)

## Phase 3 — Decompose into milestones and tasks

### Milestone identification

Group work into 1–4 milestones based on natural delivery boundaries:
- Each milestone represents a coherent deliverable
- Milestones are ordered by dependency (foundation first, polish last)
- If the project is small enough for a single milestone, use the project/feature name

### Task slicing rules

Within each milestone, identify 2–8 tasks:
- Each task is independently demoable — you could verify it works on its own
- Prefer many thin slices over few thick ones
- No horizontal-only slices — "add the schema column" alone is not a task; it belongs inside a task that delivers a visible behavior
- Each task includes schema + API + UI + tests end-to-end as applicable

For each task, prepare:

| Field | Content | Maps to |
|---|---|---|
| **Title** | Imperative verb phrase, ≤ 60 characters | `td task add "<title>"` |
| **Description** | What it delivers + acceptance criteria + technical notes | `--description` |
| **Priority** | p1 (urgent), p2 (high), p3 (medium), p4 (low) | `--priority` |
| **Source artifact** | Which artifact(s) this derives from | Included in description |
| **Risk flags** | security-sensitive, performance-sensitive, etc. | Included in description |
| **Dependencies** | Which other tasks must complete first | Noted in description |

### Priority mapping

| Criteria | Todoist Priority |
|---|---|
| Blocking other tasks, foundational schema/data work | p1 |
| Core feature implementation, API endpoints | p2 |
| UI, integration, secondary features | p3 |
| Polish, documentation, nice-to-haves | p4 |

**Task ordering:** schema/data first → backend/API → frontend/UI → integration/polish

## Phase 4 — Review with user

Present the proposed decomposition:

> **Feature:** [project name — one-line summary]
> **Todoist project:** [project name] / **Section:** [section name]
>
> **Milestones and tasks:**
>
> ### Milestone 1: [name]
> | # | Title | Priority | Description (preview) | Dependencies |
> |---|-------|----------|----------------------|--------------|
> | 1 | ... | p1 | ... | — |
> | 2 | ... | p2 | ... | Task 1 |
>
> ### Milestone 2: [name]
> | # | Title | Priority | Description (preview) | Dependencies |
> |---|-------|----------|----------------------|--------------|
> | 3 | ... | p2 | ... | Milestone 1 |
> | 4 | ... | p3 | ... | Task 3 |
>
> **Total:** N milestones, M tasks
>
> "Does this breakdown look right? Any tasks to merge, split, reorder, or reprioritize? Say 'go' to create in Todoist."

If `--dry-run` is set, stop here. Print: *"Dry run complete. No tasks created. Remove `--dry-run` to create these tasks in Todoist."*

Do not proceed to Phase 5 without explicit user approval (unless `--dry-run`).

## Phase 5 — Ensure Todoist infrastructure

### 5a — Verify project exists

```bash
td project list --json 2>/dev/null | grep -i "<project-name>"
```

If the project doesn't exist, inform the user and halt: *"Project '<name>' not found in Todoist. Create it first or provide a different project name."*

### 5b — Ensure section exists (if --section provided)

Check if section exists:
```bash
td section list "<project-name>" --json 2>/dev/null
```

If the section doesn't exist, create it:
```bash
td section create --project "<project-name>" --name "<section-name>"
```

## Phase 6 — Create tasks in Todoist

### 6a — Create milestone parent tasks

For each milestone, create an uncompletable parent task:

```bash
td task add "<Milestone: name>" \
  --project "<project>" \
  --section "<section>" \
  --priority p1 \
  --description "<milestone description — scope, deliverables, task count>" \
  --uncompletable \
  --json
```

Capture the returned task ID from the JSON output. Print the milestone name and ID as it's created.

### 6b — Create subtasks under each milestone

For each task within the milestone:

```bash
td task add "<title>" \
  --project "<project>" \
  --parent "id:<milestone-task-id>" \
  --priority <p1-p4> \
  --description "<description with acceptance criteria and technical notes>" \
  --json
```

Description format for each task:
```
What this delivers:
<1-2 sentence description>

Source: <artifact and section reference>

Acceptance criteria:
- Given <context>, when <action>, then <outcome>
- Given ...

Technical notes:
<relevant constraints from research.md or ARCHITECTURE.md>

Dependencies: <task titles this depends on, or "none">
Risk flags: <flags or "none">
```

Print each created task (title + ID) as it's created. If creation fails, print the error and continue with the next task.

## Phase 7 — Verification and summary

### 7a — Verify created tasks

List tasks to confirm creation:
```bash
td task list --project "<project>" --json
```

### 7b — Print summary

```markdown
## Created in Todoist

**Project:** <name>
**Section:** <name>

| # | Task ID | Title | Priority | Parent |
|---|---------|-------|----------|--------|
| 1 | <id> | Milestone: <name> | p1 | — (uncompletable) |
| 2 | <id> | <task title> | p2 | Milestone: <name> |
| 3 | <id> | <task title> | p1 | Milestone: <name> |
| ... | | | | |

**Total:** N milestones, M tasks created

**Next step:** Start working on the first p1 task, or run `/implement "<first-task-title>"` to begin.
```

## Constraints

- Additive only — creates tasks, never modifies or deletes existing ones
- Max 4 milestones, 8 tasks per milestone per run — if more are needed, suggest splitting into multiple runs
- Dependency order is captured by task ordering and noted in descriptions — Todoist doesn't have native dependency tracking
- Task descriptions are capped at reasonable length — keep acceptance criteria to 3-5 items
- If `td` CLI returns an error, print the error and continue with remaining tasks — don't abort the entire run
- The `--json` flag on `td task add` returns the created task's ID, which is needed for `--parent` references
