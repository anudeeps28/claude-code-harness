#!/bin/bash
# comment-issue.sh — Azure DevOps adapter
# Usage: bash .claude/trackers/active/comment-issue.sh <WORK_ITEM_ID> "<text>"
# Adds a discussion comment to the specified work item.

set -o pipefail

ADO_PROJECT="YOUR_ADO_PROJECT"

WORK_ITEM_ID="${1:-}"
TEXT="${2:-}"

if [ -z "$WORK_ITEM_ID" ] || [ -z "$TEXT" ]; then
  echo '{"error": "Usage: comment-issue.sh <WORK_ITEM_ID> \"<text>\""}' >&2
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

source "$(dirname "$0")/../lib/retry.sh"
source "$(dirname "$0")/../lib/auth-check.sh"
check_auth_ado

RAW_JSON=$(with_retry az boards work-item update \
  --id "$WORK_ITEM_ID" \
  --project "$ADO_PROJECT" \
  --discussion "$TEXT" \
  --output json)

if [[ $? -ne 0 ]]; then
  echo '{"error": "Failed to comment on work item. Check az CLI auth: az account show"}' >&2
  exit 1
fi

echo "$RAW_JSON" | jq -r '"Commented on work item #" + (.id|tostring)'
