#!/bin/bash
# add-blocker.sh — Local tracker adapter
# Usage: bash .claude/trackers/active/add-blocker.sh <ID> <BLOCKER_ID>
# Records that task <ID> is blocked by task <BLOCKER_ID> in the
# blocked_by frontmatter list.

set -o pipefail

ISSUE_ID="${1:-}"
BLOCKER_ID="${2:-}"

if [ -z "$ISSUE_ID" ] || [ -z "$BLOCKER_ID" ]; then
  echo '{"error": "Usage: add-blocker.sh <ID> <BLOCKER_ID>"}' >&2
  exit 1
fi

source "$(dirname "$0")/../lib/retry.sh"
source "$(dirname "$0")/../lib/auth-check.sh"
check_auth_local

ISSUES_DIR="${LOCAL_ISSUES_DIR:-tasks/issues}"
TASK_FILE="$ISSUES_DIR/${ISSUE_ID}.md"
BLOCKER_FILE="$ISSUES_DIR/${BLOCKER_ID}.md"

if [ ! -f "$TASK_FILE" ]; then
  echo "{\"error\": \"Task $ISSUE_ID not found at $TASK_FILE\"}" >&2
  exit 1
fi

if [ ! -f "$BLOCKER_FILE" ]; then
  echo "{\"error\": \"Blocker task $BLOCKER_ID not found at $BLOCKER_FILE\"}" >&2
  exit 1
fi

# Read current blockers list
current=$(grep -m1 '^blocked_by:' "$TASK_FILE" | sed 's/^blocked_by: *//')
inner=$(echo "$current" | sed 's/\[//;s/\]//')

if echo "$inner" | grep -qw "$BLOCKER_ID"; then
  echo "Task #${ISSUE_ID} is already blocked by #${BLOCKER_ID}"
  exit 0
fi

if [ -z "$inner" ]; then
  new_list="[$BLOCKER_ID]"
else
  new_list="[${inner}, ${BLOCKER_ID}]"
fi

TMP_FILE=$(mktemp)
trap 'rm -f "$TMP_FILE"' EXIT

if grep -q '^blocked_by:' "$TASK_FILE"; then
  sed "s/^blocked_by: .*/blocked_by: ${new_list}/" "$TASK_FILE" > "$TMP_FILE"
else
  # Older task files lack the field — insert it after the parent line
  awk -v l="$new_list" '{ print } /^parent:/ && !done { print "blocked_by: " l; done=1 }' \
    "$TASK_FILE" > "$TMP_FILE"
fi

mv "$TMP_FILE" "$TASK_FILE"

# Regenerate todo.md
RENDER_SCRIPT="$(dirname "$0")/../lib/render-todo.sh"
if [ -x "$RENDER_SCRIPT" ] || [ -f "$RENDER_SCRIPT" ]; then
  bash "$RENDER_SCRIPT" "$ISSUES_DIR" 2>/dev/null || true
fi

echo "Task #${ISSUE_ID} is now blocked by #${BLOCKER_ID}"
