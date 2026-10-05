#!/bin/bash
# set-status.sh — Todoist adapter
# Usage: bash .claude/trackers/active/set-status.sh <TASK_ID> <in-progress|in-review|needs-person|done>
# Records the harness status (#30) as a `status:<s>` label. td's --labels replaces the whole list,
# so the current labels are read, every other status:* label dropped, and the new one appended.
# `done` does not complete the task: completing stays with close-issue.sh.

set -o pipefail

TASK_ID="${1:-}"
STATUS="${2:-}"

if [ -z "$TASK_ID" ] || [ -z "$STATUS" ]; then
  echo '{"error": "Usage: set-status.sh <TASK_ID> <in-progress|in-review|needs-person|done>"}' >&2
  exit 1
fi

TD="${TODOIST_CLI:-td}"

if ! command -v "$TD" &>/dev/null; then
  echo '{"error": "Todoist CLI (td) not found. Install it or set TODOIST_CLI."}' >&2
  exit 1
fi

source "$(dirname "$0")/../lib/retry.sh"
source "$(dirname "$0")/../lib/auth-check.sh"
source "$(dirname "$0")/../lib/status.sh"

require_status "$STATUS" || exit 1
check_auth_todoist

TASK_JSON=$(with_retry "$TD" task view "id:${TASK_ID}" --json)
if [ -z "$TASK_JSON" ]; then
  echo '{"error": "Failed to fetch task"}' >&2
  exit 1
fi

NEW_LABELS=$(echo "$TASK_JSON" | jq -r --arg s "status:$STATUS" \
  '[(.labels // [])[] | select(startswith("status:") | not)] + [$s] | join(",")')

if ! with_retry "$TD" task update "id:${TASK_ID}" --labels "$NEW_LABELS" >/dev/null; then
  echo "{\"error\": \"Failed to set status:$STATUS on task $TASK_ID\"}" >&2
  exit 1
fi

echo "Task ${TASK_ID} status: ${STATUS}"
