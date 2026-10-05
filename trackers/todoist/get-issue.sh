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
source "$(dirname "$0")/../lib/item-type.sh"
source "$(dirname "$0")/../lib/status.sh"
check_auth_todoist

# --full: td 1.75 includes `checked` and `completedAt` only in the full field set.
RAW=$(with_retry "$TD" task view "$TASK_ID" --json --full)

if [ -z "$RAW" ]; then
  echo '{"error": "Task not found or empty response"}' >&2
  exit 1
fi

# --- completion state ---
# td 1.75 reports it directly: `checked` is true for a completed task. Use that whenever it is there.
# The F2 Demo against a real account showed the old list-based check (below) reading open tasks as
# CLOSED, an open blocker among them, which would have let /implement build past it.
CHECKED=$(echo "$RAW" | jq -r 'if has("checked") then (.checked | tostring) else "unknown" end' | tr -d '\r')

# Fallback for an older td (v1.74) whose `task view` carries no completion flag: a task present in
# `task view` but ABSENT from the active task list is completed. Scoped to the configured project
# like list-issues.sh; a task in another project is misjudged as CLOSED, which is why this is only the
# fallback.
TODOIST_PROJECT=""
if [ -f "tasks/tracker-config.md" ]; then
  _proj=$(grep -i "todoist_project[[:space:]]*=" tasks/tracker-config.md | sed 's/.*=[[:space:]]*//; s/[[:space:]]*$//' | tr -d '\r')
  [ -n "$_proj" ] && [ "$_proj" != "YOUR_TODOIST_PROJECT" ] && TODOIST_PROJECT="$_proj"
fi

# `.results?` tolerates both td shapes: an object {results:[...]} and a bare
# array (the `?` suppresses the array-index error so the `// .` fallback wins).
if [ "$CHECKED" = "false" ]; then
  STATE="OPEN"
elif [ "$CHECKED" = "true" ]; then
  STATE="CLOSED"
else
  # tr -d '\r': jq on Windows ends lines with CRLF, which made grep -x miss every id.
  if [ -n "$TODOIST_PROJECT" ]; then
    ACTIVE_IDS=$(with_retry "$TD" task list --project "$TODOIST_PROJECT" --all --json | jq -r '(.results? // .)[].id | tostring' | tr -d '\r')
  else
    ACTIVE_IDS=$(with_retry "$TD" task list --all --json | jq -r '(.results? // .)[].id | tostring' | tr -d '\r')
  fi
  if echo "$ACTIVE_IDS" | grep -qx "$TASK_ID"; then
    STATE="OPEN"
  else
    STATE="CLOSED"
  fi
fi

# Field names are camelCase in td v1.74 (.sectionId / .projectId); these render
# ids, not names — matching prior behavior.
# Type (#32): a type:<x> label, else a bug label, else Unknown. Status (#30): a status:<s> label.
echo "$RAW" | jq -r --arg state "$STATE" "${ITEM_TYPE_JQ}${STATUS_JQ}"'
  "# Task " + (.id|tostring) + ": " + .content,
  "",
  "**Type:** " + ((.labels // []) | type_from_labels),
  "**State:** " + $state,
  "**Status:** " + ((.labels // []) | status_from_labels),
  "**Priority:** " + (if .priority == 4 then "p1" elif .priority == 3 then "p2" elif .priority == 2 then "p3" else "p4" end),
  "**Labels:** " + (if (.labels | length) > 0 then (.labels | join(", ")) else "None" end),
  "**Section:** " + (.sectionId // "None" | tostring),
  "**Project:** " + (.projectId // "None" | tostring),
  "",
  "## Description",
  (.description // "_No description_")
'
