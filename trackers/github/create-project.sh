#!/bin/bash
# create-project.sh — GitHub Projects v2 adapter
# Usage: bash .claude/trackers/active/create-project.sh "<title>"
# Creates a GitHub Project v2 for the current user/org.
# Returns JSON: {"number": N, "title": "...", "url": "..."}
#
# Note: requires 'project' OAuth scope. Run: gh auth refresh -s project

set -o pipefail

TITLE="${1:-}"

if [ -z "$TITLE" ]; then
  echo '{"error": "Usage: create-project.sh \"<title>\""}' >&2
  exit 1
fi

if ! command -v gh &>/dev/null; then
  echo '{"error": "gh CLI not installed. Install from https://cli.github.com"}' >&2
  exit 1
fi

source "$(dirname "$0")/../lib/retry.sh"
source "$(dirname "$0")/../lib/auth-check.sh"
check_auth_github

OWNER=$(gh repo view --json owner --jq '.owner.login')

PROJECT_OUT=$(with_retry gh project create --owner "$OWNER" --title "$TITLE" --format json 2>&1)
EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
  if echo "$PROJECT_OUT" | grep -qi "scope\|permission\|project"; then
    echo '{"error": "Missing project scope. Run: gh auth refresh -s project"}' >&2
  else
    echo "{\"error\": \"Failed to create project: $PROJECT_OUT\"}" >&2
  fi
  exit 1
fi

echo "$PROJECT_OUT" | jq '{number: .number, title: .title, url: .url}'
