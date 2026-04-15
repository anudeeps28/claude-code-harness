# Tracker Adapters

Claude Code Kit uses a **tracker adapter layer** so that skills and agents never talk to a specific issue tracker directly. They call scripts from a standard interface, and the active adapter handles the tracker-specific API calls underneath.

---

## How it works

```
.claude/
└── trackers/
    └── active/          ← installed by setup.sh from your chosen adapter
        ├── get-issue.sh
        ├── get-issue-children.sh
        ├── get-pr-review-threads.sh
        ├── reply-pr-thread.sh
        ├── resolve-pr-thread.sh
        └── get-sprint-issues.sh
```

Skills and agents always call `trackers/active/<script>`. The installer copies the right adapter folder there at setup time. Switching trackers means re-running the installer (or copying a different adapter folder manually).

---

## Supported adapters

| Adapter | Folder | CLI required |
|---|---|---|
| Azure DevOps | `trackers/ado/` | `az` + `az devops` extension |
| GitHub | `trackers/github/` | `gh` |

---

## Script interface

Every adapter implements the same 6 scripts with identical signatures:

| Script | Args | What it returns |
|---|---|---|
| `get-issue.sh` | `<ID>` | Full issue/work item details (title, body, state, labels) |
| `get-issue-children.sh` | `<ID>` | Child tasks or sub-issues for the given ID |
| `get-pr-review-threads.sh` | `<PR_ID>` | All unresolved review threads on a PR |
| `reply-pr-thread.sh` | `<PR_ID> <THREAD_ID> "<text>"` | Posts a reply to a review thread |
| `resolve-pr-thread.sh` | `<PR_ID> <THREAD_ID>` | Marks a review thread as resolved |
| `get-sprint-issues.sh` | `<SPRINT_NUMBER>` | All issues in the given sprint |

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

### PR review threads

`get-pr-review-threads.sh` uses GraphQL to return both the numeric comment ID (needed for `reply-pr-thread.sh`) and the thread node ID (needed for `resolve-pr-thread.sh`). The output looks like:

```json
[
  {
    "id": 123456789,
    "threadId": "PRRC_kwDO...",
    "file": "src/MyService.cs",
    "line": 42,
    "content": "Consider null check here.",
    "author": "coderabbitai"
  }
]
```

**Which ID goes where:**

| Script | Pass this field | Example value |
|---|---|---|
| `reply-pr-thread.sh` | `id` (numeric) | `123456789` |
| `resolve-pr-thread.sh` | `threadId` (node ID) | `PRRC_kwDO...` |

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

## Switching trackers after install

Re-run the installer and choose a different tracker:
```bash
bash install/install.sh --global      # or --project /path
```

Or manually copy an adapter:
```bash
# Switch to GitHub
cp trackers/github/*.sh ~/.claude/trackers/active/
chmod +x ~/.claude/trackers/active/*.sh
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

Create a folder under `trackers/` with all 6 scripts implementing the same interface. Each script must:
- Accept the same arguments as the interface above
- Exit with code 0 on success, non-zero on failure
- Print errors as `{"error": "..."}` to stderr

Then add it as an option in `install/install.sh`.
