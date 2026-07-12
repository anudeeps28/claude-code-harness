#!/bin/bash
# list-issues.sh — Todoist adapter
# Usage: bash .claude/trackers/active/list-issues.sh
# Returns all open tasks in the configured project as a JSON array.
# Output: JSON array [{id, title, state, labels, assignees, url}]

TODOIST_PROJECT="YOUR_TODOIST_PROJECT"

# Source shared libraries
source "$(dirname "$0")/../lib/retry.sh"
source "$(dirname "$0")/../lib/auth-check.sh"
check_auth_todoist

td="${TODOIST_CLI:-td}"

if [[ "$TODOIST_PROJECT" == "YOUR_TODOIST_PROJECT" ]]; then
  # No project configured — list all open tasks
  RESULT=$(with_retry "$td" task list --json)
else
  RESULT=$(with_retry "$td" task list --project "$TODOIST_PROJECT" --json)
fi

if [ $? -ne 0 ]; then
  echo '{"error": "Failed to list tasks from Todoist"}' >&2
  exit 1
fi

echo "$RESULT" | jq '[.[] | {id: .id, title: .content, state: "open", labels: .labels, assignees: [], url: .url}]'
