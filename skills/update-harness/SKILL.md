---
name: update-harness
description: Check for and apply updates to your claude-code-harness installation. Resolves target (project/global/both), checks for new versions, shows changelog, and applies updates with human confirmation. Usage: /update-harness [--global|--project]
---

You are the harness update orchestrator. Your job is to check for available updates to the user's claude-code-harness installation and apply them safely with the user's confirmation.

---

## Step 1 — Resolve the update target

Determine which installation(s) to update:

1. Check for a **project-level** manifest at `$PWD/.claude/.harness-manifest.json`
2. Check for a **global** manifest at `~/.claude/.harness-manifest.json`

Resolution rules:
- **Project only** → target the project install
- **Global only** → target the global install
- **Both exist** → ASK the user: "Update project install, global install, or both?"
- **Neither exists** → tell the user: "No harness manifest found. This means you installed before manifests were added. I'll run the backfill process to create one." Then follow the **Legacy Backfill** procedure below.
- `--global` flag in `$ARGUMENTS` → skip detection, target global
- `--project` flag in `$ARGUMENTS` → skip detection, target project

For each target, read `.harness-manifest.json` and extract `answers.harnessRepoPath`.

---

## Step 2 — Precondition checks

For each target:

1. Verify the harness clone exists at `answers.harnessRepoPath`. If missing:
   ```
   Error: Harness source not found at <path>.
   Fix: git clone <repo-url> <path>
   Or update the path: edit <target>/.harness-manifest.json → answers.harnessRepoPath
   ```
   **Stop.** Do not proceed without the clone.

2. If the manifest is missing (no-manifest case), route to the Legacy Backfill procedure.

---

## Step 3 — Check for updates

Run the installer's `--check` mode:

```bash
node "<harnessRepoPath>/install/install.js" --check --project "<projectDir>"
# or --global for global installs
```

Parse the JSON output. Narrate the result:

- **Version**: `<currentVersion>` → `<latestVersion>` (`<behind>` commits behind)
- **Changelog** (if any): show the excerpt
- **Orphaned files** (if any): list them
- **Dirty clone** warning (if `dirty` is true)
- **Fetch error** (if `fetchError` is set): narrate the specific error

If `behind === 0` and `currentVersion === latestVersion`:
```
Your harness is up to date (v<version>).
```
**Stop** unless the user explicitly asks to re-apply.

---

## Step 4 — Human gate

**NEVER mutate files before this step.** Show the user what will happen:

```
Ready to update claude-code-harness:
  Version:  <current> → <latest>
  Target:   <target path>
  Changes:  <behind> commits
  Orphans:  <count> file(s) will be removed

Proceed? [y/N]
```

Wait for explicit confirmation. If denied, stop.

---

## Step 5 — Apply the update

Run the installer's `--update` mode:

```bash
node "<harnessRepoPath>/install/install.js" --update --project "<projectDir>"
# or --global for global installs
```

Narrate each step as it happens:
1. Snapshot created at `~/.claude/.harness-backups/<timestamp>/`
2. Git pull result (or "already up to date")
3. Files copied/updated
4. Orphans removed
5. Settings reconciled
6. Verification result
7. Manifest updated

---

## Step 5b — Check tracker configuration

After the update completes, check if `tracker` is set in the manifest:

1. Read the updated `.harness-manifest.json` → `tracker` field
2. If **not set** (null or missing):
   ```
   Tracker is not configured for this project.
   Which tracker do you use for task management?
     1) GitHub Issues
     2) Todoist
     3) Azure DevOps
     4) None (local task files only)
   ```
   On answer, run:
   ```bash
   node "<harnessRepoPath>/install/install.js" --switch-tracker <choice> --project "<projectDir>"
   ```
3. If set but adapter scripts don't match (verify by checking script contents):
   ```
   Tracker is set to "<tracker>" but adapter scripts look like "<other>". Fixing...
   ```
   Run `--switch-tracker` to correct the scripts.

---

## Step 6 — Report result

After completion, report:

```
Update complete: v<old> → v<new>
Tracker: <tracker>

To restore the previous version:
  cp -r "<snapshot-path>/"* "<target>/"
```

If updating **both** targets, repeat steps 3-6 for the second target.

---

## Legacy Backfill

When no manifest exists (pre-manifest install), create one by reverse-detecting the install configuration:

1. **Detect workflowPack**: Check if enterprise-only agents exist (e.g., `story-understand-agent.md`). If present → `enterprise`. Otherwise → `solo`.

2. **Detect tracker**: Read the tracker adapter scripts in `<target>/trackers/active/`:
   - If scripts contain `az boards` → `ado`
   - If scripts contain `td ` (Todoist CLI calls) → `todoist`
   - Otherwise → `github`

3. **Detect prdMode**: ASK the user — this cannot be reliably auto-detected:
   ```
   Where do your PRDs live?
     1) File in repo (PRD.md)
     2) Tracker issue
     3) Both — file canonical
     4) Both — tracker canonical
   ```

4. **Reconstruct installedFiles**: Walk the target's `skills/`, `agents/`, `hooks/`, `rules/`, `trackers/` directories and list all files.

5. **Read harnessRepoPath**: ASK the user for the path to their harness clone if not obvious.

6. **Write manifest**: Use the detected values to write `.harness-manifest.json`.

Narrate the entire process:
```
You installed the harness before manifests were added.
I'll ask a couple of questions to create one — future updates will be silent.
```

After backfill, proceed with the normal update flow (Step 3 onwards).
