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

# Auto-read default section from config when not passed as argument.
# Mirrors the project auto-read above and the same key get-sprint-issues.sh reads
# for listing. Blank config = no-op: the task lands at the project root as before.
if [ -z "$SECTION" ] && [ -f "tasks/tracker-config.md" ]; then
  _sec=$(grep -i "todoist_default_section[[:space:]]*=" tasks/tracker-config.md | sed 's/.*=[[:space:]]*//; s/[[:space:]]*$//' | tr -d '\r')
  [ -n "$_sec" ] && SECTION="$_sec"
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

# Optional create-time overrides (see trackers/README.md "Create-time env overrides").
# These map to native Todoist features that the flat adapter args cannot express:
# p1-p4 priority actually sorts the list, unlike a text label, and an uncompletable
# task has no checkbox so a milestone header can't be ticked off by accident.
# Backends without these concepts ignore the vars, so a caller may always set them.
if [ -n "$TRACKER_PRIORITY" ]; then
  case "$TRACKER_PRIORITY" in
    p1|p2|p3|p4) CREATE_ARGS+=(--priority "$TRACKER_PRIORITY") ;;
    *)
      echo "{\"error\": \"TRACKER_PRIORITY must be one of p1, p2, p3, p4 (got '$TRACKER_PRIORITY')\"}" >&2
      exit 1
      ;;
  esac
fi

if [ -n "$TRACKER_UNCOMPLETABLE" ]; then
  CREATE_ARGS+=(--uncompletable)
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
