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
parent=""
body=""

while IFS= read -r line || [ -n "$line" ]; do
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
    key=$(echo "$line" | sed -n 's/^\([a-z_]*\):.*/\1/p')
    val=$(echo "$line" | sed -n 's/^[a-z_]*: *//p')
    case "$key" in
      title) title="$val" ;;
      state) state="$val" ;;
      labels) labels="$val" ;;
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

# Format parent
display_parent="None"
[ -n "$parent" ] && [ "$parent" != "null" ] && display_parent="#$parent"

cat <<EOF
# Task #${ISSUE_ID}: ${title}

**State:** ${display_state}
**Labels:** ${display_labels}
**Parent:** ${display_parent}

## Description
${body:-_No description_}
EOF
