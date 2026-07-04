#!/bin/bash
# Claude Code Kit — Installer (thin forwarder)
#
# Usage:
#   bash install/install.sh                     # interactive (recommended)
#   bash install/install.sh --global            # global install, prompts for details
#   bash install/install.sh --project /my/app   # project install, prompts for details
#
# All logic lives in install.js. This script checks for Node.js and forwards.

set -e

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# ── Prerequisite: Node.js >= 20 ───────────────────────────────────────────────
if ! command -v node >/dev/null 2>&1; then
  echo "  Error: Node.js is required (>= 20). Install from https://nodejs.org" >&2
  exit 1
fi
if ! node -e 'process.exit(parseInt(process.versions.node.split(".")[0], 10) >= 20 ? 0 : 1)' 2>/dev/null; then
  echo "  Error: Node.js >= 20 required. Found: $(node --version 2>/dev/null || echo 'unknown')" >&2
  echo "  Install from https://nodejs.org" >&2
  exit 1
fi

exec node "$REPO_DIR/install/install.js" "$@"
