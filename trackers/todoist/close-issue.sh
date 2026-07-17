#!/bin/bash
# close-issue.sh — Todoist adapter
# Usage: bash .claude/trackers/active/close-issue.sh <TASK_ID> ["<reason>"]
# Completes the specified task (td has no "close"; complete is the verb).
# If a reason is given, it is recorded as a comment first.

set -o pipefail

TASK_ID="${1:-}"
REASON="${2:-}"

if [ -z "$TASK_ID" ]; then
  echo '{"error": "Usage: close-issue.sh <TASK_ID> [\"<reason>\"]"}' >&2
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

if [ -n "$REASON" ] && [ "$REASON" != "completed" ]; then
  with_retry "$TD" comment add "id:${TASK_ID}" --content "Closed: $REASON" >/dev/null 2>&1 || true
fi

with_retry "$TD" task complete "id:${TASK_ID}" >/dev/null

if [ $? -ne 0 ]; then
  echo '{"error": "Failed to complete task"}' >&2
  exit 1
fi

echo "Completed task ${TASK_ID}"
