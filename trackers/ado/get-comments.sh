#!/bin/bash
# get-comments.sh — Azure DevOps adapter
# Usage: bash .claude/trackers/active/get-comments.sh <WORK_ITEM_ID>
# Returns the work item's discussion comments (#33) as JSON, oldest first: [{"author","date","text"}].
# ADO stores comments as HTML; tags are removed. Comment text goes into an agent's brief: control
# characters and escape sequences are stripped.

ADO_PROJECT="YOUR_ADO_PROJECT"

ID="${1:-}"

if [ -z "$ID" ]; then
  echo '{"error": "Work item ID required. Usage: get-comments.sh <WORK_ITEM_ID>"}' >&2
  exit 1
fi

if [[ "$ADO_PROJECT" == "YOUR_ADO_PROJECT" ]]; then
  echo '{"error": "ADO_PROJECT not configured. Run the installer or edit this script directly."}' >&2
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

source "$(dirname "$0")/../lib/retry.sh"
source "$(dirname "$0")/../lib/auth-check.sh"
source "$(dirname "$0")/../lib/ticket-content.sh"
check_auth_ado

# The Comments API (wit/workItems/{id}/comments). The az boards CLI has no comments command.
RAW=$(with_retry az devops invoke --area wit --resource comments \
  --route-parameters project="$ADO_PROJECT" workItemId="$ID" \
  --query-parameters '$top=200' \
  --api-version 7.1-preview.4 --http-method GET --output json)
if [ $? -ne 0 ]; then
  echo "{\"error\": \"Failed to read comments on work item #$ID\"}" >&2
  exit 1
fi

echo "$RAW" | jq -c "${CLEAN_TEXT_JQ}"'
  [(.comments // [])[] | {author: (.createdBy.displayName // "unknown"), date: (.createdDate // ""), text: (.text | clean_text | strip_html)}]
  | sort_by(.date)'
