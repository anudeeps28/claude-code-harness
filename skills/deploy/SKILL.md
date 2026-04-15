---
name: deploy
description: Deploy to cloud and verify — branch-test before merge, or post-merge production verification. Use when deploying, verifying a deployment, re-ingesting data, or running smoke tests. Usage: /deploy [branch-test|post-merge|re-ingest|smoke-test]
---

**Core Philosophy:** Deploy, verify, and smoke test in the right order — every gate prevents the mistakes we've made before.

**Triggers:** "deploy", "deploy to test", "verify deployment", "run smoke tests", "test live", "redeploy"

---

# Deploy & Verify Skill

You are running the YOUR_PROJECT_NAME deployment workflow. This skill prevents common deployment mistakes: forgetting to restart the API, testing against cached results, deploying to the wrong resource.

## Usage

```
/deploy                    — interactive mode, asks what to do
/deploy branch-test        — build from current branch, deploy to staging, test
/deploy post-merge         — verify pipeline deployed, verify, test
/deploy re-ingest          — just re-ingest data + test (no build/deploy)
/deploy smoke-test         — just run smoke test queries (no build/deploy/ingest)
```

---

## Cloud Resources Reference

Read the resource names from `YOUR_PROJECT_ROOT/tasks/tracker-config.md`. That file has the authoritative list of:
- Container registry, app service, function app, container app names
- Search service URL and index name
- Storage account and container name
- Resource group
- API endpoints per environment (dev, staging, prod)
- Webhook URLs

**Do NOT hardcode resource names in this skill.** Always read from `tracker-config.md`.

---

## Mode: `branch-test`

Use this to test code from your branch BEFORE merging. Deploys to staging/branch-test resources (separate from production).

### Step 1 — Pre-flight checks

```bash
cd YOUR_PROJECT_ROOT && git branch --show-current && git status --short
```

Report the branch name. If there are uncommitted changes, warn YOUR_NAME.

Then run build + tests. **Read the "Build & Test Commands" section from `YOUR_PROJECT_ROOT/tasks/tracker-config.md`** for the exact commands. If that section is empty or the file doesn't exist, ask YOUR_NAME what the build and test commands are — do NOT guess or hardcode.

```bash
# Example — replace with the actual commands from tracker-config.md:
<build_command> 2>&1 | tail -5
<unit_test_command> 2>&1 | tail -15
```

If build or tests fail: **STOP. Do not proceed.**

Say: **"Pre-flight: Branch `<name>`, build OK, N/N tests pass. Ready to build and deploy. Which components? (list options based on tracker-config.md)"**

Wait for answer.

### Step 2 — Build container images

Read `tracker-config.md` for the container registry name. Determine the next version tag from existing tags.

Build using `az acr build` (or your CI system). **ALWAYS use `run_in_background: true`** for container builds — they take minutes.

If build fails: read the output, diagnose, and report. Do NOT retry more than 3 times.

### Step 3 — Deploy to staging

Update the container app(s) with the new image. Resource names come from `tracker-config.md`.

**IMPORTANT:** If your architecture has both a Function App and a Container App that could race, stop the Function App during branch-test mode.

Verify the image was updated.

Then proceed to **Re-ingest** (Step 4).

---

## Mode: `post-merge`

Use this after a PR merges to the main branch. The CI/CD pipeline auto-triggers deployment.

### Step 1 — Verify pipeline deployed

Check that app services and function apps are running. Resource names from `tracker-config.md`.

If any are not Running, warn YOUR_NAME and ask if the pipeline has finished.

Then proceed to **Re-ingest** (Step 4).

---

## Step 4 — Re-ingest Data

**GATE 1:** Say exactly:

> **Ready to re-ingest data. This will:**
> 1. Delete existing indexed data for the selected items
> 2. Upload source files to trigger reprocessing
>
> **Which items?**
> - `all` — re-ingest everything
> - `<identifier>` — re-ingest a specific item
> - `skip` — skip re-ingestion, go straight to smoke tests
>
> **Say which option.**

Wait for answer. Do NOT proceed without confirmation.

### Step 4a — Get credentials

Read the search/storage API keys from your app settings or Key Vault. Use `tracker-config.md` for resource names.

### Step 4b — Delete old indexed data

Delete existing chunks/records from the search index for the selected items. Also clean up source database records if needed to prevent content-hash deduplication from blocking re-ingestion.

If SQL cleanup is needed, tell YOUR_NAME what to run and wait for confirmation.

### Step 4c — Upload source files

Upload files to blob storage (or your ingestion trigger). For single items or all items.

### Step 4d — Wait and verify

Wait 2-3 minutes, then check the index for new data.

If no data after 3 minutes: check function/container logs. Apply the 3-attempt rule.

Report: **"Re-ingestion complete. X items indexed. Y documents processed."**

---

## Step 5 — Restart API

**GATE 2:** Say: **"Ready to restart the API to clear cache. Proceed?"**

Wait for confirmation. Restart using the appropriate command for your deployment type (Container App or App Service). Resource names from `tracker-config.md`.

---

## Step 6 — Smoke Tests

Read the smoke test queries from `YOUR_PROJECT_ROOT/tasks/tracker-config.md` (the "Smoke test queries" section).

Run each query against the appropriate API endpoint:
- Branch-test: use the staging/container app URL from `tracker-config.md`
- Post-merge: use the production URL from `tracker-config.md`

Present a summary table:

| # | Question | Expected | Actual | Pass? |
|---|---|---|---|---|
| 1 | ... | ... | ... | Y/N |

Say: **"Smoke tests: X/N passed. [Details on any failures]."**

---

## Hard Rules

- NEVER delete indexed data without GATE 1 confirmation
- NEVER restart API without GATE 2 confirmation
- ALWAYS read resource names from `tracker-config.md` — never hardcode them
- ALWAYS use `run_in_background: true` for container builds
- 3-attempt rule applies to all steps — if something fails 3 times, stop and discuss
- ONE step at a time — explain what you're about to do, then do it, then report
