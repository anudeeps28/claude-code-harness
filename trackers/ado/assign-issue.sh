#!/bin/bash
# assign-issue.sh — Azure DevOps adapter
# Usage: bash .claude/trackers/active/assign-issue.sh <WORK_ITEM_ID> ["<assignee>"]
# Assigns the work item to the given user (claims it). Defaults to the
# signed-in az CLI user.

set -o pipefail

ADO_PROJECT="YOUR_ADO_PROJECT"

WORK_ITEM_ID="${1:-}"
ASSIGNEE="${2:-}"

if [ -z "$WORK_ITEM_ID" ]; then
  echo '{"error": "Usage: assign-issue.sh <WORK_ITEM_ID> [\"<assignee>\"]"}' >&2
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
check_auth_ado

if [ -z "$ASSIGNEE" ]; then
  ASSIGNEE=$(az account show --output json 2>/dev/null | jq -r '.user.name // empty')
  if [ -z "$ASSIGNEE" ]; then
    echo '{"error": "Could not resolve signed-in user. Pass an assignee explicitly."}' >&2
    exit 1
  fi
fi

RAW_JSON=$(with_retry az boards work-item update \
  --id "$WORK_ITEM_ID" \
  --project "$ADO_PROJECT" \
  --assigned-to "$ASSIGNEE" \
  --output json)

if [[ $? -ne 0 ]]; then
  echo '{"error": "Failed to assign work item. Check az CLI auth: az account show"}' >&2
  exit 1
fi

echo "$RAW_JSON" | jq -r --arg fallback "$ASSIGNEE" '"Assigned work item #" + (.id|tostring) + " to " + (.fields."System.AssignedTo".displayName // $fallback)'
