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
        ├── create-sub-issue.sh
        ├── set-status.sh
        ├── get-comments.sh
        └── get-attachments.sh
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

Every adapter implements the same **16 scripts** with identical signatures:

| Script | Args | What it returns |
|---|---|---|
| `get-issue.sh` | `<ID>` | Full issue/work item details (title, body, **type**, state, **status**, labels) |
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
| `set-status.sh` | `<ID> <status>` | Moves the item to one of the four harness statuses (below) |
| `get-comments.sh` | `<ID>` | The item's comments as JSON, oldest first: `[{"author", "date", "text"}]` |
| `get-attachments.sh` | `<ID> [<dest>]` | Downloads attached files into `<dest>` (default `tasks/stories/<ID>/attachments/`); prints `[{"name", "size", "saved_to", "skipped"}]` |

### Item types

**Every item has one of four types: `Feature`, `Story`, `Bug`, `Task`.** `get-issue.sh` reports it on
a `**Type:**` line in that exact form on every adapter, or `Unknown` when nothing maps. A tracker's own
word is mapped onto the four (ADO `User Story`, `Product Backlog Item` and `Requirement` are `Story`;
`Epic` is `Feature`; `Defect` is `Bug`), never passed through, so a crafted value cannot reach an
agent's brief. ADO also prints the native word on a `**Native type:**` line. The mapping lives in one
place, `lib/item-type.sh`, in a bash half (local) and a jq half (the rest).

`/implement` uses the type to tell a Feature from a story or a bug, and a `Bug` is always planned
test-first (`rules/test-philosophy.md`). `Unknown` is safe: it behaves like a story.

**Setting it.** `create-issue.sh` and `create-sub-issue.sh` read the portable **`TRACKER_ITEM_TYPE`**
on every adapter. A value outside the four (case and the native aliases above are accepted) is
refused with the list, and nothing is created. `create-sub-issue.sh` defaults to `Task` and ignores
an exported parent type, so a child never inherits its parent's type by accident; set it per call.

| Tracker | Stored as | Read from |
|---|---|---|
| ADO | the work item type (`Story` → `ADO_STORY_WORK_ITEM_TYPE`, default `User Story`; `ADO_WORK_ITEM_TYPE` still overrides with any native type) | `System.WorkItemType` |
| GitHub | a `type:<x>` label (created by `setup-labels.sh`) | native issue type, else `type:<x>` label, else `bug` label |
| Local | `type:` in the frontmatter (`LOCAL_ISSUE_TYPE` also works) | `type:`, else `type:<x>` label, else `bug` label |
| Todoist | a `type:<x>` label | `type:<x>` label, else `bug` label |

### Statuses

`set-status.sh <ID> <status>` moves an item through four harness statuses. `get-issue.sh` reports the
current one on a `**Status:**` line (`None` until one is set). Any other value exits non-zero and
changes nothing.

| Status | Meaning |
|---|---|
| `in-progress` | a build is working on the item |
| `in-review` | the build is done and its review has started |
| `needs-person` | the run stopped on something only a person can decide |
| `done` | the build finished and its PR is open |

| Tracker | How |
|---|---|
| Local | a `status:` frontmatter field. `done` does not close the item; `close-issue.sh` does that |
| GitHub | a `status:<s>` label, with every other status label removed in the same edit. `done` also closes the issue |
| Todoist | a `status:<s>` label, replacing any other. `done` does not complete the task |
| ADO | a board **state and column**, from the `ado_status.<status> = <state> \| <column>` lines and `ado_board_column_field` in `tasks/tracker-config.md`. Both go out in one update and are read back; a mismatch, a missing mapping or an ADO rule error exits non-zero |

### Comments and attachments

Both come from people and go straight into an agent's brief, so they are treated as data:

- `get-comments.sh` strips control characters and terminal escape sequences (and HTML tags on ADO).
- `get-attachments.sh` reduces every file name to a single safe name before writing, so no name can
  place a file outside the destination; files over `TRACKER_ATTACHMENT_MAX_BYTES` (default 20 MB) are
  listed with a `skipped` reason and not downloaded. The default destination is under
  `tasks/stories/`, which is gitignored. On KBA projects an attachment may hold PHI: it stays local.

| Tracker | Comments | Attachments |
|---|---|---|
| ADO | the work item Comments API (`az devops invoke`) | `AttachedFile` relations, downloaded through the attachments API |
| GitHub | issue comments | none: files dragged into an issue are links in its body. Prints `[]` and a note |
| Local | the blocks `comment-issue.sh` appends; author `local` | none. Prints `[]` and a note |
| Todoist | task comments (`td comment list`); author is the poster's user id | files attached to comments (`td attachment view`; td refuses files over 10 MB) |

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

### Environment overrides on item creation

`create-issue.sh` and `create-sub-issue.sh` read three optional env vars. They are env vars rather than positional args because arg4 is already the milestone slot in the GitHub adapter and the section slot in Todoist:

| Env var | Applies to | Default | Why you'd set it |
|---|---|---|---|
| `ADO_WORK_ITEM_TYPE` | both | `User Story` (create) / `Task` (sub-issue) | Create a parent `Feature`, or use `Product Backlog Item` on a Scrum-process project — Scrum rejects `User Story` server-side with VS402323. |
| `ADO_AREA_PATH` | both | unset → omitted | Without it ADO drops the item at the project root: created successfully but invisible in the team's filtered board views. A child does **not** inherit its parent's area path. |
| `ADO_ITERATION_PATH` | both | unset → omitted | Same as above — puts the item in a sprint. |

