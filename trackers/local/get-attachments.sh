#!/bin/bash
# get-attachments.sh — Local tracker adapter
# Usage: bash .claude/trackers/active/get-attachments.sh <ID> [<dest>]
#
# Local tasks have no attachments (#34): a file is referenced by a path or link in the task body.
# Prints [] and a note, so a caller treats every tracker the same way. Linked files are not copied;
# read them from where the body points.

ISSUE_ID="${1:-}"

if [ -z "$ISSUE_ID" ]; then
  echo '{"error": "Task ID required. Usage: get-attachments.sh <ID> [<dest>]"}' >&2
  exit 1
fi

source "$(dirname "$0")/../lib/retry.sh"
source "$(dirname "$0")/../lib/auth-check.sh"

echo "note: local tasks have no attachments; files linked in the task body are not downloaded." >&2
echo "[]"
