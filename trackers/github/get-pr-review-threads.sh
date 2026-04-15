#!/bin/bash
# get-pr-review-threads.sh — GitHub PRs adapter
# Usage: bash .claude/trackers/active/get-pr-review-threads.sh <PR_NUMBER>
# Returns all unresolved inline review comments on a PR.
# Output: JSON array [{id, file, line, body, author}]

PR=$1

if [ -z "$PR" ]; then
  echo '{"error": "PR number required. Usage: get-pr-review-threads.sh <PR_NUMBER>"}' >&2
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

# Fetch review threads via GraphQL to get resolution status
OWNER=$(with_retry gh repo view --json owner --jq '.owner.login')
REPO=$(with_retry gh repo view --json name --jq '.name')

with_retry gh api graphql \
  -f query='
    query($owner:String!, $repo:String!, $pr:Int!) {
      repository(owner:$owner, name:$repo) {
        pullRequest(number:$pr) {
          reviewThreads(first:100) {
            nodes {
              id
              isResolved
              comments(first:1) {
                nodes {
                  databaseId
                  path
                  line
                  body
                  author { login }
                }
              }
            }
          }
        }
      }
    }
  ' \
  -f owner="$OWNER" \
  -f repo="$REPO" \
  -F pr="$PR" \
  --jq '
    [
      .data.repository.pullRequest.reviewThreads.nodes[]
      | select(.isResolved == false)
      | {
          id: .comments.nodes[0].databaseId,
          threadId: .id,
          file: .comments.nodes[0].path,
          line: .comments.nodes[0].line,
          content: .comments.nodes[0].body,
          author: .comments.nodes[0].author.login
        }
    ]
  '
