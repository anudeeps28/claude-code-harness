#!/bin/bash
# get-attachments.sh — Todoist adapter
# Usage: bash .claude/trackers/active/get-attachments.sh <TASK_ID> [<dest>]
#
# Todoist attaches files to comments. Lists every file on the task's comments (#34) and downloads it
# into <dest>, by default tasks/stories/<ID>/attachments/ (gitignored). Prints JSON:
#   [{"name": "<as attached>", "size": <bytes>, "saved_to": "<path>" | null, "skipped": "<why>" | null}]
#
# Attachment names are written by people: each is reduced to a safe single file name before
# anything touches the disk. Files larger than TRACKER_ATTACHMENT_MAX_BYTES (default 20 MB) are
# listed but not downloaded; td itself also refuses files over 10 MB.

set -o pipefail

TASK_ID="${1:-}"

if [ -z "$TASK_ID" ]; then
  echo '{"error": "Task ID required. Usage: get-attachments.sh <TASK_ID> [<dest>]"}' >&2
  exit 1
fi
if [[ ! "$TASK_ID" =~ ^[A-Za-z0-9_-]+$ ]]; then
  echo '{"error": "Task ID may only contain letters, digits, - and _"}' >&2
  exit 1
fi
DEST="${2:-tasks/stories/$TASK_ID/attachments}"

TD="${TODOIST_CLI:-td}"

if ! command -v "$TD" &>/dev/null; then
  echo '{"error": "Todoist CLI (td) not found. Install it or set TODOIST_CLI."}' >&2
  exit 1
fi

source "$(dirname "$0")/../lib/retry.sh"
source "$(dirname "$0")/../lib/auth-check.sh"
source "$(dirname "$0")/../lib/ticket-content.sh"
check_auth_todoist

RAW=$(with_retry "$TD" comment list "id:${TASK_ID}" --all --json --full)
if [ $? -ne 0 ]; then
  echo "{\"error\": \"Failed to read comments on task $TASK_ID\"}" >&2
  exit 1
fi

ROWS=()
n=0
while IFS=$'\t' read -r url name size; do
  [ -z "$url" ] && continue
  size="${size%$'\r'}"   # jq on Windows ends lines with CRLF
  n=$((n + 1))
  saved=""
  skipped=""
  if [ "${size:-0}" -gt "$ATTACHMENT_MAX_BYTES" ] 2>/dev/null; then
    skipped="larger than the ${ATTACHMENT_MAX_BYTES}-byte limit (TRACKER_ATTACHMENT_MAX_BYTES)"
  else
    safe_file_name "$name" "attachment-$n"
    mkdir -p "$DEST"
    unique_path "$DEST" "$SAFE_NAME"
    FILE_JSON=$(with_retry "$TD" attachment view "$url" --json)
    if [ $? -eq 0 ] && [ -n "$FILE_JSON" ]; then
      # Always go through base64, even for text: jq on Windows writes text with CRLF, which would
      # change the file. Decoding base64 writes the exact bytes.
      echo "$FILE_JSON" | jq -j 'if .encoding == "base64" then .content else (.content | @base64) end' \
        | base64 -d > "$UNIQUE_PATH"
      if [ $? -eq 0 ]; then
        saved="$UNIQUE_PATH"
        # Todoist reports no size for an uploaded file (seen against a real account): use the
        # downloaded size. (td refuses anything over 10 MB, so the limit still holds.)
        if [ "${size:-0}" = "0" ] || [ "$size" = "null" ]; then size=$(wc -c < "$UNIQUE_PATH" | tr -d ' '); fi
      else
        rm -f "$UNIQUE_PATH"; skipped="could not write the file"
      fi
    else
      skipped="download failed"
    fi
  fi
  ROWS+=("$(jq -cn --arg name "$name" --arg size "${size:-0}" --arg saved "$saved" --arg skipped "$skipped" \
    '{name: $name, size: ($size | tonumber? // 0), saved_to: (if $saved == "" then null else $saved end), skipped: (if $skipped == "" then null else $skipped end)}')")
done < <(echo "$RAW" | jq -r '(.results? // .)[] | .fileAttachment | select(. != null and (.fileUrl // "") != "")
  | [.fileUrl, (.fileName // ""), ((.fileSize // 0) | tostring)] | @tsv')

if [ ${#ROWS[@]} -eq 0 ]; then
  echo "[]"
else
  printf '%s\n' "${ROWS[@]}" | jq -cs '.'
fi
