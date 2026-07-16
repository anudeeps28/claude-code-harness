# Troubleshooting

Common issues and how to fix them.

---

## Installer

### The installer ran but skills aren't showing up in Claude Code

Skills must be inside `~/.claude/skills/` (global) or `<project>/.claude/skills/` (project). Verify:

```bash
# Global install
ls ~/.claude/skills/

# Project install
ls .claude/skills/
```

If empty, re-run the installer. If files are present, check that each skill directory contains a `SKILL.md` with valid frontmatter (`name`, `description`).

### I need to change my ADO project name / repo after install

Re-run the installer — it will detect the existing installation and offer to upgrade. Or find-and-replace manually:

```bash
# Mac/Linux
grep -rn "OLD_PROJECT_NAME" .claude/ --include="*.sh" --include="*.md"
sed -i 's/OLD_PROJECT_NAME/NEW_PROJECT_NAME/g' .claude/trackers/active/*.sh

# Windows (PowerShell)
Get-ChildItem .claude -Recurse -Include *.sh,*.md | Select-String "OLD_PROJECT_NAME"
```

### settings.json was overwritten — how do I rebuild it

The installer backs up your existing `settings.json` to `settings.json.bak` before writing a new one. To restore:

```bash
cp .claude/settings.json.bak .claude/settings.json
```

To regenerate from scratch, re-run the installer.

### How do I switch from ADO to GitHub (or vice versa)?

1. Re-run the installer and select the new tracker
2. Or manually copy the tracker scripts:
   ```bash
   cp trackers/github/*.sh .claude/trackers/active/
   chmod +x .claude/trackers/active/*.sh
   ```

### How do I uninstall?

```bash
bash install/install.sh --uninstall
```

This creates a timestamped backup and removes skills, agents, hooks, rules, and trackers. Your `settings.json` and task files are preserved.

---

## Hooks

### The safety hook is blocking a command it shouldn't

The safety hook (`hooks/safety-check.js`) is intentionally strict. If you're being blocked on a command you need:

1. **Check the deny reason** — it's printed in the hook output
2. **Allow specific patterns** — add an allowlist entry to the `RULES` array or add an early-return before the loop in `safety-check.js`. The existing `/temp/acr-build` allowlist is the pattern to follow.
3. **Approve it manually** — Claude Code will prompt you to approve/deny when a hook blocks

### The catalog is not rebuilding when I edit a skill

All platforms now use `catalog-trigger.js` + `catalog-skills.js` (pure Node). Check that `settings.json` has:

```json
{
  "hooks": {
    "PostToolUse": [{
      "matcher": "Write|Edit",
      "hooks": [{ "type": "command", "command": "node \"/path/to/.claude/hooks/catalog-trigger.js\"" }]
    }]
  }
}
```

**Common fix:** If `catalog-skills.js` fails silently, it's usually because `CLAUDE_HARNESS_WORK_ROOT` isn't set. Check the `env` block of `settings.json` (the installer writes it there), or export it manually:

```bash
export CLAUDE_HARNESS_WORK_ROOT="$HOME/projects"
node .claude/hooks/catalog-skills.js
```

### pre-compact.js is not writing to notes.md

The hook resolves the project root via `git rev-parse --show-toplevel`. If you're not inside a git repository, it falls back to `process.cwd()`. Verify:

```bash
# Should return your project root
git rev-parse --show-toplevel

# Check that notes.md exists there
ls "$(git rev-parse --show-toplevel)/tasks/notes.md"
```

If `tasks/notes.md` doesn't exist, create it manually or re-run the installer with `--project`.

### drift-check.js is producing unexpected output

This hook replaces the old `task-sync-check.sh` reminder. It fires **only** when one of the 7 enterprise task files is edited (`lessons.md`, `todo.md`, `pr-queue.md`, `flags-and-notes.md`, `tracker-config.md`, `people.md`, `sprint<N>.md`) — not every file in `tasks/`. It reports drift across files.

- **Soft warnings** (bogus PR status, sprint status, people.md line too long) inject a context message but don't block.
- **Hard block** fires when `people.md` references a "Waiting on" item that doesn't exist in `flags-and-notes.md`. Run `/sync-tasks` to see the full list and fix the source of truth.

If you're getting a false positive, check the actual file content matches one of the allowed enum values exactly (e.g. `"Merged"`, not `"merged"`).

---

## Tracker Modes

### PR review commands say "no code platform configured"

This means the `code-platform/active/` adapter is set to `none`. Skills like `/babysit-pr` need a code platform (GitHub or Azure Repos) to fetch and resolve review threads.

**Fix:** Re-run the installer and pick a code platform when asked "Where do your pull requests live?", or:

```bash
node install/install.js --code-platform github --project /path/to/project
```

### todo.md says AUTO-GENERATED and my edits vanish

This is expected. In local and both modes, `todo.md` is a generated dashboard — it regenerates automatically whenever tasks change. Your hand-edits will be overwritten.

**Where to put your content instead:**
- **Session notes, scratchpad, conventions** → `tasks/notes.md`
- **Task-specific notes** → the body of the task file itself (e.g. `tasks/issues/42.md`, below the YAML frontmatter)
- **Blockers and decisions** → `tasks/flags-and-notes.md`

### Fresh clone has no tasks (local mode)

This is expected. In local mode, task files live in `tasks/issues/` which is gitignored — they are per-developer, not shared via git. Each developer's tasks are private to their machine.

After cloning, create your first task with:
```bash
bash .claude/trackers/active/create-issue.sh "My first task" "Description here" "feature"
```

Or use `/implement "description"` — in local mode, it offers to create a local task automatically.

### Sync hook reports drift at session start

