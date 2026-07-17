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
  _proj=$(grep -i "todoist_project[[:space:]]*=" tasks/tracker-config.md | sed 's/.*=[[:space:]]*//; s/[[:space:]]*$//' | tr -d '\r')
  [ -n "$_proj" ] && [ "$_proj" != "YOUR_TODOIST_PROJECT" ] && TODOIST_PROJECT="$_proj"
fi

# Fallback: tasks/notes.md ## Todoist section (used by /to-todoist skill)
if [ -z "$TODOIST_PROJECT" ] && [ -f "tasks/notes.md" ]; then
  _proj=$(sed -n '/^## Todoist/,/^## /{ /project\s*:/{ s/.*project\s*:\s*//; s/[[:space:]]*$//; p; q; } }' tasks/notes.md)
  [ -n "$_proj" ] && TODOIST_PROJECT="$_proj"
fi

# Fall back to the configured default section when none is passed.
if [ -z "$SECTION" ] && [ -f "tasks/tracker-config.md" ]; then
  SECTION=$(grep -i "todoist_default_section[[:space:]]*=" tasks/tracker-config.md | sed 's/.*=[[:space:]]*//; s/[[:space:]]*$//' | tr -d '\r')
fi

# `td task list` (v1.74+) has no --section flag; resolve the section name to an
# id and filter client-side.
SECTION_ID=""
if [ -n "$SECTION" ] && [ -n "$TODOIST_PROJECT" ]; then
  SECTION_ID=$(with_retry "$TD" section list --project "$TODOIST_PROJECT" --json \
    | jq -r --arg n "$SECTION" '(.results // .)[] | select(.name==$n) | .id' | head -1)
fi

LIST_ARGS=(task list --json)
if [ -n "$TODOIST_PROJECT" ]; then
  LIST_ARGS+=(--project "$TODOIST_PROJECT")
fi

with_retry "$TD" "${LIST_ARGS[@]}" \
  | jq --arg sid "$SECTION_ID" '[ (.results // .)[] | select($sid == "" or .sectionId == $sid) ]'
