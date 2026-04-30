# Manual Configuration

The installer (`install/install.sh`) handles all of this automatically. Use this doc only if you need to change values after install, or if the installer didn't fill something in.

---

## Placeholders reference

| Placeholder | What to set it to | Pack |
|---|---|---|
| `YOUR_NAME` | Your first name (e.g. `Alex`) | Both |
| `YOUR_PROJECT_NAME` | Human-readable project name (e.g. `my-api`) | Both |
| `YOUR_PROJECT_ROOT` | Absolute path to your project | Both |
| `YOUR_ADO_PROJECT` | Your ADO project name | Enterprise (ADO only) |
| `YOUR_ADO_REPO` | Your ADO repository name | Enterprise (ADO only) |
| `YOUR_ADO_ORG_PATH` | Sprint IterationPath prefix (e.g. `MyProject`) | Enterprise (ADO only) |
| `YOUR_ORG` | Org / company short name (used in skill prompts as "the X codebase") | Enterprise |
| `YOUR_LEAD_DEV` | Lead developer name (for blockers) | Enterprise |
| `YOUR_INFRA_PERSON` | Infrastructure/cloud person | Enterprise |
| `YOUR_DEVOPS_PERSON` | CI/CD/deployments person | Enterprise |
| `YOUR_QA_PERSON` | QA/UAT person | Enterprise |
| `YOUR_HARNESS_REPO_PATH` | Absolute path to your local clone of `claude-code-harness` (used by `/improve-harness` to reference harness files in its proposals) | Both |
| `CLAUDE_HARNESS_WORK_ROOT` | Env var in `settings.json` consumed by `catalog-skills.js` — folder containing all your projects | Global install only |

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
