#!/bin/bash
# create-sub-issue.sh — Todoist adapter
# Usage: bash .claude/trackers/active/create-sub-issue.sh <PARENT_ID> "<title>" "<body>" ["<label>"]
# Creates a new task as a subtask of the given parent.
# Returns JSON: {"parent": <id>, "child": <id>, "url": "<url>"}

set -o pipefail

PARENT_ID="${1:-}"
TITLE="${2:-}"
BODY="${3:-}"
LABEL="${4:-}"

if [ -z "$PARENT_ID" ] || [ -z "$TITLE" ]; then
  echo '{"error": "Usage: create-sub-issue.sh <PARENT_ID> \"<title>\" \"<body>\" [\"<label>\"]"}' >&2
  exit 1
fi

TD="${TODOIST_CLI:-td}"

if ! command -v "$TD" &>/dev/null; then
  echo '{"error": "Todoist CLI (td) not found. Install it or set TODOIST_CLI."}' >&2
  exit 1
fi

if ! command -v jq &>/dev/null; then
  echo '{"error": "jq is required. Install from https://jqlang.github.io/jq/download/"}' >&2
  exit 1
fi

source "$(dirname "$0")/../lib/retry.sh"
source "$(dirname "$0")/../lib/auth-check.sh"
check_auth_todoist

CREATE_ARGS=(task add "$TITLE" --parent "id:${PARENT_ID}")

if [ -n "$BODY" ]; then
  CREATE_ARGS+=(--description "$BODY")
fi

if [ -n "$LABEL" ]; then
  CREATE_ARGS+=(--labels "$LABEL")
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
  echo '{"error": "Failed to create subtask"}' >&2
  exit 1
fi

CHILD_ID=$(echo "$RESULT" | jq -r '.id // empty')
CHILD_URL=$(echo "$RESULT" | jq -r '.url // empty')

if [ -z "$CHILD_ID" ]; then
  echo '{"error": "Subtask created but no ID returned"}' >&2
  exit 1
fi

if [ -z "$CHILD_URL" ]; then
  CHILD_URL="https://todoist.com/showTask?id=${CHILD_ID}"
fi

# Todoist task IDs are alphanumeric — emit them as JSON strings
echo "{\"parent\": \"${PARENT_ID}\", \"child\": \"${CHILD_ID}\", \"url\": \"${CHILD_URL}\"}"
