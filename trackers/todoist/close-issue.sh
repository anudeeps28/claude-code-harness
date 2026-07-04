#!/bin/bash
# close-issue.sh — Todoist adapter
# Usage: bash .claude/trackers/active/close-issue.sh <TASK_ID>
# Completes (closes) the specified task.

set -o pipefail

TASK_ID="${1:-}"

if [ -z "$TASK_ID" ]; then
  echo '{"error": "Usage: close-issue.sh <TASK_ID>"}' >&2
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

with_retry "$TD" task close "$TASK_ID"
