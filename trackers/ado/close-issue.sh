#!/bin/bash
# close-issue.sh — Azure DevOps adapter
# Usage: bash .claude/trackers/active/close-issue.sh <WORK_ITEM_ID> ["<state>"]
# Closes the specified work item. Optional state: "Closed" (default), "Resolved", "Removed".

ADO_PROJECT="YOUR_ADO_PROJECT"

WORK_ITEM_ID="${1:-}"
STATE="${2:-Closed}"

if [ -z "$WORK_ITEM_ID" ]; then
  echo '{"error": "Usage: close-issue.sh <WORK_ITEM_ID> [\"<state>\"]"}' >&2
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
  --fields "System.State=$STATE" \
  --output json)

if [[ $? -ne 0 ]]; then
  echo '{"error": "Failed to close work item. Check az CLI auth: az account show"}' >&2
  exit 1
fi

echo "$RAW_JSON" | jq -r '"Closed work item #" + (.id|tostring) + " → " + (.fields."System.State" // "'"$STATE"'")'
