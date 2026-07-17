#!/bin/bash
# create-sub-issue.sh — Local tracker adapter
# Usage: bash .claude/trackers/active/create-sub-issue.sh <PARENT_ID> "<title>" "<body>" ["<label>"]
# Creates a new task and links it as a child of the given parent.
# Returns JSON: {"parent": <id>, "child": <id>, "url": "<path>"}

set -o pipefail

PARENT_ID="${1:-}"
TITLE="${2:-}"
BODY="${3:-}"
LABEL="${4:-}"

if [ -z "$PARENT_ID" ] || [ -z "$TITLE" ]; then
  echo '{"error": "Usage: create-sub-issue.sh <PARENT_ID> \"<title>\" \"<body>\" [\"<label>\"]"}' >&2
  exit 1
fi

source "$(dirname "$0")/../lib/retry.sh"
source "$(dirname "$0")/../lib/auth-check.sh"
check_auth_local

ISSUES_DIR="${LOCAL_ISSUES_DIR:-tasks/issues}"
PARENT_FILE="$ISSUES_DIR/${PARENT_ID}.md"

if [ ! -f "$PARENT_FILE" ]; then
  echo "{\"error\": \"Parent task $PARENT_ID not found at $PARENT_FILE\"}" >&2
  exit 1
fi

# Create the child via the sibling create script, then set its parent field
CREATE_OUTPUT=$(bash "$(dirname "$0")/create-issue.sh" "$TITLE" "$BODY" "$LABEL")
if [ $? -ne 0 ] || [ -z "$CREATE_OUTPUT" ]; then
  echo '{"error": "Failed to create child task"}' >&2
  exit 1
fi

CHILD_ID=$(echo "$CREATE_OUTPUT" | awk '{print $1}')
CHILD_FILE=$(echo "$CREATE_OUTPUT" | awk '{print $2}')

TMP_FILE=$(mktemp)
trap 'rm -f "$TMP_FILE"' EXIT

sed "s/^parent: .*/parent: ${PARENT_ID}/" "$CHILD_FILE" > "$TMP_FILE"
mv "$TMP_FILE" "$CHILD_FILE"

# Regenerate todo.md (create-issue already ran it, but parent linkage changed)
RENDER_SCRIPT="$(dirname "$0")/../lib/render-todo.sh"
if [ -x "$RENDER_SCRIPT" ] || [ -f "$RENDER_SCRIPT" ]; then
  bash "$RENDER_SCRIPT" "$ISSUES_DIR" 2>/dev/null || true
fi

echo "{\"parent\": ${PARENT_ID}, \"child\": ${CHILD_ID}, \"url\": \"${CHILD_FILE}\"}"
