#!/bin/bash
# add-blocker.sh — Todoist adapter
# Usage: bash .claude/trackers/active/add-blocker.sh <TASK_ID> <BLOCKER_ID>
# Records that <TASK_ID> is blocked by <BLOCKER_ID> via a "Blocked by:"
# line in the task description (Todoist has no native dependency links;
# the line is read back by get-blockers.sh).

set -o pipefail

TASK_ID="${1:-}"
BLOCKER_ID="${2:-}"

if [ -z "$TASK_ID" ] || [ -z "$BLOCKER_ID" ]; then
  echo '{"error": "Usage: add-blocker.sh <TASK_ID> <BLOCKER_ID>"}' >&2
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

DESCRIPTION=$(echo "$TASK_JSON" | jq -r '.description // ""')

# Already recorded?
# Todoist task IDs are alphanumeric
existing=$(echo "$DESCRIPTION" | grep -m1 '^Blocked by:' | grep -o '#[A-Za-z0-9]*' | tr -d '#')
if echo "$existing" | grep -qw "$BLOCKER_ID"; then
  echo "Task #${TASK_ID} is already blocked by #${BLOCKER_ID}"
  exit 0
fi

if echo "$DESCRIPTION" | grep -q '^Blocked by:'; then
  NEW_DESCRIPTION=$(echo "$DESCRIPTION" | sed "s/^Blocked by:.*/&, #${BLOCKER_ID}/")
else
  if [ -z "$DESCRIPTION" ]; then
    NEW_DESCRIPTION="Blocked by: #${BLOCKER_ID}"
  else
    NEW_DESCRIPTION=$(printf '%s\n\nBlocked by: #%s' "$DESCRIPTION" "$BLOCKER_ID")
  fi
fi

with_retry "$TD" task update "id:${TASK_ID}" --description "$NEW_DESCRIPTION" >/dev/null

if [ $? -ne 0 ]; then
  echo '{"error": "Failed to update task description"}' >&2
  exit 1
fi

echo "Task #${TASK_ID} is now blocked by #${BLOCKER_ID}"
