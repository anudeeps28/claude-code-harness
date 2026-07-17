#!/bin/bash
# add-blocker.sh — Azure DevOps adapter
# Usage: bash .claude/trackers/active/add-blocker.sh <WORK_ITEM_ID> <BLOCKER_ID>
# Records that <WORK_ITEM_ID> is blocked by <BLOCKER_ID> using ADO's native
# predecessor/successor dependency link (the blocker becomes a predecessor).

set -o pipefail

ADO_PROJECT="YOUR_ADO_PROJECT"

WORK_ITEM_ID="${1:-}"
BLOCKER_ID="${2:-}"

if [ -z "$WORK_ITEM_ID" ] || [ -z "$BLOCKER_ID" ]; then
  echo '{"error": "Usage: add-blocker.sh <WORK_ITEM_ID> <BLOCKER_ID>"}' >&2
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

RAW_JSON=$(with_retry az boards work-item relation add \
  --id "$WORK_ITEM_ID" \
  --relation-type "predecessor" \
  --target-id "$BLOCKER_ID" \
  --output json)

if [[ $? -ne 0 ]]; then
  echo '{"error": "Failed to add dependency link. Check az CLI auth: az account show"}' >&2
  exit 1
fi

echo "Work item #${WORK_ITEM_ID} is now blocked by #${BLOCKER_ID}"
