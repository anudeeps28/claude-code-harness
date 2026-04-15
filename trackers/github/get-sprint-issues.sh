#!/bin/bash
# get-sprint-issues.sh — GitHub adapter
# Usage: bash .claude/trackers/active/get-sprint-issues.sh <SPRINT_NUMBER>
#
# Sprint mode is read from tasks/tracker-config.md:
#   sprint_mode = milestone   (default) — uses GitHub Milestones named "Sprint N"
#   sprint_mode = project     — uses GitHub Projects v2 with an Iteration field
#   github_project_number = 1 (required when sprint_mode = project)

SPRINT=$1

if [ -z "$SPRINT" ]; then
  echo '{"error": "Sprint number required. Usage: get-sprint-issues.sh <SPRINT_NUMBER>"}' >&2
  exit 1
fi

if ! command -v gh &>/dev/null; then
  echo '{"error": "gh CLI not installed. Install from https://cli.github.com"}' >&2
  exit 1
fi

# Source shared libraries
source "$(dirname "$0")/../lib/retry.sh"
source "$(dirname "$0")/../lib/auth-check.sh"
check_auth_github

# Read config
SPRINT_MODE="milestone"
GITHUB_PROJECT_NUMBER=""

if [ -f "tasks/tracker-config.md" ]; then
  _mode=$(grep -i "sprint_mode\s*=" tasks/tracker-config.md | sed 's/.*=\s*//' | tr -d ' \r\n')
  [ -n "$_mode" ] && SPRINT_MODE="$_mode"
  _proj=$(grep -i "github_project_number\s*=" tasks/tracker-config.md | sed 's/.*=\s*//' | tr -d ' \r\n')
  [ -n "$_proj" ] && GITHUB_PROJECT_NUMBER="$_proj"
fi

if [ "$SPRINT_MODE" = "project" ] && [ -n "$GITHUB_PROJECT_NUMBER" ]; then
  # GitHub Projects v2 — query by Iteration field matching "Sprint N"
  OWNER=$(with_retry gh repo view --json owner --jq '.owner.login')

  with_retry gh api graphql \
    -f query='
      query($owner:String!, $number:Int!) {
        user(login:$owner) {
          projectV2(number:$number) {
            items(first:100) {
              nodes {
                content {
                  ... on Issue {
                    number
                    title
                    body
                    state
                    labels(first:5) { nodes { name } }
                    assignees(first:3) { nodes { login } }
                  }
                }
                fieldValues(first:10) {
                  nodes {
                    ... on ProjectV2ItemFieldIterationValue {
                      title
                      startDate
                      duration
                    }
                  }
                }
              }
            }
          }
        }
      }
    ' \
    -f owner="$OWNER" \
    -F number="$GITHUB_PROJECT_NUMBER" \
    --jq "
      [
        .data.user.projectV2.items.nodes[]
        | select(
            .fieldValues.nodes[]?
            | .title? // \"\"
            | test(\"Sprint $SPRINT\"; \"i\")
          )
        | .content
        | select(. != null)
      ]
    "

else
  # GitHub Milestones (default) — milestone must be named "Sprint N"
  with_retry gh issue list \
    --milestone "Sprint $SPRINT" \
    --json number,title,body,state,labels,assignees,milestone \
    --limit 100
fi
