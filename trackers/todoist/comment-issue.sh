#!/bin/bash
# comment-issue.sh — Todoist adapter
# Usage: bash .claude/trackers/active/comment-issue.sh <TASK_ID> "<text>"
# Adds a comment to the specified task.

set -o pipefail

TASK_ID="${1:-}"
TEXT="${2:-}"

if [ -z "$TASK_ID" ] || [ -z "$TEXT" ]; then
  echo '{"error": "Usage: comment-issue.sh <TASK_ID> \"<text>\""}' >&2
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

with_retry "$TD" comment add "id:${TASK_ID}" --content "$TEXT" >/dev/null

if [ $? -ne 0 ]; then
  echo '{"error": "Failed to comment on task"}' >&2
  exit 1
fi

echo "Commented on task #${TASK_ID}"
