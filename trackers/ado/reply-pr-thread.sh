#!/bin/bash
# reply-pr-thread.sh — Azure DevOps adapter
# Usage: bash .claude/trackers/active/reply-pr-thread.sh <PR_ID> <THREAD_ID> "Reply text"
# Posts a reply comment to a specific PR thread.

ADO_PROJECT="YOUR_ADO_PROJECT"
ADO_REPO="YOUR_ADO_REPO"

PR_ID=$1
THREAD_ID=$2
REPLY_TEXT=$3

if [ -z "$PR_ID" ] || [ -z "$THREAD_ID" ] || [ -z "$REPLY_TEXT" ]; then
  echo '{"error": "All 3 args required. Usage: reply-pr-thread.sh <PR_ID> <THREAD_ID> <REPLY_TEXT>"}' >&2
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

if ! command -v jq &>/dev/null; then
  echo '{"error": "jq is required. Install from https://jqlang.github.io/jq/download/"}' >&2
  exit 1
fi

# Source shared libraries
source "$(dirname "$0")/../lib/retry.sh"
source "$(dirname "$0")/../lib/auth-check.sh"
check_auth_ado

TMPFILE=$(mktemp /tmp/reply-pr-thread-XXXXXX.json)
trap "rm -f $TMPFILE" EXIT

# Use jq for safe JSON string escaping (replaces node dependency)
ESCAPED_TEXT=$(printf '%s' "$REPLY_TEXT" | jq -Rs '.')

echo "{\"content\": $ESCAPED_TEXT, \"commentType\": \"text\"}" > "$TMPFILE"

with_retry az devops invoke \
  --area git \
  --resource pullRequestThreadComments \
  --route-parameters \
    project="$ADO_PROJECT" \
    repositoryId=$ADO_REPO \
    pullRequestId=$PR_ID \
    threadId=$THREAD_ID \
  --api-version 7.1 \
  --http-method POST \
  --in-file "$TMPFILE"
