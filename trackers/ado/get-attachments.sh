#!/bin/bash
# get-attachments.sh — Azure DevOps adapter
# Usage: bash .claude/trackers/active/get-attachments.sh <WORK_ITEM_ID> [<dest>]
#
# Lists the work item's attached files (#34) and downloads them into <dest>, by default
# tasks/stories/<ID>/attachments/ (gitignored, so a download is never committed). Prints JSON:
#   [{"name": "<as attached>", "size": <bytes>, "saved_to": "<path>" | null, "skipped": "<why>" | null}]
#
# Attachment names are written by people: each is reduced to a safe single file name before
# anything touches the disk, so no name can place a file outside <dest>. Files larger than
# TRACKER_ATTACHMENT_MAX_BYTES (default 20 MB) are listed but not downloaded. On KBA projects an
# attachment may hold PHI: it stays in the local story folder (ARCHITECTURE.md §4).

ADO_PROJECT="YOUR_ADO_PROJECT"

ID="${1:-}"

if [ -z "$ID" ]; then
  echo '{"error": "Work item ID required. Usage: get-attachments.sh <WORK_ITEM_ID> [<dest>]"}' >&2
  exit 1
fi
if [[ ! "$ID" =~ ^[0-9]+$ ]]; then
  echo '{"error": "Work item ID must be a number"}' >&2
  exit 1
fi
DEST="${2:-tasks/stories/$ID/attachments}"

if [[ "$ADO_PROJECT" == "YOUR_ADO_PROJECT" ]]; then
  echo '{"error": "ADO_PROJECT not configured. Run the installer or edit this script directly."}' >&2
  exit 1
fi

if ! command -v az &>/dev/null; then
  echo '{"error": "az CLI not installed. Install from https://aka.ms/installazurecli"}' >&2
  exit 1
fi

if ! command -v jq &>/dev/null; then
  echo '{"error": "jq is required. Install from https://jqlang.github.io/jq/download/"}' >&2
  exit 1
fi

source "$(dirname "$0")/../lib/retry.sh"
source "$(dirname "$0")/../lib/auth-check.sh"
source "$(dirname "$0")/../lib/ticket-content.sh"
check_auth_ado

RAW=$(with_retry az boards work-item show --id "$ID" --project "$ADO_PROJECT" --expand relations --output json)
if [ $? -ne 0 ]; then
  echo "{\"error\": \"Failed to read work item #$ID\"}" >&2
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
    guid="${url##*/}"
    guid="${guid%%\?*}"
    if [[ ! "$guid" =~ ^[0-9A-Fa-f-]+$ ]]; then
      skipped="not an ADO attachment URL"
    else
      safe_file_name "$name" "attachment-$n"
      mkdir -p "$DEST"
      unique_path "$DEST" "$SAFE_NAME"
      if with_retry az devops invoke --area wit --resource attachments \
          --route-parameters project="$ADO_PROJECT" id="$guid" \
          --query-parameters download=true \
          --api-version 7.1 --http-method GET \
          --accept-media-type application/octet-stream \
          --out-file "$UNIQUE_PATH" >/dev/null; then
        saved="$UNIQUE_PATH"
      else
        rm -f "$UNIQUE_PATH"
        skipped="download failed"
      fi
    fi
  fi
  ROWS+=("$(jq -cn --arg name "$name" --arg size "${size:-0}" --arg saved "$saved" --arg skipped "$skipped" \
    '{name: $name, size: ($size | tonumber? // 0), saved_to: (if $saved == "" then null else $saved end), skipped: (if $skipped == "" then null else $skipped end)}')")
done < <(echo "$RAW" | jq -r '(.relations // [])[] | select(.rel == "AttachedFile")
  | [.url, (.attributes.name // ""), ((.attributes.resourceSize // 0) | tostring)] | @tsv')

if [ ${#ROWS[@]} -eq 0 ]; then
  echo "[]"
else
  printf '%s\n' "${ROWS[@]}" | jq -cs '.'
fi
