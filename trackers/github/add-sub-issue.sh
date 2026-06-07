#!/bin/bash
# add-sub-issue.sh — GitHub Issues adapter
# Usage: bash .claude/trackers/active/add-sub-issue.sh <PARENT_NUMBER> <CHILD_NUMBER>
# Links an existing issue as a sub-issue of the given parent.
# Returns JSON: {"parent": <number>, "child": <number>}

set -o pipefail

PARENT_NUM="${1:-}"
CHILD_NUM="${2:-}"

if [ -z "$PARENT_NUM" ] || [ -z "$CHILD_NUM" ]; then
  echo '{"error": "Usage: add-sub-issue.sh <PARENT_NUMBER> <CHILD_NUMBER>"}' >&2
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

get_node_id() {
  local num=$1
  with_retry gh api graphql \
    -f owner="$OWNER" -f repo="$REPO" -F number="$num" \
    -f query='query($owner:String!,$repo:String!,$number:Int!){
      repository(owner:$owner,name:$repo){issue(number:$number){id}}
    }' --jq '.data.repository.issue.id'
}

PARENT_ID=$(get_node_id "$PARENT_NUM")
CHILD_ID=$(get_node_id "$CHILD_NUM")

with_retry gh api graphql \
  -H "GraphQL-Features: sub_issues" \
  -f parentIssueId="$PARENT_ID" \
  -f childIssueId="$CHILD_ID" \
  -f query='
    mutation($parentIssueId: ID!, $childIssueId: ID!) {
      addSubIssue(input: {issueId: $parentIssueId, subIssueId: $childIssueId}) {
        issue { number }
        subIssue { number url }
      }
    }' --jq '{parent: .data.addSubIssue.issue.number, child: .data.addSubIssue.subIssue.number}'
