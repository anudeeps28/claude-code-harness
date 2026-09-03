#!/bin/bash
# create-issue.sh — Local tracker adapter
# Usage: bash .claude/trackers/active/create-issue.sh "<title>" "<body>" "<label>"
# Creates a new task file in tasks/issues/ with the next sequential ID.
# Prints the task id and path on success.
# LOCAL_ISSUE_TYPE is read from the environment rather than a positional argument, because
# the fourth positional slot is already the milestone in the GitHub adapter and the section
# slot in the Todoist adapter (same rationale as ADO_WORK_ITEM_TYPE in trackers/ado/create-issue.sh).
#
# LINE ENDINGS — read before editing this file. Most lines here are CRLF (git normalises to LF on
# commit), but the newline embedded INSIDE the type_line string literal must be a bare LF. A text
# editor that helpfully normalises the whole file puts a CR into the generated issue's frontmatter,
# where it is invisible: `get-issue.sh` still prints "**Type:** Bug" and a test asserting
# stdout.includes('**Type:** Bug') passes happily against "Bug\r". One executor lost time to this and
# had to work around it with perl. Check the bytes, not the rendering, after touching this file.

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

  # The value is stripped of CR/LF before use. An unstripped newline would forge sibling
  # frontmatter fields -- e.g. a second "state: closed" line, which get-issue.sh (last-wins)
  # would honour while every grep -m1 reader still saw the real one.
  if [ -n "${LOCAL_ISSUE_TYPE:-}" ]; then
    issue_type=$(printf '%s' "$LOCAL_ISSUE_TYPE" | tr -d '\r\n')
  else
    issue_type=""
  fi

  if [ -n "$issue_type" ]; then
    type_line="type: ${issue_type}
"
  else
    type_line=""
  fi

  CREATED=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

  CONTENT="---
id: ${NEXT_ID}
title: ${TITLE}
state: open
labels: ${labels_yaml}
${type_line}parent: null
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
