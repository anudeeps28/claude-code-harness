#!/bin/bash
# list-issues.sh — Local tracker adapter
# Usage: bash .claude/trackers/active/list-issues.sh
# Returns all open tasks as a JSON array.
# Output: JSON array [{id, title, state, labels, assignees, url}]

set -o pipefail

source "$(dirname "$0")/../lib/retry.sh"
source "$(dirname "$0")/../lib/auth-check.sh"
check_auth_local

ISSUES_DIR="${LOCAL_ISSUES_DIR:-tasks/issues}"

# Regenerate todo.md on read (D10: self-healing)
RENDER_SCRIPT="$(dirname "$0")/../lib/render-todo.sh"
if [ -x "$RENDER_SCRIPT" ] || [ -f "$RENDER_SCRIPT" ]; then
  bash "$RENDER_SCRIPT" "$ISSUES_DIR" 2>/dev/null || true
fi

# Collect all open tasks sorted by ID
first=true
echo -n "["

for f in $(ls "$ISSUES_DIR"/*.md 2>/dev/null | sort -t/ -k3 -n); do
  [ -f "$f" ] || continue

  state=$(grep -m1 '^state:' "$f" | sed 's/^state: *//')
  [ "$state" = "open" ] || continue

  id=$(basename "$f" .md)
  title=$(grep -m1 '^title:' "$f" | sed 's/^title: *//')
  labels_raw=$(grep -m1 '^labels:' "$f" | sed 's/^labels: *//;s/\[//;s/\]//')

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

  # Escape title for JSON (handle double quotes)
  escaped_title=$(echo "$title" | sed 's/"/\\"/g')

  if [ "$first" = "true" ]; then
    first=false
  else
    echo -n ","
  fi

  echo -n "{\"id\":${id},\"title\":\"${escaped_title}\",\"state\":\"open\",\"labels\":${labels_json},\"assignees\":[],\"url\":\"${f}\"}"
done

echo "]"
