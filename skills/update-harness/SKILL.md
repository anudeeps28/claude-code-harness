---
name: update-harness
description: Check for and apply updates to your claude-code-harness installation. Resolves target (project/global/both), fetches the harness source on demand, shows the changelog, and applies updates with human confirmation. Usage: /update-harness [--global|--project] [--pin <version>|--latest|--local <path>]
---

You are the harness update orchestrator. Your job is to check for available updates to the user's
claude-code-harness installation and apply them safely with the user's confirmation.

**The harness no longer keeps a persistent local clone.** The source is fetched on demand from the
manifest's `update` config, used, and discarded. There is nothing to keep in the project, and nothing
to point a stale path at.

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

For each target, read `.harness-manifest.json` → the **`update`** block: `{ repoUrl, channel, pinnedVersion, localPath }`.
- `channel: "latest"` (default) — newest `main`
- `channel: "pinned"` — the tag in `pinnedVersion`
- `channel: "local"` — a local clone at `localPath` (harness development / offline)

If the manifest has no `update` block (a pre-fetch-on-demand install), that's fine — the installer
migrates it automatically on the first `--update`. Treat it as channel `latest`.

---

## Step 2 — Apply any channel change from `$ARGUMENTS`

If the user passed a channel flag, honor it — it re-points the install as part of this update:
- `--pin <version>` → channel becomes `pinned` at that version
- `--latest` → channel becomes `latest`
- `--local <path>` → channel becomes `local` at that path

Carry the flag through to the `--update` command in Step 5 (the installer persists it). Use the
**resulting** channel to materialize the source in Step 3.

---

## Step 3 — Materialize the harness source once

You need the installer (`install/install.js`) and the source tree to diff against. Obtain it **once**,
then reuse it for both check and update via `--source`.

- **channel `local`** → source dir = `localPath`. Verify `<localPath>/install/install.js` and
  `<localPath>/VERSION` exist. If not, tell the user their `localPath` is wrong and stop.
- **channel `latest`** → shallow-clone into a temp dir:
  ```bash
  git clone --depth 1 "<repoUrl>" "<tempDir>"
  ```
- **channel `pinned`** → shallow-clone the tag (try the version verbatim, then a `v`-prefixed form):
  ```bash
  git clone --depth 1 --branch "<pinnedVersion>" "<repoUrl>" "<tempDir>"
  ```

Use a temp dir under the system temp location (e.g. `mktemp -d`). If the clone fails (offline, bad
URL, or unknown tag), report the exact error and stop — nothing has been mutated.

**Remember the source dir** — you pass it as `--source` below and delete it (if it's a temp clone) in Step 7.

---

## Step 4 — Check for updates

Run the installer from the materialized source, reusing it via `--source`:

```bash
node "<sourceDir>/install/install.js" --check --project "<projectDir>" --source "<sourceDir>"
# or --global for global installs
```

Parse the JSON output. Handle `error` first if present (`no-manifest`, `invalid-manifest`,
`invalid-source`, `fetch-failed`) — narrate it and stop.

Otherwise narrate the result:
- **Version**: `<currentVersion>` → `<latestVersion>`  (channel: `<channel>`)
- **Update available**: `<updateAvailable>`
- **Drifted files** (if any): `<drifted.length>` installed file(s) differ from the source. List the first 10.
- **Changelog** (if any): show the excerpt
- **Orphaned files** (if any): list them

If `updateAvailable === false` **and** `drifted.length === 0`:
```
Your harness is up to date (v<version>).
```
Clean up the temp source (Step 7) and **stop** unless the user explicitly asks to re-apply.

If `drifted.length > 0` even when the version matches, there are source changes not yet installed.
Proceed to the human gate and show the drifted file count.

---

## Step 5 — Human gate

**NEVER mutate files before this step.** Show the user what will happen:

```
Ready to update claude-code-harness:
  Version:  <current> → <latest>
  Channel:  <channel>
  Target:   <target path>
  Drifted:  <count> file(s) differ from source
  Orphans:  <count> file(s) will be removed

Proceed? [y/N]
```

Wait for explicit confirmation. If denied, clean up the temp source (Step 7) and stop.

---

## Step 6 — Apply the update

Run the installer's `--update` mode against the same source, plus any channel flag from Step 2:

```bash
node "<sourceDir>/install/install.js" --update --project "<projectDir>" --source "<sourceDir>" --yes
# add --pin <version> / --latest / --local <path> if the user asked to change channel
# or --global for global installs
```

Narrate each step as it happens:
1. Snapshot created at `~/.claude/.harness-backups/<timestamp>/`
2. Files copied/updated
3. Orphans removed
4. Settings reconciled
5. Verification result
6. Manifest updated (version + update config)

---

## Step 6b — Check tracker configuration

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
   On answer, run (reusing the same source):
   ```bash
   node "<sourceDir>/install/install.js" --switch-tracker <choice> --project "<projectDir>"
   ```
3. If set but adapter scripts don't match (verify by checking script contents):
   ```
   Tracker is set to "<tracker>" but adapter scripts look like "<other>". Fixing...
   ```
   Run `--switch-tracker` to correct the scripts.

---

## Step 7 — Clean up and report

If you created a temp clone in Step 3, delete it now (channel `local` sources are never deleted).

Then report:

```
Update complete: v<old> → v<new>  (channel: <channel>)
Tracker: <tracker>

To restore the previous version:
  cp -r "<snapshot-path>/"* "<target>/"
```

If updating **both** targets, repeat steps 3-7 for the second target (each gets its own source fetch,
or reuse one temp clone if the channels match).

---

## Legacy Backfill

When no manifest exists (pre-manifest install), create one by reverse-detecting the install configuration.
You still need a source for this — materialize one per Step 3 using channel `latest` (or ask the user for
a `--local` path if they have a clone), and run:

```bash
node "<sourceDir>/install/install.js" --backfill --project "<projectDir>"
```

The backfill:
1. **Detects workflowPack** — enterprise-only agents present → `enterprise`, else `solo`.
2. **Detects tracker** — from the adapter scripts in `<target>/trackers/active/` (`az boards` → ado,
   `td ` → todoist, else github).
3. **Writes the manifest** — including a default `update` block (channel `latest`). No clone path is
   recorded; future updates fetch on demand.

Narrate the process:
```
You installed the harness before manifests were added.
I'll create one — future updates fetch the latest source automatically, no local clone needed.
```

After backfill, proceed with the normal update flow (Step 3 onwards). Then clean up the temp source.
