#!/bin/bash
# render-todo.sh — Shared todo.md renderer (D9, D10, D17)
#
# Usage: bash trackers/lib/render-todo.sh [issues_dir]
#
# Reads task files from issues_dir (default: tasks/issues/), generates
# tasks/todo.md with open tasks grouped by label plus recently closed (max 20).
#
# Not run on every tracker write any more: the local adapter scripts call it only when
# LOCAL_RENDER_TODO=1 is set (#66). Run it by hand whenever you want a fresh board.
#
# Determinism: same input → byte-identical output (stable sort by id).
# Bash 3.2 compatible (no associative arrays).
#
# Performance (#66): every file is read in ONE awk pass, then the result is sorted and formatted
# once. The previous version ran several grep|sed pipelines per file, which on Windows Git Bash
# (where starting a process is slow) took ~32s for 47 issues. The process count is now constant.

set -o pipefail

ISSUES_DIR="${1:-tasks/issues}"
TODO_FILE="${TODO_OUTPUT:-tasks/todo.md}"

# Ensure output directory exists
mkdir -p "$(dirname "$TODO_FILE")"

# Use a temp directory for intermediate data
WORK_DIR=$(mktemp -d)
trap 'rm -rf "$WORK_DIR"' EXIT

: > "$WORK_DIR/open"        # label<TAB>id<TAB>title, one row per (open task, label)
: > "$WORK_DIR/closed_all"  # closed_date|id   (same shape the old renderer sorted)
: > "$WORK_DIR/closed_info" # id<TAB>title<TAB>close_reason

# --- Pass 1: one awk process reads every task file ---
# Per file it keeps the FIRST state/title/labels/closed/close_reason line, exactly like the old
# `grep -m1`. Non-numeric filenames are skipped. A trailing CR is stripped so CRLF files parse.
set -- "$ISSUES_DIR"/*.md
if [ -f "$1" ]; then
  awk -v open_out="$WORK_DIR/open" -v closed_out="$WORK_DIR/closed_all" -v info_out="$WORK_DIR/closed_info" '
    function first(key, line,   v) {
      if (!(key in seen)) { seen[key] = 1; v = line; sub("^" key ": *", "", v); val[key] = v }
    }
    function reset() { split("", seen); split("", val) }
    function flush(   id, n, i, parts, label, raw) {
      if (cur == "") return
      id = cur; sub(/.*\//, "", id); sub(/\.md$/, "", id)
      if (id == "" || id ~ /[^0-9]/) { reset(); return }
      if (val["state"] == "open") {
        total_open++
        raw = val["labels"]; sub(/\[/, "", raw); sub(/\]/, "", raw)
        if (raw == "") {
          printf "%s\t%s\t%s\n", "\001", id, val["title"] > open_out
        } else {
          n = split(raw, parts, ",")
          for (i = 1; i <= n; i++) {
            label = parts[i]; sub(/^ */, "", label); sub(/ *$/, "", label)
            if (label == "") continue
            printf "%s\t%s\t%s\n", label, id, val["title"] > open_out
          }
        }
      } else if (val["state"] == "closed") {
        total_closed++
        printf "%s|%s\n", val["closed"], id > closed_out
        printf "%s\t%s\t%s\n", id, val["title"], val["close_reason"] > info_out
      }
      reset()
    }
    FNR == 1 { flush(); cur = FILENAME }
    { sub(/\r$/, "") }
    /^state:/        { first("state", $0) }
    /^title:/        { first("title", $0) }
    /^labels:/       { first("labels", $0) }
    /^closed:/       { first("closed", $0) }
    /^close_reason:/ { first("close_reason", $0) }
    END { flush(); printf "%d %d\n", total_open, total_closed }
  ' "$@" > "$WORK_DIR/counts"
else
  echo "0 0" > "$WORK_DIR/counts"
fi
read -r total_open total_closed < "$WORK_DIR/counts"

# --- Render output ---
{
  echo "<!-- AUTO-GENERATED — do not edit. -->"
  echo ""
  echo "# Task Board"
  echo ""
  echo "_${total_open} open, ${total_closed} closed_"
  echo ""

  if [ "$total_open" -eq 0 ]; then
    echo "_No open tasks._"
    echo ""
  else
    # Label groups sorted by name with the same `sort` the old renderer applied to its label file
    # names; within a group, by numeric id. The unlabeled group (key \001) always comes last.
    cut -f1 "$WORK_DIR/open" | grep -v "^$(printf '\001')\$" | sort -u > "$WORK_DIR/label_order"
    awk -F'\t' -v order="$WORK_DIR/label_order" '
      function emit(key, heading,   n, i, j, k, lines, tmp) {
        printf "## %s\n\n", heading
        n = split(rows[key], lines, "\n") - 1   # rows end in "\n", so the last element is empty
        for (i = 2; i <= n; i++) {              # insertion sort by numeric id (groups are small)
          for (j = i; j > 1 && idof(lines[j]) < idof(lines[j-1]); j--) {
            tmp = lines[j]; lines[j] = lines[j-1]; lines[j-1] = tmp
          }
        }
        for (i = 1; i <= n; i++) {
          k = index(lines[i], "\t")
          printf "- [ ] #%s — %s\n", substr(lines[i], 1, k - 1), substr(lines[i], k + 1)
        }
        printf "\n"
      }
      function idof(line) { return substr(line, 1, index(line, "\t") - 1) + 0 }
      BEGIN { while ((getline l < order) > 0) labels[++nl] = l }
      { rows[$1] = rows[$1] $2 "\t" $3 "\n" }
      END {
        for (i = 1; i <= nl; i++) emit(labels[i], labels[i])
        if ("\001" in rows) emit("\001", "Unlabeled")
      }
    ' "$WORK_DIR/open"
  fi

  # Recently closed section (most recent 20 by closed date)
  if [ -s "$WORK_DIR/closed_all" ]; then
    echo "---"
    echo ""
    echo "## Recently Closed"
    echo ""
    sort -r "$WORK_DIR/closed_all" | head -20 | awk -F'|' -v info="$WORK_DIR/closed_info" '
      BEGIN { while ((getline l < info) > 0) { split(l, f, "\t"); title[f[1]] = f[2]; reason[f[1]] = f[3] } }
      {
        id = $NF; r = reason[id]
        suffix = (r != "" && r != "null") ? " (" r ")" : ""
        printf "- [x] #%s — %s%s\n", id, title[id], suffix
      }
    '
    echo ""
  fi
} > "$WORK_DIR/output.md"

mv "$WORK_DIR/output.md" "$TODO_FILE"
