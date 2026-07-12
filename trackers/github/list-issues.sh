#!/bin/bash
# list-issues.sh — GitHub adapter
# Usage: bash .claude/trackers/active/list-issues.sh
# Returns all open issues as a JSON array.
# Output: JSON array [{id, title, state, labels, assignees, url}]

if ! command -v gh &>/dev/null; then
  echo '{"error": "gh CLI not installed. Install from https://cli.github.com"}' >&2
  exit 1
fi

# Source shared libraries
source "$(dirname "$0")/../lib/retry.sh"
source "$(dirname "$0")/../lib/auth-check.sh"
check_auth_github

with_retry gh issue list --state open --limit 500 --json number,title,state,labels,assignees,url \
  --jq '[.[] | {id: .number, title: .title, state: .state, labels: [.labels[].name], assignees: [.assignees[].login], url: .url}]'
