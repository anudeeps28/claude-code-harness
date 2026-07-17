# Tracker Adapters

Claude Code Kit uses a **tracker adapter layer** so that skills and agents never talk to a specific issue tracker directly. They call scripts from a standard interface, and the active adapter handles the tracker-specific API calls underneath.

---

## How it works

```
.claude/
└── trackers/
    └── active/          ← installed by the installer from your chosen adapter
        ├── get-issue.sh
        ├── get-issue-children.sh
        ├── get-sprint-issues.sh
        ├── create-issue.sh
        ├── add-label.sh
        ├── remove-label.sh
        ├── close-issue.sh
        ├── list-issues.sh
        ├── assign-issue.sh
        ├── comment-issue.sh
        ├── add-blocker.sh
        ├── get-blockers.sh
        └── create-sub-issue.sh
```

Skills and agents always call `trackers/active/<script>`. The installer copies the right adapter folder there at setup time. Switching trackers means re-running the installer (or copying a different adapter folder manually).

> **Note:** PR review thread scripts (`get-pr-review-threads.sh`, `reply-pr-thread.sh`, `resolve-pr-thread.sh`) have moved to the **code-platform** adapter. See `code-platform/README.md`.

---

## Supported adapters

| Adapter | Folder | CLI required |
|---|---|---|
| Azure DevOps | `trackers/ado/` | `az` + `az devops` extension |
| GitHub | `trackers/github/` | `gh` |
| Todoist | `trackers/todoist/` | `td` (or set `$TODOIST_CLI`) |
| Local | `trackers/local/` | None — file-based, no network |

---

## Script interface

Every adapter implements the same **13 scripts** with identical signatures:

| Script | Args | What it returns |
|---|---|---|
| `get-issue.sh` | `<ID>` | Full issue/work item details (title, body, state, labels) |
| `get-issue-children.sh` | `<ID>` | Child tasks or sub-issues for the given ID |
| `get-sprint-issues.sh` | `<SPRINT_NUMBER>` | All issues in the given sprint |
| `create-issue.sh` | `"<title>" "<body>" "<label>"` | Creates a new issue/work item; prints the URL |
| `add-label.sh` | `<ID> "<label>"` | Adds a label/tag to an issue/work item |
| `remove-label.sh` | `<ID> "<label>"` | Removes a label/tag from an issue/work item |
| `close-issue.sh` | `<ID> ["<reason>"]` | Closes/completes an issue/work item |
| `list-issues.sh` | (none) | All open items as JSON array `[{id, title, state, labels, assignees, url}]` |
| `assign-issue.sh` | `<ID> ["<assignee>"]` | Assigns/claims an item; assignee defaults to the current user |
| `comment-issue.sh` | `<ID> "<text>"` | Adds a comment to an issue/work item |
| `add-blocker.sh` | `<ID> <BLOCKER_ID>` | Records that `<ID>` is blocked by `<BLOCKER_ID>` |
| `get-blockers.sh` | `<ID>` | IDs of items blocking `<ID>` as a JSON array, e.g. `[12, 14]` |
| `create-sub-issue.sh` | `<PARENT_ID> "<title>" "<body>" "<label>"` | Creates an item as a child of the parent; prints `{"parent", "child", "url"}` JSON |

### Wayfinding operations

The last five scripts (added for `/wayfinder`, useful to any skill) are the **wayfinding operations**: claiming, blocking, commenting, and child creation. Each adapter uses the most native mechanism its tracker has:

