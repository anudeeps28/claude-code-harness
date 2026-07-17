#!/bin/bash
# get-blockers.sh — Todoist adapter
# Usage: bash .claude/trackers/active/get-blockers.sh <TASK_ID>
# Prints the IDs of tasks blocking <TASK_ID> as a JSON array, e.g. [12, 14].
# Reads the "Blocked by: #N, #M" description-line convention written by
# add-blocker.sh.

set -o pipefail

TASK_ID="${1:-}"

if [ -z "$TASK_ID" ]; then
  echo '{"error": "Usage: get-blockers.sh <TASK_ID>"}' >&2
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

TASK_JSON=$(with_retry "$TD" task view "id:${TASK_ID}" --json)

if [ -z "$TASK_JSON" ]; then
  echo '{"error": "Failed to fetch task"}' >&2
  exit 1
fi

# Todoist task IDs are alphanumeric — emit them as JSON strings.
# A task with no "Blocked by:" line is a valid empty result, not an error.
line=$(echo "$TASK_JSON" | jq -r '.description // ""' | grep -m1 '^Blocked by:' || true)
ids=$(printf '%s\n' "$line" | grep -o '#[A-Za-z0-9]*' | tr -d '#' || true)
printf '%s\n' "$ids" | jq -R -s -c 'split("\n") | map(select(length > 0))'
