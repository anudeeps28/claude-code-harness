#!/bin/bash
# comment-issue.sh — Local tracker adapter
# Usage: bash .claude/trackers/active/comment-issue.sh <ID> "<text>"
# Appends a timestamped comment to the task file body.

set -o pipefail

ISSUE_ID="${1:-}"
TEXT="${2:-}"

if [ -z "$ISSUE_ID" ] || [ -z "$TEXT" ]; then
  echo '{"error": "Usage: comment-issue.sh <ID> \"<text>\""}' >&2
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

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

printf '\n**Comment (%s):** %s\n' "$TIMESTAMP" "$TEXT" >> "$TASK_FILE"

# Regenerate todo.md
RENDER_SCRIPT="$(dirname "$0")/../lib/render-todo.sh"
if [ -x "$RENDER_SCRIPT" ] || [ -f "$RENDER_SCRIPT" ]; then
  bash "$RENDER_SCRIPT" "$ISSUES_DIR" 2>/dev/null || true
fi

echo "Commented on task #${ISSUE_ID}"
