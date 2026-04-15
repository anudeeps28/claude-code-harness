#!/bin/bash
# resolve-pr-thread.sh — GitHub PRs adapter
# Usage: bash .claude/trackers/active/resolve-pr-thread.sh <PR_NUMBER> <THREAD_NODE_ID>
# Resolves a review thread. THREAD_NODE_ID is the `threadId` returned by get-pr-review-threads.sh.

PR=$1
THREAD_NODE_ID=$2

if [ -z "$PR" ] || [ -z "$THREAD_NODE_ID" ]; then
  echo '{"error": "Both args required. Usage: resolve-pr-thread.sh <PR_NUMBER> <THREAD_NODE_ID>"}' >&2
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

with_retry gh api graphql \
  -f mutation='
    mutation($threadId:ID!) {
      resolveReviewThread(input:{threadId:$threadId}) {
        thread { isResolved }
      }
    }
  ' \
  -f threadId="$THREAD_NODE_ID"
