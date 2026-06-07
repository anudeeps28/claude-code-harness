#!/bin/bash
# get-issue-children.sh — GitHub Issues adapter
# Usage: bash .claude/trackers/active/get-issue-children.sh <ISSUE_NUMBER>
# Lists native sub-issues of the given parent. Falls back to body parsing
# if the sub-issues API returns empty (for repos not using sub-issues).
# Output: markdown-formatted list of children.

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

source "$(dirname "$0")/../lib/retry.sh"
source "$(dirname "$0")/../lib/auth-check.sh"
check_auth_github

REPO_INFO=$(gh repo view --json owner,name --jq '.owner.login + " " + .name')
OWNER=$(echo "$REPO_INFO" | cut -d' ' -f1)
REPO=$(echo "$REPO_INFO" | cut -d' ' -f2)

SUB_ISSUES=$(gh api graphql \
  -H "GraphQL-Features: sub_issues" \
  -f owner="$OWNER" -f repo="$REPO" -F number="$ISSUE" \
  -f query='
    query($owner: String!, $repo: String!, $number: Int!) {
      repository(owner: $owner, name: $repo) {
        issue(number: $number) {
          subIssues(first: 100) {
            totalCount
            nodes {
              number
              title
              state
              url
            }
          }
        }
      }
    }' 2>/dev/null)

TOTAL=$(echo "$SUB_ISSUES" | jq -r '.data.repository.issue.subIssues.totalCount // 0' 2>/dev/null)

if [ "$TOTAL" -gt 0 ] 2>/dev/null; then
  echo "# Sub-issues for Issue #$ISSUE"
  echo ""
  echo "$SUB_ISSUES" | jq -r '.data.repository.issue.subIssues.nodes[] |
    "- [" + (if .state == "CLOSED" then "x" else " " end) + "] #" + (.number|tostring) + " " + .title + " (" + .state + ")"'
  echo ""
  OPEN=$(echo "$SUB_ISSUES" | jq '[.data.repository.issue.subIssues.nodes[] | select(.state == "OPEN")] | length')
  CLOSED=$(echo "$SUB_ISSUES" | jq '[.data.repository.issue.subIssues.nodes[] | select(.state == "CLOSED")] | length')
  echo "_Progress: $CLOSED/$TOTAL complete ($OPEN open)_"
else
  echo "# Child Tasks for Issue #$ISSUE"
  echo ""
  echo "_No native sub-issues found. Showing issue body for inline task references._"
  echo ""
  with_retry gh issue view "$ISSUE" --json number,title,body | jq -r '
    "## #" + (.number|tostring) + ": " + .title,
    "",
    "### Body",
    (.body // "_No description_")
  '
fi
