#!/bin/bash
# reply-pr-thread.sh — GitHub PRs adapter
# Usage: bash .claude/trackers/active/reply-pr-thread.sh <PR_NUMBER> <COMMENT_ID> "Reply text"
# Posts a reply to a specific review comment thread.
# COMMENT_ID is the numeric `id` returned by get-pr-review-threads.sh.

PR=$1
COMMENT_ID=$2
REPLY_TEXT=$3

if [ -z "$PR" ] || [ -z "$COMMENT_ID" ] || [ -z "$REPLY_TEXT" ]; then
  echo '{"error": "All 3 args required. Usage: reply-pr-thread.sh <PR_NUMBER> <COMMENT_ID> <REPLY_TEXT>"}' >&2
  exit 1
fi

if ! command -v gh &>/dev/null; then
  echo '{"error": "gh CLI not installed. Install from https://cli.github.com"}' >&2
  exit 1
fi

# Source shared libraries
source "$(dirname "$0")/../lib/retry.sh"
source "$(dirname "$0")/../lib/auth-check.sh"
check_auth_github

with_retry gh api "repos/{owner}/{repo}/pulls/$PR/comments" \
  -X POST \
  -f body="$REPLY_TEXT" \
  -F in_reply_to="$COMMENT_ID"
