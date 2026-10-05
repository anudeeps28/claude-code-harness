#!/bin/bash
# ticket-content.sh — shared handling for what people write on a ticket: comments (#33) and
# attachments (#34). That content goes straight into an agent's brief, so it is treated as data:
# control characters and terminal escape sequences are stripped, and file names are made safe
# before anything is written to disk.
#
# Sourced, not run.

# Attachments larger than this are listed but not downloaded. Override per run.
ATTACHMENT_MAX_BYTES="${TRACKER_ATTACHMENT_MAX_BYTES:-20971520}"   # 20 MB

# jq: clean comment text. Removes ANSI escape sequences and every control character except
# newline and tab, and (for ADO, whose comments are HTML) tags.
# shellcheck disable=SC2016
CLEAN_TEXT_JQ='
def clean_text:
  (. // "") | tostring
  | gsub("\u001b\\[[0-9;?]*[ -/]*[@-~]"; "")
  | gsub("\u001b[@-_]"; "")
  | gsub("[\u0000-\u0008\u000b-\u001f\u007f]"; "");
def strip_html: gsub("<br */?>"; "\n") | gsub("</(p|div)>"; "\n") | gsub("<[^>]*>"; "")
  | gsub("&nbsp;"; " ") | gsub("&lt;"; "<") | gsub("&gt;"; ">") | gsub("&quot;"; "\"") | gsub("&amp;"; "&")
  | sub("\n+$"; "");
'

# safe_file_name <name> <fallback>  — sets SAFE_NAME to a name that can only ever be a single file
# inside the destination folder: everything up to the last / or \ is dropped, anything outside
# [A-Za-z0-9._-] becomes _, leading dots are removed, and it is cut to 100 characters.
safe_file_name() {
  local name="$1"
  name="${name##*/}"
  name="${name##*\\}"
  name="${name//[^A-Za-z0-9._-]/_}"
  while [ "${name:0:1}" = "." ]; do name="${name:1}"; done
  name="${name:0:100}"
  [ -z "$name" ] && name="$2"
  SAFE_NAME="$name"
}

# unique_path <dir> <name>  — sets UNIQUE_PATH to <dir>/<name>, adding -2, -3 ... if it exists,
# so two attachments with the same name never overwrite each other.
unique_path() {
  local dir="$1" name="$2" stem ext n=2
  UNIQUE_PATH="$dir/$name"
  if [ -e "$UNIQUE_PATH" ]; then
    stem="${name%.*}"; ext=""
    [ "$stem" != "$name" ] && ext=".${name##*.}"
    while [ -e "$dir/$stem-$n$ext" ]; do n=$((n + 1)); done
    UNIQUE_PATH="$dir/$stem-$n$ext"
  fi
}

# json_string <text>  — sets JSON_STRING to <text> as a JSON string literal (for adapters without jq).
json_string() {
  local s="$1"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  s="${s//$'\t'/\\t}"
  s="${s//$'\n'/\\n}"
  s="${s//$'\r'/}"
  JSON_STRING="\"$s\""
}
