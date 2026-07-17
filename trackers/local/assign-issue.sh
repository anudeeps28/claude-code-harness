#!/bin/bash
# assign-issue.sh — Local tracker adapter
# Usage: bash .claude/trackers/active/assign-issue.sh <ID> ["<assignee>"]
# Sets the assignee on the specified task's frontmatter (claims it).
# Assignee defaults to the local git user name, then $USER.

set -o pipefail

ISSUE_ID="${1:-}"
ASSIGNEE="${2:-}"

if [ -z "$ISSUE_ID" ]; then
  echo '{"error": "Task ID required. Usage: assign-issue.sh <ID> [\"<assignee>\"]"}' >&2
  exit 1
fi

source "$(dirname "$0")/../lib/retry.sh"
source "$(dirname "$0")/../lib/auth-check.sh"
check_auth_local

if [ -z "$ASSIGNEE" ]; then
  ASSIGNEE=$(git config user.name 2>/dev/null)
  [ -z "$ASSIGNEE" ] && ASSIGNEE="${USER:-me}"
fi

ISSUES_DIR="${LOCAL_ISSUES_DIR:-tasks/issues}"
TASK_FILE="$ISSUES_DIR/${ISSUE_ID}.md"

if [ ! -f "$TASK_FILE" ]; then
  echo "{\"error\": \"Task $ISSUE_ID not found at $TASK_FILE\"}" >&2
  exit 1
fi

TMP_FILE=$(mktemp)
trap 'rm -f "$TMP_FILE"' EXIT

if grep -q '^assignee:' "$TASK_FILE"; then
  sed "s/^assignee: .*/assignee: ${ASSIGNEE}/" "$TASK_FILE" > "$TMP_FILE"
else
  # Older task files lack the field — insert it after the state line
  awk -v a="$ASSIGNEE" '{ print } /^state:/ && !done { print "assignee: " a; done=1 }' \
    "$TASK_FILE" > "$TMP_FILE"
fi

mv "$TMP_FILE" "$TASK_FILE"

# Regenerate todo.md
RENDER_SCRIPT="$(dirname "$0")/../lib/render-todo.sh"
if [ -x "$RENDER_SCRIPT" ] || [ -f "$RENDER_SCRIPT" ]; then
  bash "$RENDER_SCRIPT" "$ISSUES_DIR" 2>/dev/null || true
fi

echo "Assigned task #${ISSUE_ID} to ${ASSIGNEE}"
