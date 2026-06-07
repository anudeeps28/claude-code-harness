#!/bin/bash
# create-sub-issue.sh — GitHub Issues adapter
# Usage: bash .claude/trackers/active/create-sub-issue.sh <PARENT_NUMBER> "<title>" "<body>" "<label>"
# Creates a new issue and links it as a sub-issue of the given parent.
# Returns JSON: {"parent": <number>, "child": <number>, "url": "<url>"}

set -o pipefail

PARENT_NUM="${1:-}"
TITLE="${2:-}"
BODY="${3:-}"
LABEL="${4:-}"

if [ -z "$PARENT_NUM" ] || [ -z "$TITLE" ]; then
  echo '{"error": "Usage: create-sub-issue.sh <PARENT_NUMBER> \"<title>\" \"<body>\" [\"<label>\"]"}' >&2
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

LABEL_FLAG=""
if [ -n "$LABEL" ]; then
  LABEL_FLAG="--label $LABEL"
fi

CHILD_URL=$(with_retry gh issue create \
  --title "$TITLE" \
  --body "$BODY" \
  $LABEL_FLAG 2>&1 | tail -1)

if [ -z "$CHILD_URL" ]; then
  echo '{"error": "Failed to create child issue"}' >&2
  exit 1
fi

CHILD_NUM=$(echo "$CHILD_URL" | grep -o '[0-9]*$')

PARENT_ID=$(with_retry gh api graphql \
  -f owner="$OWNER" -f repo="$REPO" -F number="$PARENT_NUM" \
  -f query='query($owner:String!,$repo:String!,$number:Int!){
    repository(owner:$owner,name:$repo){issue(number:$number){id}}
  }' --jq '.data.repository.issue.id')

CHILD_ID=$(with_retry gh api graphql \
  -f owner="$OWNER" -f repo="$REPO" -F number="$CHILD_NUM" \
  -f query='query($owner:String!,$repo:String!,$number:Int!){
    repository(owner:$owner,name:$repo){issue(number:$number){id}}
  }' --jq '.data.repository.issue.id')

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
    }' --jq '{parent: .data.addSubIssue.issue.number, child: .data.addSubIssue.subIssue.number, url: .data.addSubIssue.subIssue.url}'
