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
# Rebuild is suppressed here and done once below, after the parent link is written (#66).
# The child's type is its own decision (#8): TRACKER_ITEM_TYPE if the caller set it for this call,
# else Task, as on ADO. LOCAL_ISSUE_TYPE is deliberately cleared: a caller that exported it for the
# parent would otherwise stamp every child with the parent's type.
CHILD_TYPE="${TRACKER_ITEM_TYPE:-Task}"
CREATE_OUTPUT=$(LOCAL_RENDER_TODO=0 LOCAL_ISSUE_TYPE="" TRACKER_ITEM_TYPE="$CHILD_TYPE" \
  bash "$(dirname "$0")/create-issue.sh" "$TITLE" "$BODY" "$LABEL")
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

# Regenerate todo.md only on request (LOCAL_RENDER_TODO=1) — a rebuild costs ~30s on Windows (#66)
RENDER_SCRIPT="$(dirname "$0")/../lib/render-todo.sh"
if [ "${LOCAL_RENDER_TODO:-0}" = "1" ] && [ -f "$RENDER_SCRIPT" ]; then
  bash "$RENDER_SCRIPT" "$ISSUES_DIR" 2>/dev/null || true
fi

# JSON-escape the path before interpolating it. On Windows LOCAL_ISSUES_DIR can be an absolute path
# with backslashes, and a raw `\` makes the output invalid JSON — so every caller that parses .child
# (e.g. /to-issues Phase 6b) fails on a task that was actually created fine.
CHILD_FILE_JSON=${CHILD_FILE//\\/\\\\}
CHILD_FILE_JSON=${CHILD_FILE_JSON//\"/\\\"}

echo "{\"parent\": ${PARENT_ID}, \"child\": ${CHILD_ID}, \"url\": \"${CHILD_FILE_JSON}\"}"
