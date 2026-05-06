#!/bin/bash
# add-label.sh — Azure DevOps adapter
# Usage: bash .claude/trackers/active/add-label.sh <WORK_ITEM_ID> "<tag>"
# Adds a tag to the specified work item.

ADO_PROJECT="YOUR_ADO_PROJECT"

WORK_ITEM_ID="${1:-}"
TAG="${2:-}"

if [ -z "$WORK_ITEM_ID" ] || [ -z "$TAG" ]; then
  echo '{"error": "Usage: add-label.sh <WORK_ITEM_ID> \"<tag>\""}' >&2
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

# ADO tags are a semicolon-separated field. Read existing, append, update.
EXISTING_TAGS=$(with_retry az boards work-item show \
  --id "$WORK_ITEM_ID" \
  --project "$ADO_PROJECT" \
  --query "fields.\"System.Tags\"" \
  --output tsv 2>/dev/null || echo "")

if echo "$EXISTING_TAGS" | grep -qi "$TAG"; then
  echo "Tag \"$TAG\" already exists on work item #$WORK_ITEM_ID"
  exit 0
fi

if [ -z "$EXISTING_TAGS" ]; then
  NEW_TAGS="$TAG"
else
  NEW_TAGS="$EXISTING_TAGS; $TAG"
fi

with_retry az boards work-item update \
  --id "$WORK_ITEM_ID" \
  --project "$ADO_PROJECT" \
  --fields "System.Tags=$NEW_TAGS" \
  --output none

echo "Added tag \"$TAG\" to work item #$WORK_ITEM_ID"
