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

echo "$RAW" | jq -r '
  "# Task " + (.id|tostring) + ": " + .content,
  "",
  "**State:** " + (if .is_completed then "CLOSED" else "OPEN" end),
  "**Priority:** " + (if .priority == 4 then "p1" elif .priority == 3 then "p2" elif .priority == 2 then "p3" else "p4" end),
  "**Labels:** " + (if (.labels | length) > 0 then (.labels | join(", ")) else "None" end),
  "**Section:** " + (.section_id // "None" | tostring),
  "**Project:** " + (.project_id // "None" | tostring),
  "",
  "## Description",
  (.description // "_No description_")
'
