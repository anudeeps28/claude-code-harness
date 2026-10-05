#!/bin/bash
# get-comments.sh — Local tracker adapter
# Usage: bash .claude/trackers/active/get-comments.sh <ID>
# Returns the task's comments (#33) as JSON, oldest first: [{"author","date","text"}].
# Comments are the "**Comment (<timestamp>):** <text>" blocks comment-issue.sh appends to the file;
# a comment runs until the next one. The local tracker has no users, so author is "local".
# Comment text goes into an agent's brief: control characters and escape sequences are stripped.

set -o pipefail

ISSUE_ID="${1:-}"

if [ -z "$ISSUE_ID" ]; then
  echo '{"error": "Task ID required. Usage: get-comments.sh <ID>"}' >&2
  exit 1
fi

source "$(dirname "$0")/../lib/retry.sh"
source "$(dirname "$0")/../lib/auth-check.sh"
check_auth_local

ISSUES_DIR="${LOCAL_ISSUES_DIR:-tasks/issues}"
TASK_FILE="$ISSUES_DIR/${ISSUE_ID}.md"

if [ ! -f "$TASK_FILE" ]; then
  echo "{\"error\": \"Task $ISSUE_ID not found at $TASK_FILE\"}" >&2
  exit 1
fi

# One awk pass, no jq: the local adapter needs no tools beyond bash and awk. The control-character
# patterns are built with sprintf so this runs the same on gawk (Git Bash) and mawk (Ubuntu CI).
awk '
  function clean(t,   i) {
    gsub(esc "\\[[0-9;?]*[ -/]*[@-~]", "", t)
    gsub(esc "[@-_]", "", t)
    for (i = 1; i < 32; i++) if (i != 9 && i != 10) gsub(sprintf("%c", i), "", t)
    gsub(sprintf("%c", 127), "", t)
    return t
  }
  function js(t) {
    gsub(/\\/, "\\\\", t); gsub(/"/, "\\\"", t); gsub(/\t/, "\\t", t); gsub(/\n/, "\\n", t)
    return "\"" t "\""
  }
  function flush() {
    if (date == "") return
    sub(/\n+$/, "", text)
    out = out (n++ ? "," : "") "{\"author\":\"local\",\"date\":" js(date) ",\"text\":" js(clean(text)) "}"
    date = ""
  }
  BEGIN { esc = sprintf("%c", 27); out = ""; n = 0 }
  { sub(/\r$/, "") }
  /^\*\*Comment \([^)]*\):\*\*/ {
    flush()
    date = $0; sub(/^\*\*Comment \(/, "", date); sub(/\):\*\*.*$/, "", date)
    text = $0; sub(/^\*\*Comment \([^)]*\):\*\* ?/, "", text)
    next
  }
  date != "" { text = text "\n" $0 }
  END { flush(); print "[" out "]" }
' "$TASK_FILE"
