#!/bin/bash
# list-issues.sh — Todoist adapter
# Usage: bash .claude/trackers/active/list-issues.sh
# Returns open tasks in the configured project (scoped to the configured
# section when set) as a JSON array.
# Output: JSON array [{id, title, state, labels, assignees, url}]
#
# Config is read from tasks/tracker-config.md:
#   todoist_project         = <project-name>
#   todoist_default_section = <section-name>   (optional)

source "$(dirname "$0")/../lib/retry.sh"
source "$(dirname "$0")/../lib/auth-check.sh"
check_auth_todoist

td="${TODOIST_CLI:-td}"

# --- read scope from config (internal spaces preserved) ---
TODOIST_PROJECT=""
TODOIST_SECTION=""
if [ -f "tasks/tracker-config.md" ]; then
  _proj=$(grep -i "todoist_project[[:space:]]*=" tasks/tracker-config.md | sed 's/.*=[[:space:]]*//; s/[[:space:]]*$//' | tr -d '\r')
  [ -n "$_proj" ] && [ "$_proj" != "YOUR_TODOIST_PROJECT" ] && TODOIST_PROJECT="$_proj"
  _sec=$(grep -i "todoist_default_section[[:space:]]*=" tasks/tracker-config.md | sed 's/.*=[[:space:]]*//; s/[[:space:]]*$//' | tr -d '\r')
  [ -n "$_sec" ] && TODOIST_SECTION="$_sec"
fi

# --- resolve section name -> id (td list cannot filter by section) ---
SECTION_ID=""
if [ -n "$TODOIST_SECTION" ] && [ -n "$TODOIST_PROJECT" ]; then
  SECTION_ID=$(with_retry "$td" section list --project "$TODOIST_PROJECT" --json \
    | jq -r --arg n "$TODOIST_SECTION" '(.results // .)[] | select(.name==$n) | .id' | head -1)
fi

# --- list tasks ---
if [ -n "$TODOIST_PROJECT" ]; then
  RESULT=$(with_retry "$td" task list --project "$TODOIST_PROJECT" --json)
else
  RESULT=$(with_retry "$td" task list --json)
fi

if [ $? -ne 0 ] || [ -z "$RESULT" ]; then
  echo '{"error": "Failed to list tasks from Todoist"}' >&2
  exit 1
fi

echo "$RESULT" | jq --arg sid "$SECTION_ID" '
  [ (.results // .)[]
    | select($sid == "" or .sectionId == $sid)
    | {id: .id, title: .content, state: "open", labels: (.labels // []), assignees: [], url: .url} ]'
