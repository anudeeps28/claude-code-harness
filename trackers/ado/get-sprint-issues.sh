#!/bin/bash
# get-sprint-issues.sh — Azure DevOps adapter
# Usage: bash .claude/trackers/active/get-sprint-issues.sh <SPRINT_NUMBER>
# Returns all User Stories and Tasks in the given sprint. Skips Removed items.
# Output: Markdown with two sections — User Stories and Tasks.

ADO_PROJECT="YOUR_ADO_PROJECT"
ADO_ORG_PATH="YOUR_ADO_ORG_PATH"

SPRINT=$1

if [ -z "$SPRINT" ]; then
  echo '{"error": "Sprint number required. Usage: get-sprint-issues.sh <SPRINT_NUMBER>"}' >&2
  exit 1
fi

if [[ "$ADO_PROJECT" == "YOUR_ADO_PROJECT" ]]; then
  echo '{"error": "ADO_PROJECT not configured. Run the installer or edit this script directly."}' >&2
  exit 1
fi

if [[ "$ADO_ORG_PATH" == "YOUR_ADO_ORG_PATH" ]]; then
  echo '{"error": "ADO_ORG_PATH not configured. Run the installer or edit this script directly."}' >&2
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

echo "# Sprint $SPRINT"
echo ""

echo "## User Stories"
echo ""
echo "| ID | Title | State | Points | Priority |"
echo "|---|---|---|---|---|"

STORIES_JSON=$(with_retry az boards query \
  --wiql "SELECT [System.Id],[System.Title],[System.State],[Microsoft.VSTS.Scheduling.StoryPoints],[Microsoft.VSTS.Common.Priority] FROM WorkItems WHERE [System.IterationPath] = '$ADO_ORG_PATH\Sprint $SPRINT' AND [System.WorkItemType] = 'User Story' AND [System.State] <> 'Removed' ORDER BY [System.Id]" \
  --project "$ADO_PROJECT" --output json 2>/dev/null)

if [[ $? -eq 0 && -n "$STORIES_JSON" ]]; then
  STORY_IDS=$(echo "$STORIES_JSON" | jq -r '.[].id' 2>/dev/null)
  for SID in $STORY_IDS; do
    ITEM=$(az boards work-item show --id "$SID" --project "$ADO_PROJECT" --output json 2>/dev/null)
    if [[ $? -eq 0 ]]; then
      echo "$ITEM" | jq -r '
        "| #" + (.id|tostring) +
        " | " + (.fields["System.Title"] // "Untitled") +
        " | " + (.fields["System.State"] // "?") +
        " | " + ((.fields["Microsoft.VSTS.Scheduling.StoryPoints"] // 0)|tostring) +
        " | " + ((.fields["Microsoft.VSTS.Common.Priority"] // 0)|tostring) +
        " |"
      '
    fi
  done
fi

echo ""
echo "## Tasks"
echo ""
echo "| ID | Parent | Title | State |"
echo "|---|---|---|---|"

TASKS_JSON=$(with_retry az boards query \
  --wiql "SELECT [System.Id],[System.Title],[System.State],[System.Parent] FROM WorkItems WHERE [System.IterationPath] = '$ADO_ORG_PATH\Sprint $SPRINT' AND [System.WorkItemType] = 'Task' ORDER BY [System.Parent],[System.Id]" \
  --project "$ADO_PROJECT" --output json 2>/dev/null)

if [[ $? -eq 0 && -n "$TASKS_JSON" ]]; then
  TASK_IDS=$(echo "$TASKS_JSON" | jq -r '.[].id' 2>/dev/null)
  for TID in $TASK_IDS; do
    ITEM=$(az boards work-item show --id "$TID" --project "$ADO_PROJECT" --output json 2>/dev/null)
    if [[ $? -eq 0 ]]; then
      echo "$ITEM" | jq -r '
        "| #" + (.id|tostring) +
        " | #" + ((.fields["System.Parent"] // 0)|tostring) +
        " | " + (.fields["System.Title"] // "Untitled") +
        " | " + (.fields["System.State"] // "?") +
        " |"
      '
    fi
  done
fi
