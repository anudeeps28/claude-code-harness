#!/bin/bash
# render-todo.sh — Shared todo.md renderer (D9, D10, D17)
#
# Usage: bash trackers/lib/render-todo.sh [issues_dir]
#
# Reads task files from issues_dir (default: tasks/issues/), generates
# tasks/todo.md with open tasks grouped by label plus recently closed (max 20).
#
# Determinism: same input → byte-identical output (stable sort by id).
# Bash 3.2 compatible (no associative arrays).

set -o pipefail

ISSUES_DIR="${1:-tasks/issues}"
TODO_FILE="${TODO_OUTPUT:-tasks/todo.md}"

# Ensure output directory exists
mkdir -p "$(dirname "$TODO_FILE")"

# Use a temp directory for intermediate data
WORK_DIR=$(mktemp -d)
trap 'rm -rf "$WORK_DIR"' EXIT

mkdir -p "$WORK_DIR/labels"

total_open=0
total_closed=0

# --- Pass 1: collect open tasks ---
for f in "$ISSUES_DIR"/*.md; do
  [ -f "$f" ] || continue
  id=$(basename "$f" .md)
  # Skip non-numeric filenames
  case "$id" in
    *[!0-9]*) continue ;;
  esac

  state=$(grep -m1 '^state:' "$f" | sed 's/^state: *//')
  if [ "$state" = "open" ]; then
    total_open=$((total_open + 1))
    title=$(grep -m1 '^title:' "$f" | sed 's/^title: *//')
    labels_raw=$(grep -m1 '^labels:' "$f" | sed 's/^labels: *//;s/\[//;s/\]//')

    if [ -z "$labels_raw" ]; then
      echo "${id}|${title}" >> "$WORK_DIR/labels/_unlabeled"
    else
      IFS=',' read -ra parts <<< "$labels_raw"
      for part in "${parts[@]}"; do
        label=$(echo "$part" | sed 's/^ *//;s/ *$//')
        [ -z "$label" ] && continue
        echo "${id}|${title}" >> "$WORK_DIR/labels/${label}"
      done
    fi
  elif [ "$state" = "closed" ]; then
    total_closed=$((total_closed + 1))
    closed_date=$(grep -m1 '^closed:' "$f" | sed 's/^closed: *//')
    echo "${closed_date}|${id}" >> "$WORK_DIR/closed_all"
  fi
done

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
    # Print each label group (sorted by label name)
    for label_file in $(ls "$WORK_DIR/labels/" 2>/dev/null | grep -v '^_unlabeled$' | sort); do
      echo "## ${label_file}"
      echo ""
      sort -t'|' -k1 -n "$WORK_DIR/labels/${label_file}" | while IFS='|' read -r tid ttitle; do
        [ -z "$tid" ] && continue
        echo "- [ ] #${tid} — ${ttitle}"
      done
      echo ""
    done

    # Print unlabeled
    if [ -f "$WORK_DIR/labels/_unlabeled" ]; then
      echo "## Unlabeled"
      echo ""
      sort -t'|' -k1 -n "$WORK_DIR/labels/_unlabeled" | while IFS='|' read -r tid ttitle; do
        [ -z "$tid" ] && continue
        echo "- [ ] #${tid} — ${ttitle}"
      done
      echo ""
    fi
  fi

  # Recently closed section (most recent 20 by closed date)
  if [ -f "$WORK_DIR/closed_all" ]; then
    echo "---"
    echo ""
    echo "## Recently Closed"
    echo ""
    sort -r "$WORK_DIR/closed_all" | head -20 | while IFS='|' read -r _cdate cid; do
      ctitle=$(grep -m1 '^title:' "$ISSUES_DIR/${cid}.md" | sed 's/^title: *//')
      creason=$(grep -m1 '^close_reason:' "$ISSUES_DIR/${cid}.md" | sed 's/^close_reason: *//')
      [ "$creason" = "null" ] && creason=""
      reason_suffix=""
      [ -n "$creason" ] && reason_suffix=" (${creason})"
      echo "- [x] #${cid} — ${ctitle}${reason_suffix}"
    done
    echo ""
  fi
} > "$WORK_DIR/output.md"

mv "$WORK_DIR/output.md" "$TODO_FILE"