The `tracker-sync.js` hook runs at session start and checks for open items that look delivered (a merged PR references them). This is informational — it won't close anything automatically at session start.

**To reconcile:** Run `/sync-tracker` to review each item and decide whether to close it.

### Updater says task files are still tracked by git

During `--update`, the installer checks whether gitignored task files (like `tasks/issues/`, `tasks/todo.md`) are still tracked in git. If your project committed these files before they were gitignored, git continues tracking them.

**Fix:** Run the exact commands the updater printed:
```bash
git rm --cached tasks/issues/ tasks/todo.md
git commit -m "chore: untrack per-developer task files"
```

**Team impact:** `git rm --cached` removes files from the index only — your local copies are preserved. But teammates who pull this commit will have those files deleted from their working tree. Warn the team first if those files contain work they haven't backed up.

### My old todo.md content is in todo-manual-backup.md — how do I import it

When upgrading to v3, the updater archives your old hand-written `todo.md` to `tasks/todo-manual-backup.md`. To import those items into your new tracker:

```
/sync-tracker --import-backup
```

This parses unchecked items from the backup, cross-checks against existing open items for duplicates, and lets you approve each before creating it. Checked items are skipped. The backup file is never deleted automatically — remove it yourself when you're done.

You can also import a retired `plan.md`:
```
/sync-tracker --import-backup tasks/plan.md
```

---

## Tracker Adapters

### "ADO_PROJECT not configured" error

This means the placeholder was never replaced during installation. Fix:

```bash
# Check which scripts still have the placeholder
grep -rn "YOUR_ADO_PROJECT" .claude/trackers/active/

# Replace in all scripts
sed -i 's/YOUR_ADO_PROJECT/ActualProjectName/g' .claude/trackers/active/*.sh
```

### get-sprint-issues.sh fails with authentication error

**Azure DevOps:**
```bash
# Check auth status
az account show

# If not logged in:
az login

# Ensure the devops extension is installed
az extension add --name azure-devops

# Set default org (if not already set)
az devops configure --defaults organization=https://dev.azure.com/YOUR_ORG
```

**GitHub:**
```bash
# Check auth status
gh auth status

# If not logged in:
gh auth login
```

### get-issue.sh returns empty or garbled output

1. Verify the CLI works standalone:
   ```bash
   # ADO
   az boards work-item show --id 12345 --project YOUR_PROJECT

   # GitHub
   gh issue view 42
   ```
2. If the CLI works but the script doesn't, check that `jq` is installed: `jq --version`
3. Ensure the script has execute permissions: `chmod +x .claude/trackers/active/*.sh`

### reply-pr-thread.sh fails

This script uses `jq` for JSON escaping. Verify:

```bash
# Check jq is installed
jq --version

# If missing, install:
# Mac:    brew install jq
# Ubuntu: sudo apt install jq
# Windows: winget install jqlang.jq
```

### get-issue-children.sh returns "No child tasks" when children exist

The script parses `System.LinkTypes.Hierarchy-Forward` relations. If your ADO project uses a different link type (e.g., `Related`), the children won't be found. Check the raw output:

```bash
az boards work-item show --id 12345 --expand relations --project YOUR_PROJECT --output json | jq '.relations[].rel'
```

### GitHub: get-sprint-issues.sh returns empty results

GitHub uses milestones instead of sprints. Ensure:
1. A milestone named `Sprint N` (or matching your naming) exists in the repo
2. Issues are assigned to that milestone
3. The `gh` CLI has access to the correct repo

---

## Skills

### /story fails at Phase 1 (can't read task files)

The skill expects `tasks/lessons.md`, `tasks/todo.md`, etc. to exist. For project installs, the installer creates these. For global installs, you need to create them manually in your project:

```bash
mkdir -p tasks
# Copy templates from the harness repo
cp path/to/claude-code-harness/templates/tasks/*.md tasks/
```

### /sprint-plan fails with "sprint-template.md not found"

Ensure `tasks/sprint-template.md` exists in your project. If missing:

```bash
cp path/to/claude-code-harness/templates/tasks/sprint-template.md tasks/
```

### /babysit-pr is not finding Code Rabbit threads

1. Check that Code Rabbit has reviewed the PR (look for comments with author "Code Rabbit")
2. Verify the `get-pr-review-threads.sh` script filters by the correct author name — the default is `Code Rabbit`. If your instance uses a different display name, update the `--query` filter in the script.

---

## General

### How do I verify the install worked?

```bash
# Check critical files exist
ls .claude/skills/story/SKILL.md
ls .claude/hooks/safety-check.js
ls .claude/trackers/active/get-issue.sh

# Check for unresolved placeholders
grep -rn "YOUR_" .claude/ --include="*.sh" --include="*.md" | grep -v CONFIGURE.md

# Test a tracker script
bash .claude/trackers/active/get-issue.sh 12345
```

### Claude Code says "no matching skill" when I type /story

Skills are only visible if they're in the correct directory structure:
- Global: `~/.claude/skills/<skill-name>/SKILL.md`
- Project: `<project>/.claude/skills/<skill-name>/SKILL.md`

Check that the `SKILL.md` file has valid YAML frontmatter with a `name` field.

### Hooks are not firing at all

1. Verify `settings.json` exists at the right level:
   - Global: `~/.claude/settings.json`
   - Project: `<project>/.claude/settings.json`
2. Check that the hook commands use correct paths for your OS (bash paths on Mac/Linux, PowerShell paths on Windows)
3. Test a hook manually:
   ```bash
   echo '{"tool_name":"Bash","tool_input":{"command":"echo test"}}' | node .claude/hooks/safety-check.js
   ```
