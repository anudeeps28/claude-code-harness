#!/bin/bash
# get-issue.sh — Todoist adapter
# Usage: bash .claude/trackers/active/get-issue.sh <TASK_ID>
# Returns full details of a single task: title, description, labels, priority, state.

set -o pipefail

TASK_ID=$1

if [ -z "$TASK_ID" ]; then
  echo '{"error": "Task ID required. Usage: get-issue.sh <TASK_ID>"}' >&2
  exit 1
fi

TD="${TODOIST_CLI:-td}"

if ! command -v "$TD" &>/dev/null; then
  echo '{"error": "Todoist CLI (td) not found. Install it or set TODOIST_CLI."}' >&2
  exit 1
fi

source "$(dirname "$0")/../lib/retry.sh"
source "$(dirname "$0")/../lib/auth-check.sh"
check_auth_todoist

RAW=$(with_retry "$TD" task view "$TASK_ID" --json)

if [ -z "$RAW" ]; then
  echo '{"error": "Task not found or empty response"}' >&2
  exit 1
fi

# --- derive completion state (td v1.74) ---
# `td task view --json` returns a task whether it is active or completed, and
# carries NO completion flag (no is_completed/checked/completed_at). So derive
# state the way list-issues.sh trusts it: a task present in `task view` but
# ABSENT from the active task list is completed. `td task list` returns only
# non-completed tasks — which is why list-issues.sh hardcodes state:"open".
#
# Read the configured project exactly like list-issues.sh does, so the active
# query is scoped identically.
# Edge case: a task in a DIFFERENT project than the configured one would be
# misjudged as CLOSED. Acceptable for this harness's single-project setup.
# TODO: prefer a global active-task query if a future td exposes one.
TODOIST_PROJECT=""
if [ -f "tasks/tracker-config.md" ]; then
  _proj=$(grep -i "todoist_project[[:space:]]*=" tasks/tracker-config.md | sed 's/.*=[[:space:]]*//; s/[[:space:]]*$//' | tr -d '\r')
  [ -n "$_proj" ] && [ "$_proj" != "YOUR_TODOIST_PROJECT" ] && TODOIST_PROJECT="$_proj"
fi

# `.results?` tolerates both td shapes: an object {results:[...]} and a bare
# array (the `?` suppresses the array-index error so the `// .` fallback wins).
if [ -n "$TODOIST_PROJECT" ]; then
  ACTIVE_IDS=$(with_retry "$TD" task list --project "$TODOIST_PROJECT" --json | jq -r '(.results? // .)[].id | tostring')
else
  ACTIVE_IDS=$(with_retry "$TD" task list --json | jq -r '(.results? // .)[].id | tostring')
fi

if echo "$ACTIVE_IDS" | grep -qx "$TASK_ID"; then
  STATE="OPEN"
else
  STATE="CLOSED"
fi

# Field names are camelCase in td v1.74 (.sectionId / .projectId); these render
# ids, not names — matching prior behavior.
echo "$RAW" | jq -r --arg state "$STATE" '
  "# Task " + (.id|tostring) + ": " + .content,
  "",
  "**State:** " + $state,
  "**Priority:** " + (if .priority == 4 then "p1" elif .priority == 3 then "p2" elif .priority == 2 then "p3" else "p4" end),
  "**Labels:** " + (if (.labels | length) > 0 then (.labels | join(", ")) else "None" end),
  "**Section:** " + (.sectionId // "None" | tostring),
  "**Project:** " + (.projectId // "None" | tostring),
  "",
  "## Description",
  (.description // "_No description_")
'
