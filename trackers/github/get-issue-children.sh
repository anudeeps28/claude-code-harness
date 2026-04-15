#!/bin/bash
# get-issue-children.sh — GitHub Issues adapter
# Usage: bash .claude/trackers/active/get-issue-children.sh <ISSUE_NUMBER>
# GitHub has no native parent/child relationship. Returns the issue body so Claude
# can identify sub-tasks from inline task lists (- [ ] items) or referenced issues (#123).

set -o pipefail

ISSUE=$1

if [ -z "$ISSUE" ]; then
  echo '{"error": "Issue number required. Usage: get-issue-children.sh <ISSUE_NUMBER>"}' >&2
  exit 1
fi

if ! command -v gh &>/dev/null; then
  echo '{"error": "gh CLI not installed. Install from https://cli.github.com"}' >&2
  exit 1
fi

# Source shared libraries
source "$(dirname "$0")/../lib/retry.sh"
source "$(dirname "$0")/../lib/auth-check.sh"
check_auth_github

echo "# Child Tasks for Issue #$ISSUE"
echo ""
echo "_Note: GitHub has no native sub-task relationships. Showing issue body — look for task list items (\`- [ ]\`) or referenced issues (\`#N\`)._"
echo ""

# Format as readable markdown (consistent with ADO adapter)
with_retry gh issue view "$ISSUE" --json number,title,body | jq -r '
  "## #" + (.number|tostring) + ": " + .title,
  "",
  "### Body",
  (.body // "_No description_")
'
