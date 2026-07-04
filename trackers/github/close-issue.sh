#!/bin/bash
# close-issue.sh — GitHub Issues adapter
# Usage: bash .claude/trackers/active/close-issue.sh <ISSUE_ID> ["<reason>"]
# Closes the specified issue. Optional reason: "completed" (default) or "not_planned".

set -o pipefail

ISSUE_ID="${1:-}"
REASON="${2:-completed}"

if [ -z "$ISSUE_ID" ]; then
  echo '{"error": "Usage: close-issue.sh <ISSUE_ID> [\"<reason>\"]"}' >&2
  exit 1
fi

if ! command -v gh &>/dev/null; then
  echo '{"error": "gh CLI not installed. Install from https://cli.github.com"}' >&2
  exit 1
fi

source "$(dirname "$0")/../lib/retry.sh"
source "$(dirname "$0")/../lib/auth-check.sh"
check_auth_github

CLOSE_ARGS=(issue close "$ISSUE_ID")

if [ "$REASON" = "not_planned" ]; then
  CLOSE_ARGS+=(--reason "not planned")
fi

with_retry gh "${CLOSE_ARGS[@]}"
