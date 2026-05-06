#!/bin/bash
# add-label.sh — GitHub Issues adapter
# Usage: bash .claude/trackers/active/add-label.sh <ISSUE_ID> "<label>"
# Adds a label to the specified issue.

set -o pipefail

ISSUE_ID="${1:-}"
LABEL="${2:-}"

if [ -z "$ISSUE_ID" ] || [ -z "$LABEL" ]; then
  echo '{"error": "Usage: add-label.sh <ISSUE_ID> \"<label>\""}' >&2
  exit 1
fi

if ! command -v gh &>/dev/null; then
  echo '{"error": "gh CLI not installed. Install from https://cli.github.com"}' >&2
  exit 1
fi

source "$(dirname "$0")/../lib/retry.sh"
source "$(dirname "$0")/../lib/auth-check.sh"
check_auth_github

with_retry gh issue edit "$ISSUE_ID" --add-label "$LABEL"
