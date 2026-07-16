# Manual Configuration

The installer (`install/install.js`) handles all of this automatically. Use this doc only if you need to change values after install, or if the installer didn't fill something in.

> **Tip:** You rarely need to edit by hand. Every value below can be passed to the installer as a flag (e.g. `--name`, `--project-name`, `--org`), which works with `--yes` for a fully non-interactive install. Run `node install/install.js --help` for the full list, or just re-run the installer — it prints the exact command needed to fill any remaining placeholders.

---

## Tracker modes

The harness supports three modes for tracking work. You choose one at install time.

| Mode | What it means | `tracker` field | `trackerMirror` |
|---|---|---|---|
| **Local** | Tasks live as markdown files in `tasks/issues/`. No external accounts needed. | `local` | *(absent)* |
| **Tracker** | An external tracker (GitHub Issues, ADO, or Todoist) is the single source of truth. No local task files. | `github` / `ado` / `todoist` | `false` or absent |
| **Both** | External tracker is canonical, plus a local `todo.md` mirror the harness regenerates automatically. | `github` / `ado` / `todoist` | `true` |

The mode is stored in `.claude/.harness-manifest.json` (the `tracker` and `trackerMirror` fields). There is no separate "mode" field — the mode is derived: `tracker=local` → local mode; external tracker + `trackerMirror=true` → both mode; external tracker without mirror → tracker mode.

### What the installer asks

**"Where should your task list live?"** — three options in plain English:

1. **Local files** — tasks live as markdown in `tasks/issues/`, private to this machine
2. **An external tracker** — GitHub Issues, Azure DevOps, or Todoist as the single source of truth
3. **Both** — external tracker as the source of truth, plus a local `todo.md` mirror

If you pick option 2 or 3, a follow-up asks which external tracker (GitHub, ADO, or Todoist).

**"Where do your pull requests live?"** — three options, independent of the task tracker:

1. GitHub / GitHub Enterprise
2. Azure Repos
3. Nowhere / none

This sets the `codePlatform` field in the manifest and installs the corresponding `code-platform/active/` adapter (3 PR review scripts). The `none` backend fails loudly if you try `/babysit-pr` without a platform.

### `--yes` defaults (non-interactive installs)

| Scenario | Task mode default | Code platform default |
|---|---|---|
| **Fresh install** | `local` (no accounts needed) | Auto-detected from `git remote`: contains `github.com` → `github`, else `none` |
| **Update crossing** (first `--update` after upgrading to v3) | `both` (preserves existing tracker + adds mirror) | Same auto-detection |

### Managed `.gitignore` block

The installer appends a sentinel-delimited block to your `.gitignore`:

```
# >>> claude-code-harness managed -- do not edit inside this block >>>
tasks/issues/
tasks/todo.md
tasks/lessons.md
tasks/pr-queue.md
tasks/flags-and-notes.md
tasks/people.md
tasks/admin.md
tasks/tracker-config.md
tasks/sprint*.md
tasks/stories/
tasks/sessions*.jsonl*
tasks/metrics*.jsonl*
# <<< claude-code-harness managed <<<
```

The block is idempotent — re-running the installer replaces an existing block in place. The manifest (`.claude/.harness-manifest.json`) is a committed file and is **not** in this block.

If your repo's own `.gitignore` rules hide the manifest (e.g. a blanket `.claude/` ignore), the installer prints the offending rule and suggests a fix — but never edits rules outside the managed block.

### Switching modes later

Re-run the installer and pick a different mode. Open items from the old mode are offered to the new backend one by one via `/sync-tracker --import-backup` — you approve each before it's created. The source file is never deleted automatically.

### The update crossing (existing installs)

The first `--update` that crosses into v3 does three things:

1. **Archives** your old `todo.md` to `tasks/todo-manual-backup.md` (unconditional rename, no parsing)
2. **Asks** which mode you want (`--yes` defaults to **both**) and records it in the manifest
3. **Detects** task files already committed to git (`git ls-files` check), prints the exact `git rm --cached` commands and a warning that untracking removes files from teammates' clones — but **never touches the git index itself**

On the next session start, if `todo-manual-backup.md` exists, the sync hook mentions it and suggests `/sync-tracker --import-backup` for assisted item-by-item import.

---

## Placeholders reference

The **Flag** column is what to pass to the installer (paired with `--yes` for non-interactive installs) instead of editing files by hand.

| Placeholder | Installer flag | What to set it to | Pack |
|---|---|---|---|
| `YOUR_NAME` | `--name` | Your first name (e.g. `Alex`) | Both |
| `YOUR_PROJECT_NAME` | `--project-name` | Human-readable project name (e.g. `my-api`) | Both |
| `YOUR_PROJECT_ROOT` | _(auto)_ | Absolute path to your project — derived from `--project` | Both |
| `YOUR_ADO_PROJECT` | `--ado-project` | Your ADO project name | Enterprise (ADO only) |
| `YOUR_ADO_REPO` | `--ado-repo` | Your ADO repository name | Enterprise (ADO only) |
| `YOUR_ADO_ORG_PATH` | `--ado-org-path` | Sprint IterationPath prefix (e.g. `MyProject`) | Enterprise (ADO only) |
| `YOUR_TODOIST_PROJECT` | `--todoist-project` | Your Todoist project name | Todoist tracker |
| `YOUR_ORG` | `--org` | Org / company short name (used in skill prompts as "the X codebase") | Enterprise |
| `YOUR_LEAD_DEV` | `--lead-dev` | Lead developer name (for blockers) | Enterprise |
| `YOUR_INFRA_PERSON` | `--infra-person` | Infrastructure/cloud person | Enterprise |
| `YOUR_DEVOPS_PERSON` | `--devops-person` | CI/CD/deployments person | Enterprise |
| `YOUR_QA_PERSON` | `--qa-person` | QA/UAT person | Enterprise |
| `YOUR_HARNESS_REPO_PATH` | `--harness-repo-path` | Absolute path to your local clone of `claude-code-harness` (used by `/improve-harness` to reference harness files in its proposals) | Both |
| `CLAUDE_HARNESS_WORK_ROOT` | `--work-root` | Env var in `settings.json` consumed by `catalog-skills.js` — folder containing all your projects | Global install only |

