#!/bin/bash
# reply-pr-thread.sh — Todoist adapter (no-op)
# Todoist has no pull request concept. Exits silently.
# Usage: bash .claude/trackers/active/reply-pr-thread.sh <PR_NUMBER> <THREAD_ID> "Reply text"

PR=$1
THREAD_ID=$2
REPLY_TEXT=$3

if [ -z "$PR" ] || [ -z "$THREAD_ID" ] || [ -z "$REPLY_TEXT" ]; then
  echo '{"error": "All 3 args required. Usage: reply-pr-thread.sh <PR_NUMBER> <THREAD_ID> <REPLY_TEXT>"}' >&2
  exit 1
fi

source "$(dirname "$0")/../lib/retry.sh"
source "$(dirname "$0")/../lib/auth-check.sh"

exit 0
