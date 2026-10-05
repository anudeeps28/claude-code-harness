#!/bin/bash
# status.sh — the four harness statuses, shared by every adapter's set-status.sh (#30, #31).
#
#   in-progress   a build is working on the item
#   in-review     the build is done and its review has started
#   needs-person  the run stopped on something only a person can decide
#   done          the build finished and its PR is open
#
# Statuses are harness words. Each adapter maps them to its own mechanism (a frontmatter field, a
# `status:<s>` label, an ADO state and board column); callers never pass a tracker's native state.
#
# Sourced, not run.

HARNESS_STATUSES="in-progress, in-review, needs-person, done"

# require_status <status>  — returns 1 with a JSON error listing the statuses when it is not one.
require_status() {
  case "$1" in
    in-progress|in-review|needs-person|done) return 0 ;;
  esac
  local shown="${1//\"/\'}"
  echo "{\"error\": \"status must be one of ${HARNESS_STATUSES} (got '${shown:0:40}')\"}" >&2
  return 1
}

# The jq side: the current status from a list of label names ("status:<s>"), or "None".
# shellcheck disable=SC2016
STATUS_JQ='
def status_from_labels:
  ([.[] | select(startswith("status:")) | .[7:]
    | select(. == "in-progress" or . == "in-review" or . == "needs-person" or . == "done")] | first) // "None";
'
