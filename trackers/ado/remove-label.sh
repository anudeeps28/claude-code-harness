#!/bin/bash
# remove-label.sh — Azure DevOps adapter
# Usage: bash .claude/trackers/active/remove-label.sh <WORK_ITEM_ID> "<tag>"
# Removes a tag from the specified work item.

ADO_PROJECT="YOUR_ADO_PROJECT"

WORK_ITEM_ID="${1:-}"
TAG="${2:-}"

if [ -z "$WORK_ITEM_ID" ] || [ -z "$TAG" ]; then
  echo '{"error": "Usage: remove-label.sh <WORK_ITEM_ID> \"<tag>\""}' >&2
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

# ADO tags are a semicolon-separated field. Read existing, remove match, update.
EXISTING_TAGS=$(with_retry az boards work-item show \
  --id "$WORK_ITEM_ID" \
  --project "$ADO_PROJECT" \
  --query "fields.\"System.Tags\"" \
  --output tsv 2>/dev/null || echo "")

if [ -z "$EXISTING_TAGS" ]; then
  echo "No tags on work item #$WORK_ITEM_ID"
  exit 0
fi

# Remove the tag (case-insensitive), then clean up separators
NEW_TAGS=$(echo "$EXISTING_TAGS" | sed "s/[;,] *$TAG//gi" | sed "s/$TAG[;,] *//gi" | sed "s/$TAG//gi" | sed 's/^[; ]*//;s/[; ]*$//')

with_retry az boards work-item update \
  --id "$WORK_ITEM_ID" \
  --project "$ADO_PROJECT" \
  --fields "System.Tags=$NEW_TAGS" \
  --output none

echo "Removed tag \"$TAG\" from work item #$WORK_ITEM_ID"
