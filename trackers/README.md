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
        └── list-issues.sh
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

---

## Script interface

Every adapter implements the same **8 scripts** with identical signatures:

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
| `lib/auth-check.sh` | Token staleness check. Verifies CLI auth is valid before making API calls |

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
