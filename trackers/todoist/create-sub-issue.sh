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
