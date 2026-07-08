# Manual Configuration

The installer (`install/install.sh`) handles all of this automatically. Use this doc only if you need to change values after install, or if the installer didn't fill something in.

> **Tip:** You rarely need to edit by hand. Every value below can be passed to the installer as a flag (e.g. `--name`, `--project-name`, `--org`), which works with `--yes` for a fully non-interactive install. Run `node install/install.js --help` for the full list, or just re-run the installer — it prints the exact command needed to fill any remaining placeholders.

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
          { "type": "command", "command": "node \"HOOKS_PATH/drift-check.js\"" }
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
          { "type": "command", "command": "echo \"SESSION START: Before doing anything else — read tasks/lessons.md, todo.md, pr-queue.md, and flags-and-notes.md\"" }
        ]
      }
    ],
    "SessionEnd": [
      {
        "matcher": "*",
        "hooks": [
          { "type": "command", "command": "node \"HOOKS_PATH/session-log.js\"" }
        ]
      }
    ]
  }
}
```

---

## `.harness-manifest.json`

Written automatically by the installer at `<target>/.claude/.harness-manifest.json`. Used by `/update-harness` and `--check`/`--update` modes to track the installed state.

| Field | Type | Description |
|---|---|---|
| `schemaVersion` | `number` | Manifest format version (currently `1`) |
| `harnessVersion` | `string` | Harness version at install/update time (from `VERSION`) |
| `installMode` | `"global"` \| `"project"` | How the harness was installed |
| `workflowPack` | `"solo"` \| `"enterprise"` | Which workflow pack was chosen |
| `tracker` | `"github"` \| `"ado"` \| `"todoist"` | Active tracker adapter |
| `prdMode` | `string` | PRD output mode (`file`, `tracker`, `both-file-canonical`, `both-tracker-canonical`) |
| `answers` | `object` | All personalization values collected during install |
| `answers.harnessRepoPath` | `string` | Path to the harness source clone |
| `installedFiles` | `string[]` | Relative paths of every file copied during install |
| `installedAt` | `string` | ISO timestamp of first install |
| `updatedAt` | `string` | ISO timestamp of most recent update |

To manually edit after install (e.g. change `harnessRepoPath` after moving the clone):

```bash
# Edit the manifest directly — it's plain JSON
vim ~/.claude/.harness-manifest.json
```

---

## Task files

The installer creates a `tasks/` folder from templates for project installs. For global installs, create it manually in each project:

```
tasks/
├── todo.md             ← current work items and in-progress details
├── lessons.md          ← git rules, known fixes, Code Rabbit patterns
├── pr-queue.md         ← branch map, PR status, merge order
├── flags-and-notes.md  ← blockers, things waiting on people/systems
└── sprintN.md          ← current sprint task list (e.g. sprint7.md)
```

Optional:
```
tasks/
├── people.md           ← team mode: per-person status
├── admin.md            ← team mode: meetings, emails, coordination
└── tracker-config.md   ← environment URLs, API endpoints, resource names
```

---

## Non-ADO trackers

The `babysit-pr`, `story`, and `sprint-plan` skills include ADO adapter scripts by default. If you use GitHub or Jira, replace the scripts in:

```
.claude/skills/babysit-pr/scripts/
.claude/skills/story/scripts/
.claude/skills/sprint-plan/scripts/
```

with equivalent API calls for your tracker.

---

## Verification

After setup, open a new Claude Code session and run:

```
/story 1234
```

If Claude reads your lessons.md and asks about the story — you're good.
