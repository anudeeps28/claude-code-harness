#!/bin/bash
# resolve-pr-thread.sh — Todoist adapter (no-op)
# Todoist has no pull request concept. Exits silently.
# Usage: bash .claude/trackers/active/resolve-pr-thread.sh <PR_NUMBER> <THREAD_NODE_ID>

PR=$1
THREAD_NODE_ID=$2

if [ -z "$PR" ] || [ -z "$THREAD_NODE_ID" ]; then
  echo '{"error": "Both args required. Usage: resolve-pr-thread.sh <PR_NUMBER> <THREAD_NODE_ID>"}' >&2
  exit 1
fi

source "$(dirname "$0")/../lib/retry.sh"
source "$(dirname "$0")/../lib/auth-check.sh"

exit 0
