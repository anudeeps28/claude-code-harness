#!/bin/bash
# get-issue-children.sh — Azure DevOps adapter
# Usage: bash .claude/trackers/active/get-issue-children.sh <WORK_ITEM_ID>
# Returns all child tasks (Hierarchy-Forward relations) for a given work item ID.

ADO_PROJECT="YOUR_ADO_PROJECT"

ITEM_ID=$1

if [ -z "$ITEM_ID" ]; then
  echo '{"error": "Issue ID required. Usage: get-issue-children.sh <ID>"}' >&2
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

# Source shared libraries
source "$(dirname "$0")/../lib/retry.sh"
source "$(dirname "$0")/../lib/auth-check.sh"
check_auth_ado

RAW_JSON=$(with_retry az boards work-item show --id "$ITEM_ID" --expand relations \
  --project "$ADO_PROJECT" --output json)

if [[ $? -ne 0 ]]; then
  echo "{\"error\": \"Failed to fetch work item $ITEM_ID. Check az CLI auth: az account show\"}" >&2
  exit 1
fi

CHILD_IDS=$(echo "$RAW_JSON" | jq -r \
  '.relations[]? | select(.rel == "System.LinkTypes.Hierarchy-Forward") | .url | split("/") | last' \
  2>/dev/null)

if [ -z "$CHILD_IDS" ]; then
  echo "No child tasks found for work item $ITEM_ID"
  exit 0
fi

echo "# Child tasks for #$ITEM_ID"
echo ""
echo "| ID | Title | State | Description |"
echo "|---|---|---|---|"

for TASK_ID in $CHILD_IDS; do
  TASK_JSON=$(az boards work-item show --id "$TASK_ID" --project "$ADO_PROJECT" --output json 2>/dev/null)
  if [[ $? -eq 0 ]]; then
    echo "$TASK_JSON" | jq -r '
      "| #" + (.id|tostring) +
      " | " + (.fields["System.Title"] // "Untitled") +
      " | " + (.fields["System.State"] // "Unknown") +
      " | " + ((.fields["System.Description"] // "-") | gsub("\n"; " ") | gsub("\\|"; "/")) +
      " |"
    '
  fi
done
