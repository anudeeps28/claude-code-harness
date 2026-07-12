#!/bin/bash
# get-sprint-issues.sh — Local tracker adapter
# Usage: bash .claude/trackers/active/get-sprint-issues.sh <SPRINT_NUMBER>
# Parses the Master Status Table in tasks/sprint<N>.md, resolves IDs to task
# files, and emits a standard JSON list.

set -o pipefail

SPRINT="${1:-}"

if [ -z "$SPRINT" ]; then
  echo '{"error": "Sprint number required. Usage: get-sprint-issues.sh <SPRINT_NUMBER>"}' >&2
  exit 1
fi

source "$(dirname "$0")/../lib/retry.sh"
source "$(dirname "$0")/../lib/auth-check.sh"
check_auth_local

ISSUES_DIR="${LOCAL_ISSUES_DIR:-tasks/issues}"

# Find sprint file: exact match first, then highest-numbered fallback
SPRINT_FILE="tasks/sprint${SPRINT}.md"
if [ ! -f "$SPRINT_FILE" ]; then
  # Fallback: find highest-numbered sprint file
  SPRINT_FILE=""
  for f in tasks/sprint*.md; do
    [ -f "$f" ] || continue
    SPRINT_FILE="$f"
  done
  if [ -z "$SPRINT_FILE" ]; then
    echo "{\"error\": \"No sprint file found for sprint $SPRINT\"}" >&2
    exit 1
  fi
fi

# Parse Master Status Table rows
# Format: | Story ID | Title | SP | Priority | Status | Owner |
# Skip header and separator rows
json_items="[]"

while IFS= read -r line; do
  # Skip non-table rows, header row, separator row, and placeholder rows
  echo "$line" | grep -q '^|' || continue
  echo "$line" | grep -q '^\s*|[-: ]*|' && continue
  echo "$line" | grep -q 'Story ID' && continue
  echo "$line" | grep -q '<!-- ' && continue

  # Extract story ID (first column)
  story_id=$(echo "$line" | awk -F'|' '{print $2}' | sed 's/^ *//;s/ *$//' | sed 's/#//')

  # Skip empty or non-numeric IDs
  [[ "$story_id" =~ ^[0-9]+$ ]] || continue

  # Resolve from task file if it exists, otherwise use table data
  task_file="$ISSUES_DIR/${story_id}.md"
  if [ -f "$task_file" ]; then
    title=$(grep -m1 '^title:' "$task_file" | sed 's/^title: *//')
    state=$(grep -m1 '^state:' "$task_file" | sed 's/^state: *//')
    labels_raw=$(grep -m1 '^labels:' "$task_file" | sed 's/^labels: *//;s/\[//;s/\]//')

    # Build labels JSON array
    labels_json="[]"
    if [ -n "$labels_raw" ]; then
      labels_json=$(echo "$labels_raw" | awk -F', *' '{
        printf "["
        for (i=1; i<=NF; i++) {
          gsub(/^ +| +$/, "", $i)
          if ($i != "") {
            if (i > 1) printf ","
            printf "\"%s\"", $i
          }
        }
        printf "]"
      }')
    fi

    item="{\"id\":${story_id},\"title\":\"${title}\",\"state\":\"${state}\",\"labels\":${labels_json},\"assignees\":[],\"url\":\"${task_file}\"}"
  else
    # Use table data directly
    title=$(echo "$line" | awk -F'|' '{print $3}' | sed 's/^ *//;s/ *$//')
    status=$(echo "$line" | awk -F'|' '{print $6}' | sed 's/^ *//;s/ *$//')

    # Map status table values to open/closed
    state="open"
    if echo "$status" | grep -qi "done"; then
      state="closed"
    fi

    item="{\"id\":${story_id},\"title\":\"${title}\",\"state\":\"${state}\",\"labels\":[],\"assignees\":[],\"url\":\"\"}"
  fi

  json_items=$(echo "$json_items" | sed "s/\]$/, ${item}]/" | sed 's/\[, /[/')

done < "$SPRINT_FILE"

echo "$json_items"
