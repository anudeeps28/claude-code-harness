#!/bin/bash
# create-issue.sh — GitHub Issues adapter
# Usage: bash .claude/trackers/active/create-issue.sh "<title>" "<body>" "<label>"
# Returns the created issue URL.

set -o pipefail

TITLE="${1:-}"
BODY="${2:-}"
LABEL="${3:-needs-triage}"

if [ -z "$TITLE" ]; then
  echo '{"error": "Title required. Usage: create-issue.sh \"<title>\" \"<body>\" \"<label>\""}' >&2
  exit 1
fi

if ! command -v gh &>/dev/null; then
  echo '{"error": "gh CLI not installed. Install from https://cli.github.com"}' >&2
  exit 1
fi

source "$(dirname "$0")/../lib/retry.sh"
source "$(dirname "$0")/../lib/auth-check.sh"
check_auth_github

with_retry gh issue create \
  --title "$TITLE" \
  --body "$BODY" \
  --label "$LABEL"
