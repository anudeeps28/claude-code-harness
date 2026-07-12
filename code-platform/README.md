# Code Platform Adapters

The **code platform** adapter layer handles PR review thread operations — fetching, replying to, and resolving review comments on pull requests. This is independent of the task tracker (where issues/tasks live).

---

## How it works

```
.claude/
└── code-platform/
    └── active/          ← installed by the installer from your chosen platform
        ├── get-pr-review-threads.sh
        ├── reply-pr-thread.sh
        └── resolve-pr-thread.sh
```

Skills (e.g. `/babysit-pr`) call `code-platform/active/<script>`. The installer copies the right adapter there at setup time.

---

## Supported platforms

| Platform | Folder | CLI required |
|---|---|---|
| GitHub / GitHub Enterprise | `code-platform/github/` | `gh` |
| Azure Repos | `code-platform/azure-repos/` | `az` + `az devops` extension |
| None | `code-platform/none/` | — (all scripts fail loudly) |

---

## Script interface

Every adapter implements **3 scripts** with identical signatures:

| Script | Args | What it returns |
|---|---|---|
| `get-pr-review-threads.sh` | `<PR_ID>` | All unresolved review threads: JSON array `[{id, threadId, file, line, content, author}]` |
| `reply-pr-thread.sh` | `<PR_ID> <THREAD_ID> "<text>"` | Posts a reply to a review thread |
| `resolve-pr-thread.sh` | `<PR_ID> <THREAD_ID>` | Marks a review thread as resolved |

### Output schema for `get-pr-review-threads.sh`

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
| `resolve-pr-thread.sh` | `threadId` (node/thread ID) | `PRRC_kwDO...` |

---

## `none` backend

When no code platform is configured, all 3 scripts exit non-zero with a clear error message directing the user to re-run the installer. This prevents silent no-ops that would make `/babysit-pr` appear to succeed while doing nothing.

---

## Shared libraries (`lib/`)

All code-platform scripts source shared utilities from `code-platform/lib/`:

| Library | Purpose |
|---|---|
| `lib/retry.sh` | Exponential backoff wrapper (same as `trackers/lib/retry.sh`) |
| `lib/auth-check.sh` | Token staleness check (same as `trackers/lib/auth-check.sh`) |

---

## Adding a new platform

Create a folder under `code-platform/` with all 3 scripts. Each must:
- Accept the same arguments as the interface above
- Exit with code 0 on success, non-zero on failure
- Print errors as `{"error": "..."}` to stderr
- Source `../lib/retry.sh` and `../lib/auth-check.sh`
- Return the standard output schema from `get-pr-review-threads.sh`

Then add it as an option in `install/install.js`.
