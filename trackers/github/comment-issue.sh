#!/bin/bash
# comment-issue.sh — GitHub Issues adapter
# Usage: bash .claude/trackers/active/comment-issue.sh <ISSUE_ID> "<text>"
# Adds a comment to the specified issue.

set -o pipefail

ISSUE_ID="${1:-}"
TEXT="${2:-}"

if [ -z "$ISSUE_ID" ] || [ -z "$TEXT" ]; then
  echo '{"error": "Usage: comment-issue.sh <ISSUE_ID> \"<text>\""}' >&2
  exit 1
fi

if ! command -v gh &>/dev/null; then
  echo '{"error": "gh CLI not installed. Install from https://cli.github.com"}' >&2
  exit 1
fi

source "$(dirname "$0")/../lib/retry.sh"
source "$(dirname "$0")/../lib/auth-check.sh"
check_auth_github

with_retry gh issue comment "$ISSUE_ID" --body "$TEXT" >/dev/null

if [ $? -ne 0 ]; then
  echo '{"error": "Failed to comment on issue. Check gh auth status."}' >&2
  exit 1
fi

echo "Commented on issue #${ISSUE_ID}"
