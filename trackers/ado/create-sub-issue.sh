#!/bin/bash
# create-sub-issue.sh — Azure DevOps adapter
# Usage: bash .claude/trackers/active/create-sub-issue.sh <PARENT_ID> "<title>" "<body>" ["<tags>"]
# Creates a new Task work item and links it as a child of the given parent.
# Returns JSON: {"parent": <id>, "child": <id>, "url": "<url>"}
#
# Optional env vars:
#   ADO_WORK_ITEM_TYPE  — child type (default "Task"). A child of a Feature should be the story-level
#                         type for your process ("User Story" on Agile, "Product Backlog Item" on
#                         Scrum) — a Task parented directly to a Feature skips a level.
#   ADO_AREA_PATH       — area path for the new child. A child does NOT inherit its parent's area.
#   ADO_ITERATION_PATH  — iteration path for the new child.
# Both paths are omitted when unset, which lands the item at the project root — created successfully
# but invisible in the team's filtered board views. Set them to control where the child appears.

set -o pipefail

ADO_PROJECT="YOUR_ADO_PROJECT"

PARENT_ID="${1:-}"
TITLE="${2:-}"
BODY="${3:-}"
TAGS="${4:-}"

if [ -z "$PARENT_ID" ] || [ -z "$TITLE" ]; then
  echo '{"error": "Usage: create-sub-issue.sh <PARENT_ID> \"<title>\" \"<body>\" [\"<tags>\"]"}' >&2
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
  --type "${ADO_WORK_ITEM_TYPE:-Task}"
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

CHILD_ID=$(echo "$RAW_JSON" | jq -r '.id')
CHILD_URL=$(echo "$RAW_JSON" | jq -r '.url // ""')

if [ -z "$CHILD_ID" ] || [ "$CHILD_ID" = "null" ]; then
  echo '{"error": "Work item created but no ID returned"}' >&2
  exit 1
fi

with_retry az boards work-item relation add \
  --id "$CHILD_ID" \
  --relation-type "parent" \
  --target-id "$PARENT_ID" \
  --output json >/dev/null

if [[ $? -ne 0 ]]; then
  echo "{\"error\": \"Created work item #${CHILD_ID} but failed to link parent #${PARENT_ID}\"}" >&2
  exit 1
fi

echo "{\"parent\": ${PARENT_ID}, \"child\": ${CHILD_ID}, \"url\": \"${CHILD_URL}\"}"
