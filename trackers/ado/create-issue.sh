#!/bin/bash
# create-issue.sh — Azure DevOps adapter
# Usage: bash .claude/trackers/active/create-issue.sh "<title>" "<body>" "<tags>"
# Returns the created work item ID and URL.

ADO_PROJECT="YOUR_ADO_PROJECT"

TITLE="${1:-}"
BODY="${2:-}"
TAGS="${3:-needs-triage}"

if [ -z "$TITLE" ]; then
  echo '{"error": "Title required. Usage: create-issue.sh \"<title>\" \"<body>\" \"<tags>\""}' >&2
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

RAW_JSON=$(with_retry az boards work-item create \
  --title "$TITLE" \
  --description "$BODY" \
  --type "User Story" \
  --project "$ADO_PROJECT" \
  --tags "$TAGS" \
  --output json)

if [[ $? -ne 0 ]]; then
  echo '{"error": "Failed to create work item. Check az CLI auth: az account show"}' >&2
  exit 1
fi

echo "$RAW_JSON" | jq -r '"Created work item #" + (.id|tostring) + ": " + (.url // "")'
