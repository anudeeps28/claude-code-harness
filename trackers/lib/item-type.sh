#!/bin/bash
# item-type.sh — the harness's item types, shared by every adapter (#32).
#
# Every item has one of four types: Feature, Story, Bug, Task. `get-issue.sh` reports one of them,
# or Unknown when the tracker has nothing that maps, on its `**Type:**` line. A tracker's own word
# is mapped onto the four (ADO "User Story" and "Product Backlog Item" are both Story); the native
# word is never passed through, so a crafted value can never reach an agent's brief.
#
# Sourced, not run. Two halves, kept in step by trackers/__tests__/whole-ticket.test.js:
#   - bash, for the local adapter, which needs no jq;
#   - a jq definition (ITEM_TYPE_JQ), for the adapters that already parse JSON with jq.

HARNESS_ITEM_TYPES="Feature, Story, Bug, Task"

# normalize_item_type <raw>  — sets ITEM_TYPE to Feature|Story|Bug|Task, or Unknown.
# Pure bash (no subshell): process start-up is slow on Windows (#66).
normalize_item_type() {
  local raw="$1" had_nocase=0
  raw="${raw//$'\r'/}"
  raw="${raw//$'\n'/}"
  raw="${raw#"${raw%%[![:space:]]*}"}"
  raw="${raw%"${raw##*[![:space:]]}"}"
  shopt -q nocasematch && had_nocase=1
  shopt -s nocasematch
  case "$raw" in
    feature|epic) ITEM_TYPE="Feature" ;;
    story|"user story"|"product backlog item"|pbi|requirement|issue) ITEM_TYPE="Story" ;;
    bug|defect) ITEM_TYPE="Bug" ;;
    task) ITEM_TYPE="Task" ;;
    *) ITEM_TYPE="Unknown" ;;
  esac
  [ "$had_nocase" = 1 ] || shopt -u nocasematch
}

# require_item_type <raw> <var-name-for-the-message>  — for create scripts. Sets ITEM_TYPE to the
# canonical type, or prints a JSON error listing the allowed types and returns 1.
require_item_type() {
  normalize_item_type "$1"
  if [ "$ITEM_TYPE" = "Unknown" ]; then
    local shown="${1//$'\r'/}"
    shown="${shown//$'\n'/ }"
    shown="${shown//\"/\'}"
    echo "{\"error\": \"$2 must be one of ${HARNESS_ITEM_TYPES} (got '${shown:0:60}')\"}" >&2
    return 1
  fi
}

# The same mapping in jq. Use as: jq "${ITEM_TYPE_JQ} ... | harness_type"
# shellcheck disable=SC2016  # $t is a jq variable, not a shell one
ITEM_TYPE_JQ='
def harness_type:
  ((. // "") | tostring | ascii_downcase | gsub("^\\s+|\\s+$"; "")) as $t
  | if ($t == "feature" or $t == "epic") then "Feature"
    elif (["story", "user story", "product backlog item", "pbi", "requirement", "issue"] | index($t)) then "Story"
    elif ($t == "bug" or $t == "defect") then "Bug"
    elif $t == "task" then "Task"
    else "Unknown" end;
# From a list of label names: a "type:<x>" label first, else a "bug" label, else Unknown.
def type_from_labels:
  (map(ascii_downcase)) as $l
  | ([$l[] | select(startswith("type:")) | .[5:] | harness_type | select(. != "Unknown")] | first)
    // (if ($l | index("bug")) then "Bug" else "Unknown" end);
'