```bash
ADO_WORK_ITEM_TYPE="Feature" \
ADO_AREA_PATH="Developer Playground\SDLC Harness" \
ADO_ITERATION_PATH="Developer Playground\Sprint 3" \
  bash trackers/active/create-issue.sh "Ingest pipeline" "Parent feature" "priority:medium"
```

Set project-wide defaults in `tasks/tracker-config.md` (`ado_area_path`, `ado_iteration_path`, `ado_story_work_item_type`); `/plan-features` reads them and still confirms the destination before writing.

> **Tags go through `--fields`, not `--tags`.** `az boards work-item create` has no `--tags` argument (verified against azure-devops extension 1.0.2 and 1.0.6) — passing it fails with "unrecognized arguments". Both create scripts pass tags as the semicolon-separated `System.Tags` field instead.

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

### Environment overrides on item creation

`create-issue.sh` and `create-sub-issue.sh` read two optional env vars. Like the ADO ones above they
are env vars rather than positional args, because the positional slots are already spoken for
(arg4 = section, arg5 = project here; arg4 = milestone on GitHub):

| Env var | Values | Default | Why you'd set it |
|---|---|---|---|
| `TRACKER_PRIORITY` | `p1` · `p2` · `p3` · `p4` | unset → omitted | Todoist's **native** priority, which sorts and colours the board. A `priority:high` text label does neither. An out-of-range value **fails the create** rather than being silently dropped. |
| `TRACKER_UNCOMPLETABLE` | any non-empty value | unset → omitted | Creates the task with no checkbox — used for a milestone/feature header so a whole feature can't be ticked off by accident. |

```bash
TRACKER_PRIORITY=p1 TRACKER_UNCOMPLETABLE=1 \
  bash trackers/active/create-issue.sh "Ingest pipeline" "Parent feature" "priority:high" "Sprint 1" "My Project"
```

These are named `TRACKER_*`, not `TODOIST_*`, on purpose: they are the **portable** create-time
modifiers. A backend with no such concept simply never reads them, so `/plan-features` sets them on every
call without branching on the backend. Only add a new `TRACKER_*` var when at least one backend can
express it natively and the rest can safely ignore it.

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
type: Bug
parent: null
created: 2026-07-15T10:00:00Z
closed: null
close_reason: null
---

Design notes, research links, or any other task-specific content.
Hand-editing the body is fine — it's where task notes live.
```

### Environment overrides on item creation

The type is set with the portable `TRACKER_ITEM_TYPE` (see **Item types** above). `create-issue.sh`
also still reads this adapter's own `LOCAL_ISSUE_TYPE`, which wins when both are set:

```bash
TRACKER_ITEM_TYPE=Bug bash trackers/active/create-issue.sh "Sanitize path input" "Found during review" "deferred"
```

Set but empty behaves exactly as unset. The value must be one of the four types (or an alias of one);
it is written in its canonical form (`User Story` is stored as `Story`), and anything else, including a
value carrying a newline that could forge a sibling frontmatter field, is refused and nothing is
created. `create-sub-issue.sh` ignores `LOCAL_ISSUE_TYPE` and defaults the child to `Task`, so a type
exported for a parent never stamps its children.

### Task IDs

IDs are bare sequential integers (`42`, not `#42`). The next ID is determined by scanning `tasks/issues/` for the highest existing numeric filename and adding 1. No counter file is needed.

Task files are **never deleted** when closed — the `state` changes to `closed` and the `closed` timestamp is set. This keeps IDs reuse-proof and history greppable.

### Generated dashboard (`todo.md`)

In local mode, `tasks/todo.md` is generated by `trackers/lib/render-todo.sh` from the task files. The dashboard shows open tasks grouped by label, plus a "Recently Closed" section (max 20). It is rebuilt **only on request** (#66): run `bash trackers/lib/render-todo.sh`, or set `LOCAL_RENDER_TODO=1` on a task script. A rebuild on every write cost about 30 seconds each on Windows, so the board may be stale; read task state through the scripts, never from `todo.md`.

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
| `lib/item-type.sh` | The four item types and the mapping from each tracker's words, in bash and jq. |
| `lib/status.sh` | The four harness statuses and their validation, in bash and jq. |
| `lib/ado-status-map.sh` | Reads the ADO board mapping (`ado_status.*`, `ado_board_column_field`) from `tasks/tracker-config.md`. |
| `lib/ticket-content.sh` | Cleaning comment text, safe attachment file names, the attachment size limit. |

To customize retry behaviour, set environment variables before sourcing:
```bash
RETRY_MAX_ATTEMPTS=5 RETRY_BACKOFF_1=2 RETRY_BACKOFF_2=5 bash get-issue.sh 12345
```

---

## Adding a new adapter

Create a folder under `trackers/` with all 16 scripts implementing the same interface. Each script must:
- Accept the same arguments as the interface above
- Exit with code 0 on success, non-zero on failure
- Print errors as `{"error": "..."}` to stderr
- Source `../lib/retry.sh` and `../lib/auth-check.sh`

Then add it as an option in `install/install.js`.
