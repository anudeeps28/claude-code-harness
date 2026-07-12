#!/bin/bash
# add-label.sh — Local tracker adapter
# Usage: bash .claude/trackers/active/add-label.sh <ID> "<label>"
# Adds a label to the specified task's frontmatter.

set -o pipefail

ISSUE_ID="${1:-}"
LABEL="${2:-}"

if [ -z "$ISSUE_ID" ] || [ -z "$LABEL" ]; then
  echo '{"error": "Usage: add-label.sh <ID> \"<label>\""}' >&2
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

# Read current labels
current_labels=$(grep -m1 '^labels:' "$TASK_FILE" | sed 's/^labels: *//')

# Strip brackets and split
inner=$(echo "$current_labels" | sed 's/\[//;s/\]//')

# Check if label already exists
if echo "$inner" | grep -qw "$LABEL"; then
  echo "Label '$LABEL' already exists on task #${ISSUE_ID}"
  exit 0
fi

# Append new label
if [ -z "$inner" ]; then
  new_labels="[$LABEL]"
else
  new_labels="[${inner}, ${LABEL}]"
fi

# Update file via temp + mv
TMP_FILE=$(mktemp)
trap 'rm -f "$TMP_FILE"' EXIT

sed "s/^labels: .*/labels: ${new_labels}/" "$TASK_FILE" > "$TMP_FILE"
mv "$TMP_FILE" "$TASK_FILE"

# Regenerate todo.md
RENDER_SCRIPT="$(dirname "$0")/../lib/render-todo.sh"
if [ -x "$RENDER_SCRIPT" ] || [ -f "$RENDER_SCRIPT" ]; then
  bash "$RENDER_SCRIPT" "$ISSUES_DIR" 2>/dev/null || true
fi

echo "Added label '$LABEL' to task #${ISSUE_ID}"
