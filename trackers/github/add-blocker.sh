#!/bin/bash
# add-blocker.sh — GitHub Issues adapter
# Usage: bash .claude/trackers/active/add-blocker.sh <ISSUE_ID> <BLOCKER_ID>
# Records that <ISSUE_ID> is blocked by <BLOCKER_ID> via a "Blocked by:"
# line in the issue body (GitHub's native issue dependencies are not yet
# scriptable via stable gh commands; the body line is the documented
# fallback convention read back by get-blockers.sh).

set -o pipefail

ISSUE_ID="${1:-}"
BLOCKER_ID="${2:-}"

if [ -z "$ISSUE_ID" ] || [ -z "$BLOCKER_ID" ]; then
  echo '{"error": "Usage: add-blocker.sh <ISSUE_ID> <BLOCKER_ID>"}' >&2
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

# Already recorded?
existing=$(echo "$BODY" | grep -m1 '^Blocked by:' | grep -o '#[0-9]*' | tr -d '#')
if echo "$existing" | grep -qw "$BLOCKER_ID"; then
  echo "Issue #${ISSUE_ID} is already blocked by #${BLOCKER_ID}"
  exit 0
fi

TMP_BODY=$(mktemp)
trap 'rm -f "$TMP_BODY"' EXIT

if echo "$BODY" | grep -q '^Blocked by:'; then
  # Append to the existing line
  echo "$BODY" | sed "s/^Blocked by:.*/&, #${BLOCKER_ID}/" > "$TMP_BODY"
else
  # Add the line at the end of the body
  printf '%s\n\nBlocked by: #%s\n' "$BODY" "$BLOCKER_ID" > "$TMP_BODY"
fi

with_retry gh issue edit "$ISSUE_ID" --body-file "$TMP_BODY" >/dev/null

if [ $? -ne 0 ]; then
  echo '{"error": "Failed to update issue body. Check gh auth status."}' >&2
  exit 1
fi

echo "Issue #${ISSUE_ID} is now blocked by #${BLOCKER_ID}"
