#!/bin/bash
# get-comments.sh — Todoist adapter
# Usage: bash .claude/trackers/active/get-comments.sh <TASK_ID>
# Returns the task's comments (#33) as JSON, oldest first: [{"author","date","text"}].
# Personal Todoist has no display names on comments, so author is the poster's user id.
# Comment text goes into an agent's brief: control characters and escape sequences are stripped.

set -o pipefail

TASK_ID="${1:-}"

if [ -z "$TASK_ID" ]; then
  echo '{"error": "Task ID required. Usage: get-comments.sh <TASK_ID>"}' >&2
  exit 1
fi

TD="${TODOIST_CLI:-td}"

if ! command -v "$TD" &>/dev/null; then
  echo '{"error": "Todoist CLI (td) not found. Install it or set TODOIST_CLI."}' >&2
  exit 1
fi

source "$(dirname "$0")/../lib/retry.sh"
source "$(dirname "$0")/../lib/auth-check.sh"
source "$(dirname "$0")/../lib/ticket-content.sh"
check_auth_todoist

# --all: td lists 10 by default. --full: the poster's id is not in td's short field set.
RAW=$(with_retry "$TD" comment list "id:${TASK_ID}" --all --json --full)
if [ $? -ne 0 ]; then
  echo "{\"error\": \"Failed to read comments on task $TASK_ID\"}" >&2
  exit 1
fi

echo "$RAW" | jq -c "${CLEAN_TEXT_JQ}"'
  [(.results? // .)[] | {author: ((.postedUid // "unknown") | tostring), date: (.postedAt // ""), text: (.content | clean_text)}]
  | sort_by(.date)'
