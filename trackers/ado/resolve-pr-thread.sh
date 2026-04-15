#!/bin/bash
# resolve-pr-thread.sh — Azure DevOps adapter
# Usage: bash .claude/trackers/active/resolve-pr-thread.sh <PR_ID> <THREAD_ID>
# Resolves (marks as "fixed") a specific PR thread.

ADO_PROJECT="YOUR_ADO_PROJECT"
ADO_REPO="YOUR_ADO_REPO"

PR_ID=$1
THREAD_ID=$2

if [ -z "$PR_ID" ] || [ -z "$THREAD_ID" ]; then
  echo '{"error": "Both args required. Usage: resolve-pr-thread.sh <PR_ID> <THREAD_ID>"}' >&2
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

TMPFILE=$(mktemp /tmp/resolve-pr-thread-XXXXXX.json)
trap "rm -f $TMPFILE" EXIT

echo '{"status": "fixed"}' > "$TMPFILE"

with_retry az devops invoke \
  --area git \
  --resource pullRequestThreads \
  --route-parameters \
    project="$ADO_PROJECT" \
    repositoryId=$ADO_REPO \
    pullRequestId=$PR_ID \
    threadId=$THREAD_ID \
  --api-version 7.1 \
  --http-method PATCH \
  --in-file "$TMPFILE"
