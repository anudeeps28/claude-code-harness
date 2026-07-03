#!/bin/bash
# get-issue-children.sh — Todoist adapter
# Usage: bash .claude/trackers/active/get-issue-children.sh <TASK_ID>
# Lists sub-tasks of the given parent task.
# Output: markdown-formatted list of children.

set -o pipefail

TASK_ID=$1

if [ -z "$TASK_ID" ]; then
  echo '{"error": "Task ID required. Usage: get-issue-children.sh <TASK_ID>"}' >&2
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

CHILDREN=$(with_retry "$TD" task list --parent "$TASK_ID" --json)

TOTAL=$(echo "$CHILDREN" | jq 'length' 2>/dev/null)

if [ "$TOTAL" -gt 0 ] 2>/dev/null; then
  echo "# Sub-tasks for Task $TASK_ID"
  echo ""
  echo "$CHILDREN" | jq -r '.[] |
    "- [" + (if .is_completed then "x" else " " end) + "] " + (.id|tostring) + " " + .content + " (" + (if .is_completed then "CLOSED" else "OPEN" end) + ")"'
  echo ""
  OPEN=$(echo "$CHILDREN" | jq '[.[] | select(.is_completed == false)] | length')
  CLOSED=$(echo "$CHILDREN" | jq '[.[] | select(.is_completed == true)] | length')
  echo "_Progress: $CLOSED/$TOTAL complete ($OPEN open)_"
else
  echo "# Sub-tasks for Task $TASK_ID"
  echo ""
  echo "_No sub-tasks found._"
fi
