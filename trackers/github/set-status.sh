#!/bin/bash
# set-status.sh — GitHub Issues adapter
# Usage: bash .claude/trackers/active/set-status.sh <ISSUE_NUMBER> <in-progress|in-review|needs-person|done>
# Records the harness status (#30) as a `status:<s>` label, removing any other status label in the
# same edit so only one ever shows. `done` also closes the issue: on a GitHub board, closed is the
# done column. The status:* labels are created by setup-labels.sh.

set -o pipefail

ISSUE="${1:-}"
STATUS="${2:-}"

if [ -z "$ISSUE" ] || [ -z "$STATUS" ]; then
  echo '{"error": "Usage: set-status.sh <ISSUE_NUMBER> <in-progress|in-review|needs-person|done>"}' >&2
  exit 1
fi

if ! command -v gh &>/dev/null; then
  echo '{"error": "gh CLI not installed. Install from https://cli.github.com"}' >&2
  exit 1
fi

source "$(dirname "$0")/../lib/retry.sh"
source "$(dirname "$0")/../lib/auth-check.sh"
source "$(dirname "$0")/../lib/status.sh"

require_status "$STATUS" || exit 1
check_auth_github

LABELS_JSON=$(with_retry gh issue view "$ISSUE" --json labels)
if [ $? -ne 0 ]; then
  echo "{\"error\": \"Failed to read issue #$ISSUE\"}" >&2
  exit 1
fi
CURRENT=$(echo "$LABELS_JSON" | jq -r '[.labels[].name | select(startswith("status:"))] | join("\n")')
if [ $? -ne 0 ]; then
  echo "{\"error\": \"Failed to read issue #$ISSUE\"}" >&2
  exit 1
fi

EDIT_ARGS=(issue edit "$ISSUE" --add-label "status:$STATUS")
while IFS= read -r old; do
  old="${old%$'\r'}"
  [ -n "$old" ] && [ "$old" != "status:$STATUS" ] && EDIT_ARGS+=(--remove-label "$old")
done <<< "$CURRENT"

if ! with_retry gh "${EDIT_ARGS[@]}" >/dev/null; then
  echo "{\"error\": \"Failed to set status:$STATUS on issue #$ISSUE (run setup-labels.sh if the label is missing)\"}" >&2
  exit 1
fi

if [ "$STATUS" = "done" ]; then
  if ! with_retry gh issue close "$ISSUE" >/dev/null; then
    echo "{\"error\": \"Set status:done but failed to close issue #$ISSUE\"}" >&2
    exit 1
  fi
fi

echo "Issue #${ISSUE} status: ${STATUS}"