| Capability | GitHub | ADO | Todoist | Local |
|---|---|---|---|---|
| Claim (`assign-issue.sh`) | Native assignee (`@me` default) | Native assignee (signed-in az user default) | `claimed` **label** (personal Todoist has no assignees — check labels, not assignees) | `assignee:` frontmatter |
| Blocking (`add-blocker.sh` / `get-blockers.sh`) | `Blocked by: #N, #M` body line (native issue dependencies aren't scriptable via stable `gh` yet) | **Native** predecessor dependency link | `Blocked by:` line in the description | `blocked_by:` frontmatter list |
| Comment (`comment-issue.sh`) | Native issue comment | Native discussion comment | Native task comment (`td comment add`) | Timestamped block appended to the task file body |
| Child (`create-sub-issue.sh`) | Native sub-issue (GraphQL) | New Task + parent relation | Native subtask (`--parent-id`) | `parent:` frontmatter |

---

## ADO adapter notes

Requires:
- `az` CLI: https://aka.ms/installazurecli
- `az devops` extension: `az extension add --name azure-devops`
- Default org configured: `az devops configure --defaults organization=https://dev.azure.com/YOUR_ORG`

The installer fills in `YOUR_ADO_PROJECT`, `YOUR_ADO_REPO`, and `YOUR_ADO_ORG_PATH` automatically. If you need to change them later, they are at the top of each script in `.claude/trackers/active/`.

`get-sprint-issues.sh` runs two WIQL queries — one for User Stories, one for Tasks — and outputs them labelled so the `sprint-plan-tracker-reader` agent can match tasks to parent stories.

---

## GitHub adapter notes

Requires:
- `gh` CLI: https://cli.github.com
- Authenticated: `gh auth login`

### Sprint configuration

GitHub doesn't have a native sprint concept. The adapter supports two modes, configured in `tasks/tracker-config.md`:

**Milestones (default)** — uses GitHub Milestones named `Sprint N`:
```
sprint_mode = milestone
```
Create milestones like "Sprint 5" in your GitHub repo and assign issues to them.

**Projects v2** — uses a GitHub Project with an Iteration field:
```
sprint_mode = project
github_project_number = 1
```
Set `github_project_number` to the number shown in your project's URL (`github.com/org/repo/projects/1`). The adapter queries for items whose Iteration field matches "Sprint N".

### Sub-tasks

GitHub has no native parent/child issue relationship. `get-issue-children.sh` returns the issue body so Claude can read task list items (`- [ ]`) or referenced issues (`#123`) from the description.

---

## Todoist adapter notes

Requires:
- `td` CLI (Todoist command-line client)
- Authenticated with a valid API token

### Concept mapping

Todoist doesn't have native equivalents for all GitHub/ADO concepts. The adapter maps them:

| Tracker concept | Todoist equivalent |
|---|---|
| Issue / Work item | Task |
| Sub-issue | Sub-task (`--parent`) |
| Sprint / Iteration | Section within a project |
| Label | Label |
| Milestone | Uncompletable parent task |

### Sprint / section mapping

`get-sprint-issues.sh` lists tasks in a named Todoist section. Configure the project in `tasks/tracker-config.md`:

```
todoist_project = My Project
```

Call with a section name to filter: `get-sprint-issues.sh "Sprint 1"`. Without arguments, lists all open tasks in the configured project.

### CLI resolution

The adapter resolves the `td` binary from:
1. `$TODOIST_CLI` environment variable (if set)
2. `td` on `$PATH`

This makes the adapter portable across macOS (Homebrew) and Linux installs without hardcoding a path.

---

## Local adapter notes

No CLI required. Tasks are stored as markdown files under `tasks/issues/`, one file per task.

### File format

Each task file has YAML frontmatter followed by a free-form body:

```yaml
---
id: 42
title: Add dark mode support
state: open
labels: [feature, ui]
parent: null
created: 2026-07-15T10:00:00Z
closed: null
close_reason: null
---

Design notes, research links, or any other task-specific content.
Hand-editing the body is fine — it's where task notes live.
```

### Task IDs

IDs are bare sequential integers (`42`, not `#42`). The next ID is determined by scanning `tasks/issues/` for the highest existing numeric filename and adding 1. No counter file is needed.

Task files are **never deleted** when closed — the `state` changes to `closed` and the `closed` timestamp is set. This keeps IDs reuse-proof and history greppable.

### Generated dashboard (`todo.md`)

In local mode, `tasks/todo.md` is generated by `trackers/lib/render-todo.sh` from the task files. The dashboard shows open tasks grouped by label, plus a "Recently Closed" section (max 20). It regenerates automatically:
- When any task script runs (create, close, label, list)
- When a `tasks/issues/*.md` file is edited directly (via the `todo-render-trigger.js` hook)

The same renderer is used in "both" mode to produce the mirror from `list-issues.sh` output. Local mode and both mode produce identical dashboard formats from different sources.

### Auth check

The local adapter's auth check verifies that `tasks/issues/` exists. `create-issue.sh` creates the directory on first use.

---

## Error contract

All adapters follow the same rule: **unsupported operations fail loudly.** Scripts print a clear error to stderr and exit non-zero. Nothing may pretend an operation succeeded when it didn't.

---

## Switching trackers after install

Re-run the installer and choose a different tracker, or use:
```bash
node install/install.js --switch-tracker <github|todoist|ado> --project /path
```

---

## Shared libraries (`lib/`)

All tracker scripts source shared utilities from `trackers/lib/`:

| Library | Purpose |
|---|---|
| `lib/retry.sh` | Exponential backoff wrapper. 3 attempts (1s, 3s delays). Wraps any command: `with_retry az boards ...` |
| `lib/auth-check.sh` | Token staleness check. Verifies CLI auth is valid before making API calls. The local adapter uses `check_auth_local` (verifies `tasks/issues/` exists). |
| `lib/render-todo.sh` | Shared dashboard renderer. Reads task data, writes `tasks/todo.md`. Used by local mode (reads files directly) and both mode (reads `list-issues.sh` JSON). Output is deterministic. |

To customize retry behaviour, set environment variables before sourcing:
```bash
RETRY_MAX_ATTEMPTS=5 RETRY_BACKOFF_1=2 RETRY_BACKOFF_2=5 bash get-issue.sh 12345
```

---

## Adding a new adapter

Create a folder under `trackers/` with all 8 scripts implementing the same interface. Each script must:
- Accept the same arguments as the interface above
- Exit with code 0 on success, non-zero on failure
- Print errors as `{"error": "..."}` to stderr
- Source `../lib/retry.sh` and `../lib/auth-check.sh`

Then add it as an option in `install/install.js`.
