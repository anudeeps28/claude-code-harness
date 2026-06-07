#!/bin/bash
# add-to-project.sh — GitHub Projects v2 adapter
# Usage: bash .claude/trackers/active/add-to-project.sh <PROJECT_NUMBER> <ISSUE_URL>
# Adds an issue to a GitHub Project v2.
# Returns JSON: {"item_id": "...", "project": N}
#
# Note: requires 'project' OAuth scope. Run: gh auth refresh -s project

set -o pipefail

PROJECT_NUM="${1:-}"
ISSUE_URL="${2:-}"

if [ -z "$PROJECT_NUM" ] || [ -z "$ISSUE_URL" ]; then
  echo '{"error": "Usage: add-to-project.sh <PROJECT_NUMBER> <ISSUE_URL>"}' >&2
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

ITEM_ID=$(with_retry gh project item-add "$PROJECT_NUM" \
  --owner "$OWNER" \
  --url "$ISSUE_URL" \
  --format json 2>&1 | jq -r '.id // empty')

EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ] || [ -z "$ITEM_ID" ]; then
  if echo "$ITEM_ID" | grep -qi "scope\|permission\|project"; then
    echo '{"error": "Missing project scope. Run: gh auth refresh -s project"}' >&2
  else
    echo '{"error": "Failed to add issue to project"}' >&2
  fi
  exit 1
fi

echo "{\"item_id\": \"$ITEM_ID\", \"project\": $PROJECT_NUM}"
