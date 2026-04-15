#!/usr/bin/env bash
# auth-check.sh — Shared token staleness check for tracker scripts.
#
# Source this file in any tracker script. Call `check_auth_ado` or `check_auth_github`
# before making API calls. If the CLI auth is expired or invalid, the script exits
# with a clear error message instead of failing mid-request with a cryptic error.
#
# Usage (ADO):
#   source "$(dirname "$0")/../lib/auth-check.sh"
#   check_auth_ado
#
# Usage (GitHub):
#   source "$(dirname "$0")/../lib/auth-check.sh"
#   check_auth_github

check_auth_ado() {
  # Verify az CLI is logged in and the token is still valid
  local account_info
  account_info=$(az account show --output json 2>&1)
  local exit_code=$?

  if [ $exit_code -ne 0 ]; then
    echo '{"error": "Azure CLI auth expired or not logged in. Run: az login"}' >&2
    exit 1
  fi

  # Check if the token has expired by attempting a lightweight call
  # az account get-access-token will fail if the refresh token is invalid
  local token_check
  token_check=$(az account get-access-token --resource "499b84ac-1321-427f-aa17-267ca6975798" --output json 2>&1)
  exit_code=$?

  if [ $exit_code -ne 0 ]; then
    echo '{"error": "Azure DevOps token expired. Run: az login"}' >&2
    exit 1
  fi

  # Check token expiry time (warn if < 5 minutes remaining)
  local expires_on
  expires_on=$(echo "$token_check" | jq -r '.expiresOn // ""' 2>/dev/null)
  if [ -n "$expires_on" ]; then
    local expiry_epoch now_epoch remaining
    # Handle both date formats (macOS vs Linux)
    expiry_epoch=$(date -d "$expires_on" +%s 2>/dev/null || date -j -f "%Y-%m-%d %H:%M:%S" "$expires_on" +%s 2>/dev/null || echo "0")
    now_epoch=$(date +%s)
    remaining=$((expiry_epoch - now_epoch))

    if [ "$remaining" -gt 0 ] && [ "$remaining" -lt 300 ]; then
      echo "auth-check.sh: Azure token expires in ${remaining}s — consider running 'az login' soon." >&2
    fi
  fi
}

check_auth_github() {
  # Verify gh CLI is authenticated
  local auth_status
  auth_status=$(gh auth status 2>&1)
  local exit_code=$?

  if [ $exit_code -ne 0 ]; then
    echo '{"error": "GitHub CLI not authenticated. Run: gh auth login"}' >&2
    exit 1
  fi

  # Check if token is reported as expired
  if echo "$auth_status" | grep -qi "token.*expired\|authentication.*failed"; then
    echo '{"error": "GitHub token expired. Run: gh auth refresh"}' >&2
    exit 1
  fi
}
