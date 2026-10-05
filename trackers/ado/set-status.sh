#!/bin/bash
# set-status.sh — Azure DevOps adapter
# Usage: bash .claude/trackers/active/set-status.sh <WORK_ITEM_ID> <in-progress|in-review|needs-person|done>
#
# Moves the card (#31). Each harness status maps to a board state AND column, configured per board in
# tasks/tracker-config.md (see trackers/lib/ado-status-map.sh for the format). Both fields go out in
# ONE update, and are then read back: a write is only reported as done when the work item really
# shows that state and column. ADO has been seen to apply part of an update (a column the board
# does not have) and to write even with validateOnly=true, so a missing read-back would make a failed
# move look like it worked.

ADO_PROJECT="YOUR_ADO_PROJECT"

ID="${1:-}"
STATUS="${2:-}"

if [ -z "$ID" ] || [ -z "$STATUS" ]; then
  echo '{"error": "Usage: set-status.sh <WORK_ITEM_ID> <in-progress|in-review|needs-person|done>"}' >&2
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
source "$(dirname "$0")/../lib/status.sh"
source "$(dirname "$0")/../lib/ado-status-map.sh"

require_status "$STATUS" || exit 1

if [ ! -f "$ADO_CONFIG_FILE" ]; then
  echo "{\"error\": \"No board mapping: $ADO_CONFIG_FILE does not exist. Add ado_board_column_field and ado_status.<status> = <state> | <column> lines to tasks/tracker-config.md.\"}" >&2
  exit 1
fi
if ! ado_status_entry "$STATUS"; then
  echo "{\"error\": \"No board mapping for '$STATUS': add 'ado_status.$STATUS = <state> | <column>' to $ADO_CONFIG_FILE. Nothing was written.\"}" >&2
  exit 1
fi
ado_column_field
if [ -n "$MAP_COLUMN" ] && [ -z "$ADO_COLUMN_FIELD" ]; then
  echo "{\"error\": \"ado_status.$STATUS names column '$MAP_COLUMN' but ado_board_column_field is not set in $ADO_CONFIG_FILE. Nothing was written.\"}" >&2
  exit 1
fi

check_auth_ado

FIELDS=("System.State=$MAP_STATE")
[ -n "$MAP_COLUMN" ] && FIELDS+=("$ADO_COLUMN_FIELD=$MAP_COLUMN")

# No with_retry on the write: a rule error is not transient, and a retried partial write is worse
# than a clear failure. ADO's own message is passed through.
if ! UPDATE_ERR=$(az boards work-item update --id "$ID" --fields "${FIELDS[@]}" --output json 2>&1 >/dev/null); then
  UPDATE_ERR="${UPDATE_ERR//\"/\'}"
  UPDATE_ERR="${UPDATE_ERR//$'\n'/ }"
  echo "{\"error\": \"ADO rejected the update of #$ID to $STATUS: ${UPDATE_ERR}\"}" >&2
  exit 1
fi

# Read back both fields and compare.
READ_BACK=$(with_retry az boards work-item show --id "$ID" --project "$ADO_PROJECT" --output json)
if [ $? -ne 0 ]; then
  echo "{\"error\": \"Updated #$ID but could not read it back to confirm\"}" >&2
  exit 1
fi
GOT_STATE=$(echo "$READ_BACK" | jq -r '.fields["System.State"] // ""')
if [ "$GOT_STATE" != "$MAP_STATE" ]; then
  echo "{\"error\": \"#$ID read back with System.State='$GOT_STATE', expected '$MAP_STATE'\"}" >&2
  exit 1
fi
if [ -n "$MAP_COLUMN" ]; then
  GOT_COLUMN=$(echo "$READ_BACK" | jq -r --arg f "$ADO_COLUMN_FIELD" '.fields[$f] // ""')
  if [ "$GOT_COLUMN" != "$MAP_COLUMN" ]; then
    echo "{\"error\": \"#$ID read back with $ADO_COLUMN_FIELD='$GOT_COLUMN', expected '$MAP_COLUMN' (does the board have that column?)\"}" >&2
    exit 1
  fi
fi

echo "Work item #${ID} status: ${STATUS} (${MAP_STATE}${MAP_COLUMN:+ / $MAP_COLUMN})"
