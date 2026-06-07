#!/bin/bash
# create-issue.sh — GitHub Issues adapter
# Usage: bash .claude/trackers/active/create-issue.sh "<title>" "<body>" "<label>" ["<milestone>"] ["<project_num>"]
# Returns the created issue URL.
# label, milestone, and project_num are optional.

set -o pipefail

TITLE="${1:-}"
BODY="${2:-}"
LABEL="${3:-needs-triage}"
MILESTONE="${4:-}"
PROJECT_NUM="${5:-}"

if [ -z "$TITLE" ]; then
  echo '{"error": "Title required. Usage: create-issue.sh \"<title>\" \"<body>\" [\"<label>\"] [\"<milestone>\"] [\"<project_num>\"]"}' >&2
  exit 1
fi

if ! command -v gh &>/dev/null; then
  echo '{"error": "gh CLI not installed. Install from https://cli.github.com"}' >&2
  exit 1
fi

source "$(dirname "$0")/../lib/retry.sh"
source "$(dirname "$0")/../lib/auth-check.sh"
check_auth_github

CREATE_ARGS=(--title "$TITLE" --body "$BODY")

if [ -n "$LABEL" ]; then
  CREATE_ARGS+=(--label "$LABEL")
fi

if [ -n "$MILESTONE" ]; then
  CREATE_ARGS+=(--milestone "$MILESTONE")
fi

ISSUE_URL=$(with_retry gh issue create "${CREATE_ARGS[@]}" 2>&1 | tail -1)

if [ -z "$ISSUE_URL" ]; then
  echo '{"error": "Failed to create issue"}' >&2
  exit 1
fi

echo "$ISSUE_URL"

if [ -n "$PROJECT_NUM" ]; then
  OWNER=$(gh repo view --json owner --jq '.owner.login')
  gh project item-add "$PROJECT_NUM" --owner "$OWNER" --url "$ISSUE_URL" >/dev/null 2>&1 || \
    echo "Warning: failed to add issue to project $PROJECT_NUM (may need: gh auth refresh -s project)" >&2
fi
