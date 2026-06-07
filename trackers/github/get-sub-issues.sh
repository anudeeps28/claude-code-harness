#!/bin/bash
# get-sub-issues.sh — GitHub Issues adapter
# Usage: bash .claude/trackers/active/get-sub-issues.sh <ISSUE_NUMBER>
# Lists native sub-issues of the given parent using the GraphQL API.
# Returns JSON array: [{"number": N, "title": "...", "state": "OPEN|CLOSED", "url": "..."}]

set -o pipefail

ISSUE_NUM="${1:-}"

if [ -z "$ISSUE_NUM" ]; then
  echo '{"error": "Usage: get-sub-issues.sh <ISSUE_NUMBER>"}' >&2
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

with_retry gh api graphql \
  -H "GraphQL-Features: sub_issues" \
  -f owner="$OWNER" -f repo="$REPO" -F number="$ISSUE_NUM" \
  -f query='
    query($owner: String!, $repo: String!, $number: Int!) {
      repository(owner: $owner, name: $repo) {
        issue(number: $number) {
          subIssues(first: 100) {
            nodes {
              number
              title
              state
              url
            }
          }
        }
      }
    }' --jq '[.data.repository.issue.subIssues.nodes[] | {number, title, state, url}]'
