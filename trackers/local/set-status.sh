#!/bin/bash
# set-status.sh — Local tracker adapter
# Usage: bash .claude/trackers/active/set-status.sh <ID> <in-progress|in-review|needs-person|done>
# Records the harness status (#30) as a `status:` frontmatter field. `get-issue.sh` reports it on
# its **Status:** line. `done` does not close the item: closing stays with close-issue.sh.

set -o pipefail

ISSUE_ID="${1:-}"
STATUS="${2:-}"

if [ -z "$ISSUE_ID" ] || [ -z "$STATUS" ]; then
  echo '{"error": "Usage: set-status.sh <ID> <in-progress|in-review|needs-person|done>"}' >&2
  exit 1
fi

source "$(dirname "$0")/../lib/retry.sh"
source "$(dirname "$0")/../lib/auth-check.sh"
source "$(dirname "$0")/../lib/status.sh"

require_status "$STATUS" || exit 1
check_auth_local

ISSUES_DIR="${LOCAL_ISSUES_DIR:-tasks/issues}"
TASK_FILE="$ISSUES_DIR/${ISSUE_ID}.md"

if [ ! -f "$TASK_FILE" ]; then
  echo "{\"error\": \"Task $ISSUE_ID not found at $TASK_FILE\"}" >&2
  exit 1
fi

# One pass: replace an existing status: line inside the frontmatter, or add one after state:.
TMP_FILE="${TASK_FILE}.tmp.$$"
awk -v status="$STATUS" '
  { line = $0; cr = ""; if (sub(/\r$/, "", line)) cr = "\r" }
  line == "---" { fences++; if (fences == 2 && !done) { print "status: " status cr; done = 1 } print $0; next }
  fences == 1 && line ~ /^status:/ { if (!done) { print "status: " status cr; done = 1 } next }
  fences == 1 && line ~ /^state:/ && !done { print $0; print "status: " status cr; done = 1; next }
  { print $0 }
' "$TASK_FILE" > "$TMP_FILE" && mv "$TMP_FILE" "$TASK_FILE"

if [ $? -ne 0 ]; then
  rm -f "$TMP_FILE"
  echo "{\"error\": \"Failed to write status for task $ISSUE_ID\"}" >&2
  exit 1
fi

echo "Task #${ISSUE_ID} status: ${STATUS}"
