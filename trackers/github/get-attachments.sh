#!/bin/bash
# get-attachments.sh — GitHub Issues adapter
# Usage: bash .claude/trackers/active/get-attachments.sh <ISSUE_NUMBER> [<dest>]
#
# GitHub issues have no attachments (#34): files dragged into an issue become links in its body.
# Prints [] and a note, so a caller treats every tracker the same way. The links themselves are not
# downloaded; read them from the issue body.

ISSUE="${1:-}"

if [ -z "$ISSUE" ]; then
  echo '{"error": "Issue number required. Usage: get-attachments.sh <ISSUE_NUMBER> [<dest>]"}' >&2
  exit 1
fi

source "$(dirname "$0")/../lib/retry.sh"
source "$(dirname "$0")/../lib/auth-check.sh"

echo "note: GitHub issues have no attachments; files linked in the issue body are not downloaded." >&2
echo "[]"
