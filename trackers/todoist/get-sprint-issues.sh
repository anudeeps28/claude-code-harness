#!/bin/bash
# get-sprint-issues.sh — Todoist adapter
# Usage: bash .claude/trackers/active/get-sprint-issues.sh <SECTION_OR_PROJECT>
#
# Todoist maps sprints to sections within a project. The argument is either:
#   - A section name (matched case-insensitively)
#   - Empty (lists all open tasks in the configured project)
#
# Config is read from tasks/tracker-config.md:
#   todoist_project = <project-name>

SECTION=$1

TD="${TODOIST_CLI:-td}"

if ! command -v "$TD" &>/dev/null; then
  echo '{"error": "Todoist CLI (td) not found. Install it or set TODOIST_CLI."}' >&2
  exit 1
fi

source "$(dirname "$0")/../lib/retry.sh"
source "$(dirname "$0")/../lib/auth-check.sh"
check_auth_todoist

TODOIST_PROJECT=""

if [ -f "tasks/tracker-config.md" ]; then
  _proj=$(grep -i "todoist_project\s*=" tasks/tracker-config.md | sed 's/.*=\s*//' | tr -d ' \r\n')
  [ -n "$_proj" ] && TODOIST_PROJECT="$_proj"
fi

LIST_ARGS=(task list --json)

if [ -n "$TODOIST_PROJECT" ]; then
  LIST_ARGS+=(--project "$TODOIST_PROJECT")
fi

if [ -n "$SECTION" ]; then
  LIST_ARGS+=(--section "$SECTION")
fi

with_retry "$TD" "${LIST_ARGS[@]}"
