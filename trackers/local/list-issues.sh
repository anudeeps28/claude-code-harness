#!/bin/bash
# list-issues.sh — Local tracker adapter
# Usage: bash .claude/trackers/active/list-issues.sh
# Returns all open tasks as a JSON array.
# Output: JSON array [{id, title, state, labels, assignees, url}]
#
# Performance (#66): all files are read in one awk pass and sorted once. The previous version
# ran about seven processes per file, which took ~79s for 68 issues on Windows Git Bash.

set -o pipefail

source "$(dirname "$0")/../lib/retry.sh"
source "$(dirname "$0")/../lib/auth-check.sh"
check_auth_local

ISSUES_DIR="${LOCAL_ISSUES_DIR:-tasks/issues}"

# Regenerate todo.md only on request (LOCAL_RENDER_TODO=1) — a rebuild costs ~30s on Windows (#66)
RENDER_SCRIPT="$(dirname "$0")/../lib/render-todo.sh"
if [ "${LOCAL_RENDER_TODO:-0}" = "1" ] && [ -f "$RENDER_SCRIPT" ]; then
  bash "$RENDER_SCRIPT" "$ISSUES_DIR" 2>/dev/null || true
fi

set -- "$ISSUES_DIR"/*.md
if [ ! -f "$1" ]; then
  echo "[]"
  exit 0
fi

# One row per open task: "<id><TAB><json object>". Sorted by numeric id, then joined.
# Per file it keeps the FIRST state/title/labels/assignee line (as the old grep -m1 did) with a
# trailing CR stripped. Non-numeric file names are skipped: their id would not be valid JSON.
awk '
  function esc(s) { gsub(/\\/, "\\\\", s); gsub(/"/, "\\\"", s); return s }
  function flush(   id, raw, n, i, parts, label, labels, assignees) {
    if (cur == "") return
    id = cur; sub(/.*\//, "", id); sub(/\.md$/, "", id)
    if (id ~ /^[0-9]+$/ && val["state"] == "open") {
      raw = val["labels"]; sub(/\[/, "", raw); sub(/\]/, "", raw)
      labels = ""
      n = split(raw, parts, ",")
      for (i = 1; i <= n; i++) {
        label = parts[i]; gsub(/^ +| +$/, "", label)
        if (label == "") continue
        labels = labels (labels == "" ? "" : ",") "\"" esc(label) "\""
      }
      assignees = "[]"
      if (("assignee" in val) && val["assignee"] != "" && val["assignee"] != "null")
        assignees = "[\"" esc(val["assignee"]) "\"]"
      printf "%s\t{\"id\":%s,\"title\":\"%s\",\"state\":\"open\",\"labels\":[%s],\"assignees\":%s,\"url\":\"%s\"}\n", \
        id, id, esc(val["title"]), labels, assignees, esc(cur)
    }
    split("", val)
  }
  FNR == 1 { flush(); cur = FILENAME }
  { sub(/\r$/, "") }
  /^state:/    && !("state"    in val) { v = $0; sub(/^state: */, "", v);    val["state"]    = v }
  /^title:/    && !("title"    in val) { v = $0; sub(/^title: */, "", v);    val["title"]    = v }
  /^labels:/   && !("labels"   in val) { v = $0; sub(/^labels: */, "", v);   val["labels"]   = v }
  /^assignee:/ && !("assignee" in val) { v = $0; sub(/^assignee: */, "", v); val["assignee"] = v }
  END { flush() }
' "$@" | sort -t"$(printf '\t')" -k1,1n | awk -F'\t' '
  BEGIN { printf "[" }
  { printf "%s%s", (NR > 1 ? "," : ""), $2 }
  END { print "]" }
'