---

## Find and replace

**Mac/Linux:**
```bash
find /path/to/.claude -type f | xargs sed -i 's|YOUR_NAME|Alex|g'
```

**Windows (PowerShell):**
```powershell
Get-ChildItem "C:\path\to\.claude" -Recurse -File | ForEach-Object {
  (Get-Content $_.FullName) -replace 'YOUR_NAME', 'Alex' | Set-Content $_.FullName
}
```

---

## Hook wiring (settings.json)

If settings.json is missing or needs to be rebuilt, this is the template. Replace `HOOKS_PATH` with the absolute path to your `.claude/hooks/` folder.

**Global install** — `HOOKS_PATH` = `~/.claude/hooks`
**Project install** — `HOOKS_PATH` = `/path/to/project/.claude/hooks`

```json
{
  "env": {
    "CLAUDE_HARNESS_WORK_ROOT": "/path/to/your/projects"
  },
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash|Write",
        "hooks": [
          { "type": "command", "command": "node \"HOOKS_PATH/safety-check.js\"" }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          { "type": "command", "command": "node \"HOOKS_PATH/catalog-trigger.js\"" },
          { "type": "command", "command": "node \"HOOKS_PATH/drift-check.js\"" },
          { "type": "command", "command": "node \"HOOKS_PATH/todo-render-trigger.js\"" }
        ]
      }
    ],
    "PreCompact": [
      {
        "matcher": "*",
        "hooks": [
          { "type": "command", "command": "node \"HOOKS_PATH/pre-compact.js\"" }
        ]
      }
    ],
    "SessionStart": [
      {
        "matcher": "*",
        "hooks": [
          { "type": "command", "command": "node \"HOOKS_PATH/session-start-msg.js\"" },
          { "type": "command", "command": "node \"HOOKS_PATH/session-router.js\"" },
          { "type": "command", "command": "node \"HOOKS_PATH/tracker-sync.js\" start" }
        ]
      }
    ],
    "SessionEnd": [
      {
        "matcher": "*",
        "hooks": [
          { "type": "command", "command": "node \"HOOKS_PATH/session-log.js\"" },
          { "type": "command", "command": "node \"HOOKS_PATH/tracker-sync.js\" end" }
        ]
      }
    ]
  }
}
```

---

## `.harness-manifest.json`

Written automatically by the installer at `<target>/.claude/.harness-manifest.json`. This is a **committed** file — it is not gitignored. Used by `/update-harness`, hooks, and skills to determine the active mode and tracker.

| Field | Type | Description |
|---|---|---|
| `schemaVersion` | `number` | Manifest format version (currently `1`) |
| `harnessVersion` | `string` | Harness version at install/update time (from `VERSION`) |
| `installMode` | `"global"` \| `"project"` | How the harness was installed |
| `workflowPack` | `"solo"` \| `"enterprise"` | Which workflow pack was chosen |
| `tracker` | `"github"` \| `"ado"` \| `"todoist"` \| `"local"` | Active tracker adapter |
| `trackerMirror` | `boolean` | Present and `true` only in "both" mode. Absent otherwise. |
| `codePlatform` | `"github"` \| `"azure-repos"` \| `"none"` | Where PRs live (independent of tracker) |
| `prdMode` | `string` | PRD output mode (`file`, `tracker`, `both-file-canonical`, `both-tracker-canonical`) |
| `answers` | `object` | All personalization values collected during install |
| `answers.harnessRepoPath` | `string` | Path to the harness source clone |
| `installedFiles` | `string[]` | Relative paths of every file copied during install |
| `installedAt` | `string` | ISO timestamp of first install |
| `updatedAt` | `string` | ISO timestamp of most recent update |

The manifest is the **only** home for tracker mode and code platform flags. `tasks/tracker-config.md` keeps only personal pointers (Todoist project name, sprint naming conventions, resource names).

To manually edit after install (e.g. change `harnessRepoPath` after moving the clone):

```bash
# Edit the manifest directly — it's plain JSON
vim ~/.claude/.harness-manifest.json
```

---

## Task files

The installer creates a `tasks/` folder from templates for project installs. All task data is per-developer and gitignored.

In **local mode**, tasks also appear in `tasks/issues/` (one markdown file per task). `tasks/todo.md` is auto-generated from those files and should never be hand-edited.

```
tasks/
├── todo.md             ← auto-generated task dashboard (never hand-edit)
├── issues/             ← one file per task, local mode only (e.g. issues/42.md)
├── lessons.md          ← git rules, known fixes, Code Rabbit patterns
├── notes.md            ← session narrative, scratchpad
├── pr-queue.md         ← branch map, PR status, merge order
├── flags-and-notes.md  ← blockers, things waiting on people/systems
└── sprintN.md          ← current sprint task list (e.g. sprint7.md)
```

Optional:
```
tasks/
├── people.md           ← team mode: per-person status
├── admin.md            ← team mode: meetings, emails, coordination
└── tracker-config.md   ← personal pointers: Todoist project, resource names
```

---

## Verification

After setup, open a new Claude Code session and run:

```
/story 1234
```

If Claude reads your lessons.md and asks about the story — you're good.
