#!/bin/bash
# get-issue-children.sh — Local tracker adapter
# Usage: bash .claude/trackers/active/get-issue-children.sh <ID>
# Scans tasks/issues/ for tasks whose parent field matches <ID>.
# Output: markdown-formatted list of children.
#
# Performance (#66): all files are read in one awk pass. The previous version ran three
# grep|sed pipelines per file, which took ~11s for 68 issues on Windows Git Bash.

set -o pipefail

ISSUE_ID="${1:-}"

if [ -z "$ISSUE_ID" ]; then
  echo '{"error": "Task ID required. Usage: get-issue-children.sh <ID>"}' >&2
  exit 1
fi

source "$(dirname "$0")/../lib/retry.sh"
source "$(dirname "$0")/../lib/auth-check.sh"
check_auth_local

ISSUES_DIR="${LOCAL_ISSUES_DIR:-tasks/issues}"

# Verify parent task exists
PARENT_FILE="$ISSUES_DIR/${ISSUE_ID}.md"
if [ ! -f "$PARENT_FILE" ]; then
  echo "{\"error\": \"Task $ISSUE_ID not found at $PARENT_FILE\"}" >&2
  exit 1
fi

echo "# Child Tasks for Task #${ISSUE_ID}"
echo ""

# Same rules as before: every *.md in glob order, the FIRST parent/title/state line of each,
# and the child id is the file name. A trailing CR is stripped so CRLF files match too.
set -- "$ISSUES_DIR"/*.md
awk -v want="$ISSUE_ID" '
  function flush(   id, marker, st) {
    if (cur == "" || !("parent" in val) || val["parent"] != want) { split("", val); return }
    id = cur; sub(/.*\//, "", id); sub(/\.md$/, "", id)
    st = val["state"]
    if (st == "closed") { marker = "x"; closed++ } else { marker = " "; open++ }
    printf "- [%s] #%s %s (%s)\n", marker, id, val["title"], toupper(st)
    found++
    split("", val)
  }
  FNR == 1 { flush(); cur = FILENAME }
  { sub(/\r$/, "") }
  /^parent:/ && !("parent" in val) { v = $0; sub(/^parent: */, "", v); val["parent"] = v }
  /^title:/  && !("title"  in val) { v = $0; sub(/^title: */, "", v);  val["title"]  = v }
  /^state:/  && !("state"  in val) { v = $0; sub(/^state: */, "", v);  val["state"]  = v }
  END {
    flush()
    if (found == 0) {
      printf "_No child tasks found for task #%s._\n", want
    } else {
      printf "\n_Progress: %d/%d complete (%d open)_\n", closed, closed + open, open
    }
  }
' "$@"
