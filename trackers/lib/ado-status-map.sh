#!/bin/bash
# ado-status-map.sh — reads the ADO board mapping for the harness statuses (#31).
#
# On ADO a status is a board **state and column**, and a column is not a state: "Not Started" and
# "Queued" can both be state New. So each status maps to both, per board, in tasks/tracker-config.md:
#
#   ado_board_column_field = WEF_<guid>_Kanban.Column
#   ado_status.in-progress  = Active   | Doing
#   ado_status.in-review    = Resolved | Review
#   ado_status.needs-person = Active   | Blocked
#   ado_status.done         = Closed   | Done
#
# The column part is optional per line ("= Active" alone writes the state only).
#
# Sourced, not run. TRACKER_CONFIG_FILE overrides the path (tests).

ADO_CONFIG_FILE="${TRACKER_CONFIG_FILE:-tasks/tracker-config.md}"

_ado_trim() {
  local s="$1"
  s="${s//$'\r'/}"
  s="${s#"${s%%[![:space:]]*}"}"
  s="${s%"${s##*[![:space:]]}"}"
  TRIMMED="$s"
}

# ado_column_field  — sets ADO_COLUMN_FIELD (empty when not configured).
ado_column_field() {
  ADO_COLUMN_FIELD=""
  [ -f "$ADO_CONFIG_FILE" ] || return 0
  local line
  while IFS= read -r line || [ -n "$line" ]; do
    if [[ "$line" =~ ^[[:space:]]*ado_board_column_field[[:space:]]*=(.*)$ ]]; then
      _ado_trim "${BASH_REMATCH[1]}"
      ADO_COLUMN_FIELD="$TRIMMED"
    fi
  done < "$ADO_CONFIG_FILE"
}

# ado_status_entry <status>  — sets MAP_STATE and MAP_COLUMN; returns 1 when there is no entry.
ado_status_entry() {
  MAP_STATE=""
  MAP_COLUMN=""
  [ -f "$ADO_CONFIG_FILE" ] || return 1
  local line value found=1
  while IFS= read -r line || [ -n "$line" ]; do
    if [[ "$line" =~ ^[[:space:]]*ado_status\.([a-z-]+)[[:space:]]*=(.*)$ ]] && [ "${BASH_REMATCH[1]}" = "$1" ]; then
      value="${BASH_REMATCH[2]}"
      _ado_trim "${value%%|*}"; MAP_STATE="$TRIMMED"
      if [[ "$value" == *"|"* ]]; then _ado_trim "${value#*|}"; MAP_COLUMN="$TRIMMED"; fi
      [ -n "$MAP_STATE" ] && found=0
    fi
  done < "$ADO_CONFIG_FILE"
  return $found
}

# ado_status_for <state> <column>  — sets ADO_STATUS to the harness status whose entry matches
# both (column ignored when the entry has none), or None.
ado_status_for() {
  ADO_STATUS="None"
  local s
  for s in in-progress in-review needs-person done; do
    if ado_status_entry "$s" && [ "$MAP_STATE" = "$1" ] && { [ -z "$MAP_COLUMN" ] || [ "$MAP_COLUMN" = "$2" ]; }; then
      ADO_STATUS="$s"
      return 0
    fi
  done
}
