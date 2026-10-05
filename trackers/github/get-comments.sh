#!/bin/bash
# get-comments.sh — GitHub Issues adapter
# Usage: bash .claude/trackers/active/get-comments.sh <ISSUE_NUMBER>
# Returns the issue's comments (#33) as JSON, oldest first: [{"author","date","text"}].
# Comment text goes into an agent's brief: control characters and escape sequences are stripped.

set -o pipefail

ISSUE="${1:-}"

if [ -z "$ISSUE" ]; then
  echo '{"error": "Issue number required. Usage: get-comments.sh <ISSUE_NUMBER>"}' >&2
  exit 1
fi

if ! command -v gh &>/dev/null; then
  echo '{"error": "gh CLI not installed. Install from https://cli.github.com"}' >&2
  exit 1
fi

source "$(dirname "$0")/../lib/retry.sh"
source "$(dirname "$0")/../lib/auth-check.sh"
source "$(dirname "$0")/../lib/ticket-content.sh"
check_auth_github

RAW=$(with_retry gh issue view "$ISSUE" --json comments)
if [ $? -ne 0 ]; then
  echo "{\"error\": \"Failed to read comments on issue #$ISSUE\"}" >&2
  exit 1
fi

echo "$RAW" | jq -c "${CLEAN_TEXT_JQ}"'
  [(.comments // [])[] | {author: (.author.login // "unknown"), date: (.createdAt // ""), text: (.body | clean_text)}]
  | sort_by(.date)'
