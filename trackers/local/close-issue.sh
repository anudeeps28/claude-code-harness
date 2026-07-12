#!/bin/bash
# close-issue.sh — Local tracker adapter
# Usage: bash .claude/trackers/active/close-issue.sh <ID> ["<reason>"]
# Closes the specified task. Optional reason defaults to "completed".

set -o pipefail

ISSUE_ID="${1:-}"
REASON="${2:-completed}"

if [ -z "$ISSUE_ID" ]; then
  echo '{"error": "Task ID required. Usage: close-issue.sh <ID> [\"<reason>\"]"}' >&2
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

# Check if already closed
current_state=$(grep -m1 '^state:' "$TASK_FILE" | sed 's/^state: *//')
if [ "$current_state" = "closed" ]; then
  echo "{\"error\": \"Task $ISSUE_ID is already closed.\"}" >&2
  exit 1
fi

CLOSED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Update frontmatter fields via temp file + mv (crash-safe)
TMP_FILE=$(mktemp)
trap 'rm -f "$TMP_FILE"' EXIT

sed \
  -e "s/^state: *open/state: closed/" \
  -e "s/^closed: *null/closed: $CLOSED_AT/" \
  -e "s/^close_reason: *null/close_reason: $REASON/" \
  "$TASK_FILE" > "$TMP_FILE"

mv "$TMP_FILE" "$TASK_FILE"

# Regenerate todo.md
RENDER_SCRIPT="$(dirname "$0")/../lib/render-todo.sh"
if [ -x "$RENDER_SCRIPT" ] || [ -f "$RENDER_SCRIPT" ]; then
  bash "$RENDER_SCRIPT" "$ISSUES_DIR" 2>/dev/null || true
fi

echo "Closed task #${ISSUE_ID}"
