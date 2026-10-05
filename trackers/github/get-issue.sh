#!/bin/bash
# get-issue.sh — GitHub Issues adapter
# Usage: bash .claude/trackers/active/get-issue.sh <ISSUE_NUMBER>
# Returns full details of a single issue: title, body, labels, assignees, state, milestone.

set -o pipefail

ISSUE=$1

if [ -z "$ISSUE" ]; then
  echo '{"error": "Issue number required. Usage: get-issue.sh <ISSUE_NUMBER>"}' >&2
  exit 1
fi

if ! command -v gh &>/dev/null; then
  echo '{"error": "gh CLI not installed. Install from https://cli.github.com"}' >&2
  exit 1
fi

# Source shared libraries
source "$(dirname "$0")/../lib/retry.sh"
source "$(dirname "$0")/../lib/auth-check.sh"
source "$(dirname "$0")/../lib/item-type.sh"
source "$(dirname "$0")/../lib/status.sh"
check_auth_github

# `issueType` is only known to newer gh releases. Asking an older gh for an unknown JSON field
# fails the whole call, which would take this adapter down entirely rather than just omitting a
# field — so probe once and drop it when unsupported. Type then falls back to the "bug" label.
JSON_FIELDS="number,title,body,labels,assignees,state,milestone"
if gh issue view --json 2>&1 | grep -qw "issueType"; then
  JSON_FIELDS="$JSON_FIELDS,issueType"
fi

# Format as readable markdown (consistent with ADO adapter output)
# Type (#32): the native issue type when it maps onto Feature|Story|Bug|Task, else a type:<x>
# label, else a bug label, else Unknown. Status (#30): the status:<s> label set-status.sh writes.
with_retry gh issue view "$ISSUE" --json "$JSON_FIELDS" | jq -r "${ITEM_TYPE_JQ}${STATUS_JQ}"'
  ([.labels[].name]) as $labels
  | ((.issueType // {}).name | harness_type) as $native
  | "# Issue #" + (.number|tostring) + ": " + .title,
  "",
  "**Type:** " + (if $native != "Unknown" then $native else ($labels | type_from_labels) end),
  "**State:** " + .state,
  "**Status:** " + ($labels | status_from_labels),
  "**Assignees:** " + (if (.assignees | length) > 0 then ([.assignees[].login] | join(", ")) else "Unassigned" end),
  "**Labels:** " + (if (.labels | length) > 0 then ([.labels[].name] | join(", ")) else "None" end),
  "**Milestone:** " + (if .milestone then .milestone.title else "None" end),
  "",
  "## Description",
  (.body // "_No description_")
'
