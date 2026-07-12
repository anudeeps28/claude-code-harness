#!/bin/bash
# get-pr-review-threads.sh — No code platform configured (loud failure per D16)
# Usage: bash .claude/code-platform/active/get-pr-review-threads.sh <PR_NUMBER>

source "$(dirname "$0")/../lib/retry.sh"
source "$(dirname "$0")/../lib/auth-check.sh"

echo '{"error": "No code platform configured — PR review features need GitHub or Azure Repos. Re-run the installer."}' >&2
exit 1
