#!/bin/bash
# remove-label.sh — Todoist adapter
# Usage: bash .claude/trackers/active/remove-label.sh <TASK_ID> "<label>"
# Removes a label from the specified task.

set -o pipefail

TASK_ID="${1:-}"
LABEL="${2:-}"

if [ -z "$TASK_ID" ] || [ -z "$LABEL" ]; then
  echo '{"error": "Usage: remove-label.sh <TASK_ID> \"<label>\""}' >&2
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

with_retry "$TD" task update "$TASK_ID" --remove-label "$LABEL"
