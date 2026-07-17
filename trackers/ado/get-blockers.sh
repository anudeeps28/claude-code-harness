#!/bin/bash
# get-blockers.sh — Azure DevOps adapter
# Usage: bash .claude/trackers/active/get-blockers.sh <WORK_ITEM_ID>
# Prints the IDs of work items blocking <WORK_ITEM_ID> as a JSON array,
# e.g. [12, 14]. Blockers are predecessor dependency links
# (System.LinkTypes.Dependency-Reverse).

set -o pipefail

ADO_PROJECT="YOUR_ADO_PROJECT"

WORK_ITEM_ID="${1:-}"

if [ -z "$WORK_ITEM_ID" ]; then
  echo '{"error": "Usage: get-blockers.sh <WORK_ITEM_ID>"}' >&2
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

RAW_JSON=$(with_retry az boards work-item show \
  --id "$WORK_ITEM_ID" \
  --expand relations \
  --output json)

if [[ $? -ne 0 ]]; then
  echo '{"error": "Failed to fetch work item relations. Check az CLI auth: az account show"}' >&2
  exit 1
fi

echo "$RAW_JSON" | jq -c '[.relations // [] | .[] | select(.rel == "System.LinkTypes.Dependency-Reverse") | .url | capture("/workItems/(?<id>[0-9]+)$").id | tonumber]'
