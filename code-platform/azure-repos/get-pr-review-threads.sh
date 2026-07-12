#!/bin/bash
# get-pr-review-threads.sh — Azure Repos adapter
# Usage: bash .claude/code-platform/active/get-pr-review-threads.sh <PR_ID>
# Returns all active Code Rabbit threads from a PR.
# Output: JSON array [{id, threadId, file, line, content, author}]

ADO_PROJECT="YOUR_ADO_PROJECT"
ADO_REPO="YOUR_ADO_REPO"

PR_ID=$1

if [ -z "$PR_ID" ]; then
  echo '{"error": "PR ID required. Usage: get-pr-review-threads.sh <PR_ID>"}' >&2
  exit 1
fi

if [[ "$ADO_PROJECT" == "YOUR_ADO_PROJECT" ]]; then
  echo '{"error": "ADO_PROJECT not configured. Run the installer or edit this script directly."}' >&2
  exit 1
fi

if [[ "$ADO_REPO" == "YOUR_ADO_REPO" ]]; then
  echo '{"error": "ADO_REPO not configured. Run the installer or edit this script directly."}' >&2
  exit 1
fi

if ! command -v az &>/dev/null; then
  echo '{"error": "az CLI not installed. Install from https://aka.ms/installazurecli"}' >&2
  exit 1
fi

# Source shared libraries
source "$(dirname "$0")/../lib/retry.sh"
source "$(dirname "$0")/../lib/auth-check.sh"
check_auth_ado

# Fetch threads and map to the standard code-platform output schema:
# {id, threadId, file, line, content, author}
# threadId = id (ADO uses thread IDs directly for resolve/reply)
# line = lineStart (first line of the thread context)
# author = first comment's author displayName
with_retry az devops invoke \
  --area git \
  --resource pullRequestThreads \
  --route-parameters \
    project="$ADO_PROJECT" \
    repositoryId=$ADO_REPO \
    pullRequestId=$PR_ID \
  --api-version 7.1 \
  --query "value[?status=='active' && comments[0].author.displayName=='Code Rabbit'].{id:id, threadId:to_string(id), file:threadContext.filePath, line:threadContext.rightFileStart.line, content:comments[0].content, author:comments[0].author.displayName}"
