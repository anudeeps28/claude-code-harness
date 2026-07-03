#!/bin/bash
# get-pr-review-threads.sh — Todoist adapter (no-op)
# Todoist has no pull request concept. Returns an empty JSON array.
# Usage: bash .claude/trackers/active/get-pr-review-threads.sh <PR_NUMBER>

PR=$1

if [ -z "$PR" ]; then
  echo '{"error": "PR number required. Usage: get-pr-review-threads.sh <PR_NUMBER>"}' >&2
  exit 1
fi

source "$(dirname "$0")/../lib/retry.sh"
source "$(dirname "$0")/../lib/auth-check.sh"

echo '[]'
