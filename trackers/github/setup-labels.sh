#!/bin/bash
# setup-labels.sh — GitHub Issues adapter
# Usage: bash .claude/trackers/active/setup-labels.sh
# Creates the standard label taxonomy for the harness. Safe to re-run (--force overwrites).
# Returns: count of labels created/updated.

set -o pipefail

if ! command -v gh &>/dev/null; then
  echo '{"error": "gh CLI not installed. Install from https://cli.github.com"}' >&2
  exit 1
fi

source "$(dirname "$0")/../lib/retry.sh"
source "$(dirname "$0")/../lib/auth-check.sh"
check_auth_github

COUNT=0

create_label() {
  local name="$1" color="$2" desc="$3"
  if gh label create "$name" --color "$color" --description "$desc" --force 2>/dev/null; then
    COUNT=$((COUNT + 1))
  fi
}

# Type labels (work on personal plans — no org features needed)
create_label "bug"          "D73A49" "Something isn't working"
create_label "feature"      "0075CA" "New functionality"
create_label "chore"        "FBCA04" "Maintenance, refactoring, tooling"
create_label "docs"         "0E8A16" "Documentation improvements"

# Priority labels
create_label "priority:critical" "B60205" "Drop everything"
create_label "priority:high"     "D93F0B" "Must do this sprint"
create_label "priority:medium"   "FBCA04" "Should do soon"
create_label "priority:low"      "0E8A16" "Nice to have"

# Item types (#32) — written by create-issue.sh / create-sub-issue.sh from TRACKER_ITEM_TYPE.
# They must exist: gh issue create fails on a label the repo does not have.
create_label "type:feature" "5319E7" "Item type: Feature"
create_label "type:story"   "1D76DB" "Item type: Story"
create_label "type:bug"     "D73A49" "Item type: Bug"
create_label "type:task"    "C5DEF5" "Item type: Task"

# Status labels
create_label "needs-triage" "D876E3" "Awaiting prioritization"

# Harness statuses (#30) — written by set-status.sh, one at a time.
create_label "status:in-progress"  "FBCA04" "Harness: a build is working on it"
create_label "status:in-review"    "0E8A16" "Harness: built, review started"
create_label "status:needs-person" "B60205" "Harness: stopped, needs a person"
create_label "status:done"         "6F42C1" "Harness: built, PR open"

# Risk flags
create_label "risk:security"    "B60205" "Security-sensitive change"
create_label "risk:performance" "D93F0B" "Performance-sensitive change"
create_label "risk:data"        "D93F0B" "Touches customer data"

echo "setup-labels: $COUNT labels created/updated."
