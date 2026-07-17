#!/bin/bash
# get-blockers.sh — Local tracker adapter
# Usage: bash .claude/trackers/active/get-blockers.sh <ID>
# Prints the IDs of tasks blocking <ID> as a JSON array, e.g. [12, 14].
# Tasks with no blockers print [].

set -o pipefail

ISSUE_ID="${1:-}"

if [ -z "$ISSUE_ID" ]; then
  echo '{"error": "Task ID required. Usage: get-blockers.sh <ID>"}' >&2
  exit 1
fi

source "$(dirname "$0")/../lib/retry.sh"
source "$(dirname "$0")/../lib/auth-check.sh"
check_auth_local

ISSUES_DIR="${LOCAL_ISSUES_DIR:-tasks/issues}"
TASK_FILE="$ISSUES_DIR/${ISSUE_ID}.md"

if [ ! -f "$TASK_FILE" ]; then
  echo "{\"error\": \"Task $ISSUE_ID not found at $TASK_FILE\"}" >&2
  exit 1
fi

inner=$(grep -m1 '^blocked_by:' "$TASK_FILE" | sed 's/^blocked_by: *//;s/\[//;s/\]//')

if [ -z "$inner" ]; then
  echo "[]"
else
  echo "[${inner}]"
fi
