#!/bin/bash
# assign-issue.sh — GitHub Issues adapter
# Usage: bash .claude/trackers/active/assign-issue.sh <ISSUE_ID> ["<assignee>"]
# Assigns the issue to the given user (claims it). Defaults to the
# authenticated user (@me).

set -o pipefail

ISSUE_ID="${1:-}"
ASSIGNEE="${2:-@me}"

if [ -z "$ISSUE_ID" ]; then
  echo '{"error": "Usage: assign-issue.sh <ISSUE_ID> [\"<assignee>\"]"}' >&2
  exit 1
fi

if ! command -v gh &>/dev/null; then
  echo '{"error": "gh CLI not installed. Install from https://cli.github.com"}' >&2
  exit 1
fi

source "$(dirname "$0")/../lib/retry.sh"
source "$(dirname "$0")/../lib/auth-check.sh"
check_auth_github

with_retry gh issue edit "$ISSUE_ID" --add-assignee "$ASSIGNEE" >/dev/null

if [ $? -ne 0 ]; then
  echo '{"error": "Failed to assign issue. Check gh auth status."}' >&2
  exit 1
fi

echo "Assigned issue #${ISSUE_ID} to ${ASSIGNEE}"
