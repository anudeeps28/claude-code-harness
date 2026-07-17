#!/bin/bash
# assign-issue.sh — Todoist adapter
# Usage: bash .claude/trackers/active/assign-issue.sh <TASK_ID> ["<assignee>"]
# Claims the task. Personal Todoist projects have no assignees, so the claim
# is recorded as a "claimed" label (visible in list-issues.sh labels output).
# td's --labels REPLACES the label set, so this reads current labels first.

set -o pipefail

TASK_ID="${1:-}"

if [ -z "$TASK_ID" ]; then
  echo '{"error": "Usage: assign-issue.sh <TASK_ID> [\"<assignee>\"]"}' >&2
  exit 1
fi

TD="${TODOIST_CLI:-td}"

if ! command -v "$TD" &>/dev/null; then
  echo '{"error": "Todoist CLI (td) not found. Install it or set TODOIST_CLI."}' >&2
  exit 1
fi

if ! command -v jq &>/dev/null; then
  echo '{"error": "jq is required. Install from https://jqlang.github.io/jq/download/"}' >&2
  exit 1
fi

source "$(dirname "$0")/../lib/retry.sh"
source "$(dirname "$0")/../lib/auth-check.sh"
check_auth_todoist

TASK_JSON=$(with_retry "$TD" task view "id:${TASK_ID}" --json)

if [ -z "$TASK_JSON" ]; then
  echo '{"error": "Failed to fetch task"}' >&2
  exit 1
fi

if echo "$TASK_JSON" | jq -e '.labels // [] | index("claimed")' >/dev/null; then
  echo "Task #${TASK_ID} is already claimed"
  exit 0
fi

current=$(echo "$TASK_JSON" | jq -r '.labels // [] | join(",")')
if [ -z "$current" ]; then
  new_labels="claimed"
else
  new_labels="${current},claimed"
fi

with_retry "$TD" task update "id:${TASK_ID}" --labels "$new_labels" >/dev/null

if [ $? -ne 0 ]; then
  echo '{"error": "Failed to claim task"}' >&2
  exit 1
fi

echo "Assigned task #${TASK_ID} (claimed label added)"
