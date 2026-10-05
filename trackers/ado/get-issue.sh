#!/bin/bash
# get-issue.sh — Azure DevOps adapter
# Usage: bash .claude/trackers/active/get-issue.sh <WORK_ITEM_ID>
# Returns full details of a single work item: title, description, acceptance criteria, story points, priority, state.

ADO_PROJECT="YOUR_ADO_PROJECT"

ID=$1

if [ -z "$ID" ]; then
  echo '{"error": "Issue ID required. Usage: get-issue.sh <ID>"}' >&2
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
source "$(dirname "$0")/../lib/item-type.sh"
source "$(dirname "$0")/../lib/ado-status-map.sh"
check_auth_ado

RAW_JSON=$(with_retry az boards work-item show --id "$ID" --project "$ADO_PROJECT" --output json)

if [[ $? -ne 0 ]]; then
  echo "{\"error\": \"Failed to fetch work item $ID. Check az CLI auth: az account show\"}" >&2
  exit 1
fi

# Status (#31): the harness status whose board mapping (tasks/tracker-config.md) matches this
# item's state and column, or None.
ado_column_field
ITEM_STATE=$(echo "$RAW_JSON" | jq -r '.fields["System.State"] // ""')
ITEM_COLUMN=""
[ -n "$ADO_COLUMN_FIELD" ] && ITEM_COLUMN=$(echo "$RAW_JSON" | jq -r --arg f "$ADO_COLUMN_FIELD" '.fields[$f] // ""')
ado_status_for "$ITEM_STATE" "$ITEM_COLUMN"

# Format as readable markdown. Type (#32) is mapped onto Feature|Story|Bug|Task; the native type
# is still shown on its own line, because ADO's word (User Story vs PBI) matters when creating items.
echo "$RAW_JSON" | jq -r --arg status "$ADO_STATUS" "${ITEM_TYPE_JQ}"'
  "# " + (.fields["System.WorkItemType"] // "Item") + " #" + (.id|tostring) + ": " + (.fields["System.Title"] // "Untitled"),
  "",
  "**Type:** " + (.fields["System.WorkItemType"] | harness_type),
  "**Native type:** " + (.fields["System.WorkItemType"] // "Unknown"),
  "**State:** " + (.fields["System.State"] // "Unknown"),
  "**Status:** " + $status,
  "**Priority:** " + ((.fields["Microsoft.VSTS.Common.Priority"] // 0)|tostring),
  "**Story Points:** " + ((.fields["Microsoft.VSTS.Scheduling.StoryPoints"] // 0)|tostring),
  "**Assigned To:** " + (.fields["System.AssignedTo"].displayName // "Unassigned"),
  "",
  "## Description",
  (.fields["System.Description"] // "_No description_"),
  "",
  "## Acceptance Criteria",
  (.fields["Microsoft.VSTS.Common.AcceptanceCriteria"] // "_No acceptance criteria_")
'
