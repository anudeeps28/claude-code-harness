#!/bin/bash
# create-milestone.sh — GitHub Issues adapter
# Usage: bash .claude/trackers/active/create-milestone.sh "<title>" ["<description>"] ["<due_date>"]
# Creates a milestone in the current repo. due_date format: YYYY-MM-DD
# Returns JSON: {"number": N, "title": "...", "url": "..."}

set -o pipefail

TITLE="${1:-}"
DESCRIPTION="${2:-}"
DUE_DATE="${3:-}"

if [ -z "$TITLE" ]; then
  echo '{"error": "Usage: create-milestone.sh \"<title>\" [\"<description>\"] [\"<due_date YYYY-MM-DD>\"]"}' >&2
  exit 1
fi

if ! command -v gh &>/dev/null; then
  echo '{"error": "gh CLI not installed. Install from https://cli.github.com"}' >&2
  exit 1
fi

source "$(dirname "$0")/../lib/retry.sh"
source "$(dirname "$0")/../lib/auth-check.sh"
check_auth_github

API_ARGS=(-f title="$TITLE" -f state="open")

if [ -n "$DESCRIPTION" ]; then
  API_ARGS+=(-f description="$DESCRIPTION")
fi

if [ -n "$DUE_DATE" ]; then
  API_ARGS+=(-f due_on="${DUE_DATE}T00:00:00Z")
fi

REPO_SLUG=$(gh repo view --json nameWithOwner --jq '.nameWithOwner')

with_retry gh api --method POST "/repos/${REPO_SLUG}/milestones" \
  "${API_ARGS[@]}" \
  --jq '{number: .number, title: .title, url: .html_url}'
