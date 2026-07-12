#!/bin/bash
# list-issues.sh — Azure DevOps adapter
# Usage: bash .claude/trackers/active/list-issues.sh
# Returns all open work items as a JSON array.
# Output: JSON array [{id, title, state, labels, assignees, url}]

ADO_PROJECT="YOUR_ADO_PROJECT"
ADO_ORG_PATH="YOUR_ADO_ORG_PATH"

if [[ "$ADO_PROJECT" == "YOUR_ADO_PROJECT" ]]; then
  echo '{"error": "ADO_PROJECT not configured. Run the installer or edit this script directly."}' >&2
  exit 1
fi

if ! command -v az &>/dev/null; then
  echo '{"error": "az CLI not installed. Install from https://aka.ms/installazurecli"}' >&2
  exit 1
fi

# Source shared libraries
source "$(dirname "$0")/../lib/retry.sh"
source "$(dirname "$0")/../lib/auth-check.sh"
check_auth_ado

WIQL="SELECT [System.Id], [System.Title], [System.State], [System.Tags], [System.AssignedTo] FROM WorkItems WHERE [System.TeamProject] = '$ADO_PROJECT' AND [System.State] <> 'Closed' AND [System.State] <> 'Removed' ORDER BY [System.Id] ASC"

RESULT=$(with_retry az boards query --wiql "$WIQL" --output json)
if [ $? -ne 0 ]; then
  echo '{"error": "Failed to query work items"}' >&2
  exit 1
fi

echo "$RESULT" | jq '[.[] | {id: .fields["System.Id"], title: .fields["System.Title"], state: .fields["System.State"], labels: (.fields["System.Tags"] // "" | split("; ")), assignees: [.fields["System.AssignedTo"].displayName // empty], url: .url}]'
