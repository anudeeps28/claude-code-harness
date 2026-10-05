#!/bin/bash
# get-issue.sh — Local tracker adapter
# Usage: bash .claude/trackers/active/get-issue.sh <ID>
# Returns full details of a single task from tasks/issues/<ID>.md.

set -o pipefail

ISSUE_ID="${1:-}"

if [ -z "$ISSUE_ID" ]; then
  echo '{"error": "Task ID required. Usage: get-issue.sh <ID>"}' >&2
  exit 1
fi

source "$(dirname "$0")/../lib/retry.sh"
source "$(dirname "$0")/../lib/auth-check.sh"
source "$(dirname "$0")/../lib/item-type.sh"
check_auth_local

ISSUES_DIR="${LOCAL_ISSUES_DIR:-tasks/issues}"
TASK_FILE="$ISSUES_DIR/${ISSUE_ID}.md"

if [ ! -f "$TASK_FILE" ]; then
  echo "{\"error\": \"Task $ISSUE_ID not found at $TASK_FILE\"}" >&2
  exit 1
fi

# Parse frontmatter (between --- delimiters)
in_frontmatter=false
frontmatter_done=false
title=""
state=""
labels=""
# Initialised like every other field: an exported `type` in the caller's environment used to leak
# into an item with no type: line (#9).
type=""
status=""
parent=""
body=""

while IFS= read -r line || [ -n "$line" ]; do
  # Issue files written on Windows carry CRLF. Without this the "---" delimiter never matches,
  # frontmatter is never entered, and the adapter silently returns an issue with no title, state
  # or labels — exit 0 and all fields blank, which is far worse than an error.
  line="${line%$'\r'}"
  if [ "$frontmatter_done" = "true" ]; then
    if [ -z "$body" ]; then
      body="$line"
    else
      body="$body
$line"
    fi
    continue
  fi

  if [ "$line" = "---" ]; then
    if [ "$in_frontmatter" = "true" ]; then
      frontmatter_done=true
    else
      in_frontmatter=true
    fi
    continue
  fi

  if [ "$in_frontmatter" = "true" ]; then
    # Bash's own regex, not `echo | sed`: two subprocesses per line made this take seconds on
    # Windows, where starting a process is slow (#66). Same match as the old sed expressions.
    key=""; val=""
    if [[ "$line" =~ ^([a-z_]*):\ *(.*)$ ]]; then
      key="${BASH_REMATCH[1]}"
      val="${BASH_REMATCH[2]}"
    fi
    case "$key" in
      title) title="$val" ;;
      state) state="$val" ;;
      labels) labels="$val" ;;
      type) [ -z "$type" ] && type="$val" ;;
      status) [ -z "$status" ] && status="$val" ;;
      parent) parent="$val" ;;
    esac
  fi
done < "$TASK_FILE"

# Strip leading blank line from body
body=$(echo "$body" | sed '/./,$!d')

# Format labels for display (normalize: strip brackets, collapse whitespace around commas)
display_labels=$(echo "$labels" | sed 's/\[//;s/\]//' | sed 's/ *, */,/g' | sed 's/,/, /g')
display_labels=$(echo "$display_labels" | sed 's/^ *//;s/ *$//')
[ -z "$display_labels" ] && display_labels="None"

# Format state for display
display_state=$(echo "$state" | tr '[:lower:]' '[:upper:]')

# Type (#32): the type: field, mapped onto Feature|Story|Bug|Task (lib/item-type.sh), so a
# lower-case or crafted value never reaches the output verbatim. With no usable type: line, a
# "type:<x>" label, then a "bug" label, else Unknown.
normalize_item_type "$type"
display_type="$ITEM_TYPE"
if [ "$display_type" = "Unknown" ]; then
  label_list=",${display_labels// /},"
  shopt -s nocasematch
  if [[ "$label_list" =~ ,type:([^,]*), ]]; then
    normalize_item_type "${BASH_REMATCH[1]}"
    display_type="$ITEM_TYPE"
  fi
  if [ "$display_type" = "Unknown" ] && [[ "$label_list" == *,bug,* ]]; then
    display_type="Bug"
  fi
  shopt -u nocasematch
fi

# Status (#30): one of the four harness statuses written by set-status.sh, else None.
case "$status" in
  in-progress|in-review|needs-person|done) display_status="$status" ;;
  *) display_status="None" ;;
esac

# Format parent
display_parent="None"
[ -n "$parent" ] && [ "$parent" != "null" ] && display_parent="#$parent"

cat <<EOF
# Task #${ISSUE_ID}: ${title}

**Type:** ${display_type}
**State:** ${display_state}
**Status:** ${display_status}
**Labels:** ${display_labels}
**Parent:** ${display_parent}

## Description
${body:-_No description_}
EOF
