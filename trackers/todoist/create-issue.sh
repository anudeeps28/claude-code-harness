#!/bin/bash
# create-issue.sh — Todoist adapter
# Usage: bash .claude/trackers/active/create-issue.sh "<title>" "<body>" "<label>" ["<section>"] ["<project>"]
# Returns the created task URL.
# label, section, and project are optional.

set -o pipefail

TITLE="${1:-}"
BODY="${2:-}"
LABEL="${3:-}"
SECTION="${4:-}"
PROJECT="${5:-}"

if [ -z "$TITLE" ]; then
  echo '{"error": "Title required. Usage: create-issue.sh \"<title>\" \"<body>\" [\"<label>\"] [\"<section>\"] [\"<project>\"]"}' >&2
  exit 1
fi

TD="${TODOIST_CLI:-td}"

if ! command -v "$TD" &>/dev/null; then
  echo '{"error": "Todoist CLI (td) not found. Install it or set TODOIST_CLI."}' >&2
  exit 1
fi

source "$(dirname "$0")/../lib/retry.sh"
source "$(dirname "$0")/../lib/auth-check.sh"
check_auth_todoist

# Auto-read project from config when not passed as argument
if [ -z "$PROJECT" ]; then
  if [ -f "tasks/tracker-config.md" ]; then
    _proj=$(grep -i "todoist_project[[:space:]]*=" tasks/tracker-config.md | sed 's/.*=[[:space:]]*//; s/[[:space:]]*$//' | tr -d '\r')
    [ -n "$_proj" ] && [ "$_proj" != "YOUR_TODOIST_PROJECT" ] && PROJECT="$_proj"
  fi
  if [ -z "$PROJECT" ] && [ -f "tasks/notes.md" ]; then
    _proj=$(sed -n '/^## Todoist/,/^## /{ /project\s*:/{ s/.*project\s*:\s*//; s/[[:space:]]*$//; p; q; } }' tasks/notes.md)
    [ -n "$_proj" ] && PROJECT="$_proj"
  fi
fi

CREATE_ARGS=(task add "$TITLE")

if [ -n "$BODY" ]; then
  CREATE_ARGS+=(--description "$BODY")
fi

if [ -n "$LABEL" ]; then
  CREATE_ARGS+=(--labels "$LABEL")
fi

if [ -n "$SECTION" ]; then
  CREATE_ARGS+=(--section "$SECTION")
fi

if [ -n "$PROJECT" ]; then
  CREATE_ARGS+=(--project "$PROJECT")
fi

CREATE_ARGS+=(--json)

RESULT=$(with_retry "$TD" "${CREATE_ARGS[@]}")

if [ -z "$RESULT" ]; then
  echo '{"error": "Failed to create task"}' >&2
  exit 1
fi

TASK_URL=$(echo "$RESULT" | jq -r '.url // empty')
TASK_ID=$(echo "$RESULT" | jq -r '.id // empty')

if [ -n "$TASK_URL" ]; then
  echo "$TASK_URL"
elif [ -n "$TASK_ID" ]; then
  echo "https://todoist.com/showTask?id=$TASK_ID"
else
  echo "$RESULT"
fi
