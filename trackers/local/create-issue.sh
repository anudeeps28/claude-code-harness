#!/bin/bash
# create-issue.sh — Local tracker adapter
# Usage: bash .claude/trackers/active/create-issue.sh "<title>" "<body>" "<label>"
# Creates a new task file in tasks/issues/ with the next sequential ID.
# Prints the task id and path on success.

set -o pipefail

TITLE="${1:-}"
BODY="${2:-}"
LABEL="${3:-}"

if [ -z "$TITLE" ]; then
  echo '{"error": "Title required. Usage: create-issue.sh \"<title>\" \"<body>\" [\"<label>\"]"}' >&2
  exit 1
fi

source "$(dirname "$0")/../lib/retry.sh"
source "$(dirname "$0")/../lib/auth-check.sh"

ISSUES_DIR="${LOCAL_ISSUES_DIR:-tasks/issues}"

# Create the directory on first use
mkdir -p "$ISSUES_DIR"

# Mint next ID: highest existing filename + 1
_mint_next_id() {
  local max_id=0
  for f in "$ISSUES_DIR"/*.md; do
    [ -f "$f" ] || continue
    local basename
    basename=$(basename "$f" .md)
    if [[ "$basename" =~ ^[0-9]+$ ]] && [ "$basename" -gt "$max_id" ]; then
      max_id="$basename"
    fi
  done
  echo $((max_id + 1))
}

# Atomic create with noclobber retry
MAX_RETRIES=5
attempt=0
while [ $attempt -lt $MAX_RETRIES ]; do
  NEXT_ID=$(_mint_next_id)
  TASK_FILE="$ISSUES_DIR/${NEXT_ID}.md"

  # Format labels as YAML list
  if [ -n "$LABEL" ]; then
    labels_yaml="[$LABEL]"
  else
    labels_yaml="[]"
  fi

  CREATED=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

  CONTENT="---
id: ${NEXT_ID}
title: ${TITLE}
state: open
labels: ${labels_yaml}
parent: null
assignee: null
blocked_by: []
created: ${CREATED}
closed: null
close_reason: null
---

${BODY}"

  # Atomic write: noclobber prevents overwriting if file appeared between scan and write
  if (set -o noclobber; echo "$CONTENT" > "$TASK_FILE") 2>/dev/null; then
    # Regenerate todo.md
    RENDER_SCRIPT="$(dirname "$0")/../lib/render-todo.sh"
    if [ -x "$RENDER_SCRIPT" ] || [ -f "$RENDER_SCRIPT" ]; then
      bash "$RENDER_SCRIPT" "$ISSUES_DIR" 2>/dev/null || true
    fi
    echo "${NEXT_ID} ${TASK_FILE}"
    exit 0
  fi

  attempt=$((attempt + 1))
done

echo '{"error": "Failed to create task after retries (ID collision)."}' >&2
exit 1
