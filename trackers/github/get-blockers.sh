#!/bin/bash
# get-blockers.sh — GitHub Issues adapter
# Usage: bash .claude/trackers/active/get-blockers.sh <ISSUE_ID>
# Prints the IDs of issues blocking <ISSUE_ID> as a JSON array, e.g. [12, 14].
# Reads the "Blocked by: #N, #M" body-line convention written by add-blocker.sh.

set -o pipefail

ISSUE_ID="${1:-}"

if [ -z "$ISSUE_ID" ]; then
  echo '{"error": "Usage: get-blockers.sh <ISSUE_ID>"}' >&2
  exit 1
fi

if ! command -v gh &>/dev/null; then
  echo '{"error": "gh CLI not installed. Install from https://cli.github.com"}' >&2
  exit 1
fi

if ! command -v jq &>/dev/null; then
  echo '{"error": "jq is required. Install from https://jqlang.github.io/jq/download/"}' >&2
  exit 1
fi

source "$(dirname "$0")/../lib/retry.sh"
source "$(dirname "$0")/../lib/auth-check.sh"
check_auth_github

RESPONSE=$(with_retry gh issue view "$ISSUE_ID" --json body)

if [ $? -ne 0 ]; then
  echo '{"error": "Failed to read issue body. Check gh auth status."}' >&2
  exit 1
fi

BODY=$(echo "$RESPONSE" | jq -r '.body // ""')

ids=$(echo "$BODY" | grep -m1 '^Blocked by:' | grep -o '#[0-9]*' | tr -d '#' | paste -sd ',' -)

if [ -z "$ids" ]; then
  echo "[]"
else
  echo "[$(echo "$ids" | sed 's/,/, /g')]"
fi
