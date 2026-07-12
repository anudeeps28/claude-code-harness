#!/bin/bash
# get-issue-children.sh — Local tracker adapter
# Usage: bash .claude/trackers/active/get-issue-children.sh <ID>
# Scans tasks/issues/ for tasks whose parent field matches <ID>.
# Output: markdown-formatted list of children.

set -o pipefail

ISSUE_ID="${1:-}"

if [ -z "$ISSUE_ID" ]; then
  echo '{"error": "Task ID required. Usage: get-issue-children.sh <ID>"}' >&2
  exit 1
fi

source "$(dirname "$0")/../lib/retry.sh"
source "$(dirname "$0")/../lib/auth-check.sh"
check_auth_local

ISSUES_DIR="${LOCAL_ISSUES_DIR:-tasks/issues}"

# Verify parent task exists
PARENT_FILE="$ISSUES_DIR/${ISSUE_ID}.md"
if [ ! -f "$PARENT_FILE" ]; then
  echo "{\"error\": \"Task $ISSUE_ID not found at $PARENT_FILE\"}" >&2
  exit 1
fi

echo "# Child Tasks for Task #${ISSUE_ID}"
echo ""

children_found=0
open_count=0
closed_count=0

for f in "$ISSUES_DIR"/*.md; do
  [ -f "$f" ] || continue
  parent_val=$(grep -m1 '^parent:' "$f" | sed 's/^parent: *//')
  if [ "$parent_val" = "$ISSUE_ID" ]; then
    child_id=$(basename "$f" .md)
    child_title=$(grep -m1 '^title:' "$f" | sed 's/^title: *//')
    child_state=$(grep -m1 '^state:' "$f" | sed 's/^state: *//')

    if [ "$child_state" = "closed" ]; then
      marker="x"
      closed_count=$((closed_count + 1))
    else
      marker=" "
      open_count=$((open_count + 1))
    fi

    display_state=$(echo "$child_state" | tr '[:lower:]' '[:upper:]')
    echo "- [$marker] #${child_id} ${child_title} (${display_state})"
    children_found=$((children_found + 1))
  fi
done

if [ $children_found -eq 0 ]; then
  echo "_No child tasks found for task #${ISSUE_ID}._"
else
  echo ""
  total=$((open_count + closed_count))
  echo "_Progress: ${closed_count}/${total} complete (${open_count} open)_"
fi
