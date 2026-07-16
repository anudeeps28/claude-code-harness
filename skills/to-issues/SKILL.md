---
name: to-issues
description: Decompose planning artifacts into tracker tasks with proper hierarchy — issues (stories) grouped by milestone, with sub-issues (tasks) for breakdown. Backend-aware: creates GitHub issues, ADO work items, Todoist tasks, or local task files depending on your tracker mode. Reads from grill-summary, research, architecture, decision-brief, or PRD — no single artifact required. Usage: /to-issues [--milestone "<name>"] [--project "<name>"]
triggers: /to-issues
---

# /to-issues

Decompose planning artifacts into tracker tasks. Each task is an independently demoable story. Stories are grouped by milestone and can have sub-issues for task breakdown. Creates items in your active tracker backend (GitHub issues, ADO work items, Todoist tasks, or local task files).

**Designed for solo developers on personal GitHub plans.** No org features required — uses issues, sub-issues, labels, milestones, and optionally projects.

Reads from ALL available planning artifacts in the decide/define phases. No single artifact is required — uses whatever exists.

**Triggers:** explicitly called with `/to-issues`

## Input

```
/to-issues [--milestone "<name>"] [--project "<name>"] [--with-tasks]
```

- `--milestone "<name>"` — group all stories under this milestone (creates it if it doesn't exist). If not provided, infers a name from the grill-summary or architecture title.
- `--project "<name>"` — add all issues to a Projects v2 board (optional, for devs who want kanban/roadmap views)
- `--with-tasks` — also create sub-issues for each story's tasks (default: stories only, tasks listed as acceptance criteria)

## Hard input gate

Before doing anything else:

1. Check that `trackers/active/create-issue.sh` exists. If not, halt: *"Tracker adapter not found. Run the harness installer or add `create-issue.sh` to `.claude/trackers/active/`."*
2. Scan for at least ONE planning artifact (see Phase 1). If none exist, halt: *"No planning artifacts found. Run `/grill-me` to establish shared understanding first, then optionally `/research` and `/architect`."*

## Phase 0 — Detect active backend

Read `.claude/.harness-manifest.json`:
- `tracker` field → the active tracker backend (`github`, `local`, `todoist`, `ado`).

If no manifest or no tracker configured, fall back to `tasks/tracker-config.md` `**Type:**` field or adapter script detection in `.claude/trackers/active/`.

Record the backend — subsequent phases branch on it. Only Phase 6a (`create-issue.sh`) is portable across all backends; Phases 5a/5b/5c and 6b are GitHub-only and are gated below.

If `tracker === 'todoist'`, add a deprecation pointer: *"This project's tracker is Todoist — prefer `/to-todoist`, which creates the Todoist milestone/subtask hierarchy. Continue only for flat issue creation."*

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

- **Minimal (just grill-me):** shared understanding → stories are higher-level
- **Full (grill + research + architect):** rich context → stories are precise and well-scoped
- **Ralph path (PRD):** user stories already defined → convert to proper GitHub hierarchy

## Phase 2 — Synthesize requirements

From the artifacts, extract:

1. **Project name** — from the grill-summary title or PRD title
2. **Feature list** — what needs to be built (from resolved forks, user stories, or architecture components)
3. **Scope boundaries** — what's in and what's out
4. **Technical constraints** — from research gotchas, architecture decisions
5. **Risk flags** — from decision-brief assumptions, architecture security section
6. **Dependencies** — ordering constraints (schema before API before UI)

## Phase 3 — Decompose into vertical slices (stories)

**Slicing rules:**
- Each story is independently demoable — you could verify it works on its own
- Prefer many thin slices over few thick ones
- No horizontal-only slices — "add the schema column" alone is not a story; it belongs inside a story that delivers a visible behavior
- Each story includes schema + API + UI + tests end-to-end as applicable

Identify 3–12 stories. For each story, prepare:

| Field | Content |
|---|---|
| **Title** | Imperative verb phrase, ≤ 60 characters |
| **What it delivers** | 1–2 sentences describing the end-to-end behavior |
| **Source artifact** | Which artifact(s) this derives from (e.g., "grill-summary § Resolved fork #3", "ARCHITECTURE.md § Data architecture") |
| **Risk flags** | Any of: `security-sensitive`, `performance-sensitive`, `customer-data-touching`, `regulated-data` |
| **Acceptance criteria** | 3–5 statements in Given/When/Then format |
| **Tasks** (if --with-tasks) | 2-5 implementation steps that become sub-issues |
| **Labels** | priority label + any risk labels |

**Story ordering:** schema/data first → backend/API → frontend/UI → integration/polish

## Phase 4 — Review with user

Present the proposed decomposition:

> **Initiative:** [project name — one-line summary]
> **Milestone:** [name — groups these stories together]
>
> **Stories (GitHub issues):**
> | # | Title | Delivers | Risk | Tasks |
> |---|-------|----------|------|-------|
> | 1 | ... | ... | ... | N (if --with-tasks) |
> | 2 | ... | ... | ... | |
>
> **Project board:** [name, if --project provided]
>
> "Does this decomposition look right? Any stories to merge, split, or reorder? Say 'go' to create the issues."

Do not proceed to Phase 5 without explicit user approval.

## Phase 5 — Setup infrastructure

**GitHub-only.** `setup-labels.sh`, `create-milestone.sh`, `create-project.sh` (and `add-to-project.sh` in Phase 6) exist ONLY under `trackers/github/`. Run this phase only when `backend === 'github'` (equivalently: only run each call if the script exists in `trackers/active/`). For `local`/`todoist`/`ado`, skip label/milestone/project setup and print: *"Backend <X> has no label/milestone/project infrastructure in the standard adapter interface — skipping Phase 5; work items are created directly."*

Before creating issues, set up the supporting GitHub infrastructure:

### 5a — Labels

Check if harness labels exist (look for `priority:high` label). If not:
```bash
bash trackers/active/setup-labels.sh
```

### 5b — Milestone

Infer or use the provided milestone name. Create if it doesn't exist:
```bash
bash trackers/active/create-milestone.sh "<milestone-name>" "<description from grill-summary overview>"
```
If the milestone already exists (API returns 422), that's fine — use the existing one.

### 5c — Project (only if --project provided)

```bash
bash trackers/active/create-project.sh "<project-name>"
```
Store the project number for adding items later. Note: requires `gh auth refresh -s project`.

## Phase 6 — Create issues

### 6a — Create story issues

For each approved story, call `create-issue.sh` in the form that matches the backend:

- **github** — keep the 5-arg form (arg4 = milestone, arg5 = project):
```bash
bash trackers/active/create-issue.sh "<title>" "<body>" "priority:medium,<risk-labels>" "<milestone-name>" "<project_num>"
```
- **local / ado** — 3-arg form only (arg4/arg5 are ignored, but do not rely on that):
```bash
bash trackers/active/create-issue.sh "<title>" "<body>" "priority:medium,<risk-labels>"
```
- **todoist** — 3-arg form, and NEVER pass the milestone name as arg4 (in the Todoist adapter arg4 is the SECTION slot and arg5 is PROJECT, so forwarding a milestone name silently mis-files the task). Prefer routing to `/to-todoist`.

Story body format:
```markdown
## What this delivers
<1–2 sentence description>

## Source
- Artifact: <§ reference to source artifact and section>

## Risk flags
<comma-separated flags, or "none">

## Acceptance criteria
- Given <context>, when <action>, then <outcome>
- Given ...
- Given ...

## Technical notes
<any relevant constraints from research.md or ARCHITECTURE.md>
```

Report where each task landed by parsing the adapter's stdout, per backend:
- **github / todoist** — the adapter prints a URL; print the number/id + URL.
- **local** — `create-issue.sh` prints `<id> <path>` (e.g. `7 tasks/issues/7.md`); print `task #<id> -> tasks/issues/<id>.md`.

If creation fails, print the error and continue.

### 6b — Create task sub-issues (only if --with-tasks)

**Native sub-issues are GitHub-only.** `create-sub-issue.sh` and `add-to-project.sh` exist only under `trackers/github/`. Run the steps below only when `backend === 'github'`. For `local`/`todoist`/`ado`, the 8-script adapter interface has no child-create, so create each task as a standalone work item via `create-issue.sh` (3-arg form) and note in the Phase 7 summary that tasks were created flat (no native sub-issue link). Do NOT call `add-to-project.sh` for non-github backends.

If `--with-tasks` was specified (github), for each story's task list:

```bash
bash trackers/active/create-sub-issue.sh <STORY_NUMBER> "<task title>" "<task body>" ""
```

Task body format:
```markdown
## Task
<one-line description of what to implement>

## Done when
- [ ] <specific verifiable criterion>
- [ ] Tests pass
```

If project was created, add each task:
```bash
bash trackers/active/add-to-project.sh <PROJECT_NUM> "<TASK_URL>"
```

## Phase 7 — Summary

```markdown
## Created

**Milestone:** <name>

**Stories:**
| # | Issue | Title | Labels | Tasks |
|---|-------|-------|--------|-------|
| 1 | #N | ... | priority:medium | 3 sub-issues (if --with-tasks) |
| 2 | #N | ... | priority:medium, risk:security | 2 sub-issues |

**Infrastructure:**
- Milestone: <name> — <N> stories assigned
- Project: <name> (if created)
- Labels: <N> created/updated (if setup-labels ran)

**Next step:** Run `/implement #<first-story-number>` to start building the first story.
```

Make the summary backend-aware to match where items actually landed:
- **github** — `Issue #N` + URL; next step `/implement #<n>`. Include the Infrastructure rows above.
- **local** — `task #<id> (tasks/issues/<id>.md)`; next step `/implement #<id>`. Omit the Milestone/Project/Labels infrastructure rows (Phase 5 was skipped) or mark them "n/a for local backend"; if `--with-tasks` ran, note tasks were created flat (no native sub-issue link).
- **todoist** — task URL/title; next step `/implement "<title>"`. Omit the GitHub infrastructure rows; if `--with-tasks` ran, note tasks were created flat.

## Constraints

- Additive only — creates issues, never modifies existing ones (except adding to milestone/project)
- Max 12 stories per run — if more are needed, suggest splitting into multiple milestones
- Dependency order is captured by story numbering — first story has no dependencies on later ones
- Works on personal GitHub plans — no org features required
- Sub-issues (tasks) are optional via `--with-tasks` — by default, tasks are listed as acceptance criteria within the story issue body
