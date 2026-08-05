#!/bin/bash
# create-issue.sh — Azure DevOps adapter
# Usage: bash .claude/trackers/active/create-issue.sh "<title>" "<body>" "<tags>"
# Returns the created work item ID and URL.
#
# Optional env vars:
#   ADO_WORK_ITEM_TYPE  — work item type (default "User Story"). Creating a parent Feature needs
#                         ADO_WORK_ITEM_TYPE="Feature". Note the valid types depend on the project's
#                         process: Agile has "User Story", Scrum has "Product Backlog Item" and
#                         rejects "User Story" server-side with VS402323. An env var is used rather
#                         than a 4th positional arg because arg4 is the milestone slot in the GitHub
#                         adapter and the SECTION slot in the Todoist adapter.
#   ADO_AREA_PATH       — area path for the new item.
#   ADO_ITERATION_PATH  — iteration path for the new item.
# Both paths are omitted when unset, which lands the item at the project root — created successfully
# but invisible in the team's filtered board/backlog views. Set them to control where it appears.

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

CREATE_ARGS=(az boards work-item create
  --title "$TITLE"
  --description "$BODY"
  --type "${ADO_WORK_ITEM_TYPE:-User Story}"
  --project "$ADO_PROJECT"
  --output json)

if [ -n "${ADO_AREA_PATH:-}" ]; then
  CREATE_ARGS+=(--area "$ADO_AREA_PATH")
fi

if [ -n "${ADO_ITERATION_PATH:-}" ]; then
  CREATE_ARGS+=(--iteration "$ADO_ITERATION_PATH")
fi

# NOTE: `az boards work-item create` has NO --tags argument (verified against azure-devops ext 1.0.2
# and 1.0.6) — passing it fails with "unrecognized arguments". Tags go through --fields as the
# semicolon-separated System.Tags field. (`work-item update` does accept --fields the same way.)
if [ -n "$TAGS" ]; then
  CREATE_ARGS+=(--fields "System.Tags=$TAGS")
fi

RAW_JSON=$(with_retry "${CREATE_ARGS[@]}")

if [[ $? -ne 0 ]]; then
  echo '{"error": "Failed to create work item. Check az CLI auth: az account show"}' >&2
  exit 1
fi

echo "$RAW_JSON" | jq -r '"Created work item #" + (.id|tostring) + ": " + (.url // "")'
