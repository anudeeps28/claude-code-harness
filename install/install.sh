#!/bin/bash
# Claude Code Kit — Installer
#
# Usage:
#   bash install/install.sh                     # interactive (recommended)
#   bash install/install.sh --global            # global install, prompts for details
#   bash install/install.sh --project /my/app   # project install, prompts for details
#
# What it does:
#   1. Asks whether to install globally (~/.claude/) or into a specific project
#   2. Prompts for your name, ADO project, repo, and org details
#   3. Copies skills/, agents/, hooks/, rules/ to the target .claude/ folder
#   4. Replaces all placeholders with your actual values
#   5. Generates a ready-to-use settings.json with correct hook paths

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

# ── Banner ────────────────────────────────────────────────────────────────────
echo ""
echo "  claude-code-harness"
echo "  ────────────────────────────────────────────────────────────────"
echo ""

# ── Parse args ────────────────────────────────────────────────────────────────
MODE=""
PROJECT_DIR=""

UNINSTALL=false
DRY_RUN=false

while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --global)
      MODE="global"
      ;;
    --project)
      MODE="project"
      if [[ -n "${2:-}" && "${2:0:1}" != "-" ]]; then
        PROJECT_DIR="$2"
        shift
      fi
      ;;
    --uninstall)
      UNINSTALL=true
      ;;
    --dry-run)
      DRY_RUN=true
      ;;
    --help|-h)
      echo "  Usage:"
      echo "    bash install/install.sh                     # interactive install"
      echo "    bash install/install.sh --global            # global install"
      echo "    bash install/install.sh --project /my/app   # project install"
      echo "    bash install/install.sh --uninstall         # remove installed files"
      echo "    bash install/install.sh --dry-run           # show what would be done"
      echo ""
      exit 0
      ;;
    *)
      # Positional arg treated as project path (backwards compat)
      if [[ -z "$PROJECT_DIR" ]]; then
        PROJECT_DIR="$1"
        MODE="project"
      fi
      ;;
  esac
  shift
done

# ── Interactive mode selection ────────────────────────────────────────────────
if [[ -z "$MODE" ]]; then
  echo "  Install mode:"
  echo ""
  echo "    1) Global  — skills available in every project  (~/.claude/)"
  echo "    2) Project — install into one specific project"
  echo ""
  read -p "  Choice [1/2]: " choice
  echo ""
  if [[ "$choice" == "1" ]]; then
    MODE="global"
  else
    MODE="project"
  fi
fi

if [[ "$MODE" == "project" && -z "$PROJECT_DIR" ]]; then
  read -p "  Project path: " PROJECT_DIR
  echo ""
fi

# ── Validate ──────────────────────────────────────────────────────────────────
if [[ "$MODE" == "project" ]]; then
  if [[ ! -d "$PROJECT_DIR" ]]; then
    echo "  Error: Directory not found: $PROJECT_DIR"
    exit 1
  fi
  TARGET="$PROJECT_DIR/.claude"
else
  TARGET="$HOME/.claude"
fi

# ── Uninstall mode ────────────────────────────────────────────────────────────
if [[ "$UNINSTALL" == true ]]; then
  echo "  Uninstalling from: $TARGET"
  echo ""

  if [[ ! -d "$TARGET/skills" && ! -d "$TARGET/hooks" && ! -d "$TARGET/agents" ]]; then
    echo "  Nothing to uninstall — no skills, hooks, or agents found at $TARGET"
    exit 0
  fi

  echo "  This will remove:"
  echo "    - $TARGET/skills/"
  echo "    - $TARGET/agents/"
  echo "    - $TARGET/hooks/"
  echo "    - $TARGET/rules/"
  echo "    - $TARGET/trackers/"
  echo ""
  echo "  This will NOT remove:"
  echo "    - settings.json (your hook configuration)"
  echo "    - tasks/ files (your project data)"
  echo ""
  read -p "  Continue? [y/N]: " uninstall_confirm
  [[ "$uninstall_confirm" != "y" && "$uninstall_confirm" != "Y" ]] && echo "  Cancelled." && exit 0

  # Create a timestamped backup before removing
  BACKUP_DIR="$(dirname "$TARGET")/claude-code-harness-backup-$(date +%Y%m%d-%H%M%S)"
  mkdir -p "$BACKUP_DIR"
  for dir in skills agents hooks rules trackers; do
    if [[ -d "$TARGET/$dir" ]]; then
      cp -r "$TARGET/$dir" "$BACKUP_DIR/"
      rm -rf "$TARGET/$dir"
      echo "  Removed: $dir/"
    fi
  done

  echo ""
  echo "  Backup saved to: $BACKUP_DIR"
  echo "  To restore: cp -r \"$BACKUP_DIR/\"* \"$TARGET/\""
  echo ""
  echo "  Uninstall complete. settings.json and tasks/ were preserved."
  exit 0
fi

# Warn if project directory is not a git repository
if [[ "$MODE" == "project" && ! -d "$PROJECT_DIR/.git" ]]; then
  echo "  Warning: $PROJECT_DIR does not appear to be a git repository."
  read -p "  Continue anyway? [y/N]: " git_confirm
  echo ""
  [[ "$git_confirm" != "y" && "$git_confirm" != "Y" ]] && exit 1
fi

# ── Choose workflow pack ──────────────────────────────────────────────────────
echo "  Workflow pack:"
echo ""
echo "    1) Enterprise — sprints, stories, team coordination (/story, /sprint-plan)"
echo "    2) Solo       — issues, simple priorities (/implement, /plan)"
echo ""
read -p "  Choice [1/2]: " pack_choice
echo ""

case "$pack_choice" in
  2) WORKFLOW_PACK="solo" ;;
  *) WORKFLOW_PACK="enterprise" ;;
esac

# ── Choose tracker ────────────────────────────────────────────────────────────
if [[ "$WORKFLOW_PACK" == "enterprise" ]]; then
  echo "  Issue tracker:"
  echo ""
  echo "    1) Azure DevOps  (uses az devops CLI)"
  echo "    2) GitHub        (uses gh CLI)"
  echo ""
  read -p "  Choice [1/2]: " tracker_choice
  echo ""
  case "$tracker_choice" in
    2) TRACKER="github" ;;
    *) TRACKER="ado" ;;
  esac
else
  TRACKER="github"
  echo "  Tracker: GitHub (default for solo workflow)"
  echo ""
fi

# ── Pre-flight checks ─────────────────────────────────────────────────────────
echo "  Checking prerequisites..."
MISSING_PREREQS=0

check_tool() {
  local tool="$1" install_hint="$2"
  if ! command -v "$tool" &>/dev/null; then
    echo "  [MISSING] $tool — $install_hint"
    MISSING_PREREQS=1
  else
    echo "  [OK]      $tool"
  fi
}

check_tool "jq" "https://jqlang.github.io/jq/download/"

if [[ "$TRACKER" == "ado" ]]; then
  check_tool "az" "https://aka.ms/installazurecli (then: az extension add --name azure-devops)"
elif [[ "$TRACKER" == "github" ]]; then
  check_tool "gh" "https://cli.github.com"
fi

if [[ "$MISSING_PREREQS" -eq 1 ]]; then
  echo ""
  echo "  Error: Missing prerequisites above. Install them and re-run the installer."
  exit 1
fi
echo ""

# ── Collect personalization ───────────────────────────────────────────────────
echo "  Personalization (press Enter to skip and fill in manually later):"
echo ""
read -p "    Your name                              : " USER_NAME
read -p "    Project name (human-readable)           : " PROJECT_NAME

if [[ "$WORKFLOW_PACK" == "enterprise" && "$TRACKER" == "ado" ]]; then
  read -p "    ADO project name                       : " ADO_PROJECT
  read -p "    ADO repo name                          : " ADO_REPO
  read -p "    ADO org path (sprint IterationPath)    : " ADO_ORG_PATH
fi

# Enterprise-only team placeholders (referenced by skills/agents that talk about
# blockers, code conventions, and routing planning questions to the right person).
if [[ "$WORKFLOW_PACK" == "enterprise" ]]; then
  echo ""
  echo "    Team (press Enter to skip — leaves placeholders in skill text):"
  read -p "    Org / company short name               : " ORG_NAME
  read -p "    Lead developer name (architecture)     : " LEAD_DEV
  read -p "    Infrastructure / cloud person          : " INFRA_PERSON
  read -p "    DevOps / CI/CD / deployments person    : " DEVOPS_PERSON
  read -p "    QA / UAT person                        : " QA_PERSON
fi

# ── PRD output mode ──────────────────────────────────────────────────────
echo "  Where should PRDs live?"
echo ""
echo "    1) File in repo          — PRD.md (default)"
echo "    2) Tracker issue         — published to your issue tracker"
echo "    3) Both — file canonical — PRD.md is source of truth, tracker is mirror"
echo "    4) Both — tracker canonical — tracker issue is source of truth, file is mirror"
echo ""
read -p "  Choice [1/2/3/4]: " prd_choice
echo ""
case "$prd_choice" in
  2) PRD_MODE="tracker" ;;
  3) PRD_MODE="both-file-canonical" ;;
  4) PRD_MODE="both-tracker-canonical" ;;
  *) PRD_MODE="file" ;;
esac

if [[ "$MODE" == "global" ]]; then
  read -p "    Work root (folder containing projects) : " WORK_ROOT
fi

# Where the user cloned the harness source — the /improve-harness skill needs this so
# its proposals can reference real file paths to edit. Default to REPO_DIR
# (the directory the installer is running from) since that's almost always right.
read -p "    Harness repo path [${REPO_DIR}]: " HARNESS_REPO_PATH
HARNESS_REPO_PATH="${HARNESS_REPO_PATH:-$REPO_DIR}"
echo ""

# Defaults for skipped fields
USER_NAME="${USER_NAME:-YOUR_NAME}"
PROJECT_NAME="${PROJECT_NAME:-YOUR_PROJECT_NAME}"
ADO_PROJECT="${ADO_PROJECT:-YOUR_ADO_PROJECT}"
ADO_REPO="${ADO_REPO:-YOUR_ADO_REPO}"
ADO_ORG_PATH="${ADO_ORG_PATH:-YOUR_ADO_ORG_PATH}"
ORG_NAME="${ORG_NAME:-YOUR_ORG}"
LEAD_DEV="${LEAD_DEV:-YOUR_LEAD_DEV}"
INFRA_PERSON="${INFRA_PERSON:-YOUR_INFRA_PERSON}"
DEVOPS_PERSON="${DEVOPS_PERSON:-YOUR_DEVOPS_PERSON}"
QA_PERSON="${QA_PERSON:-YOUR_QA_PERSON}"
if [[ "$MODE" == "global" ]]; then
  WORK_ROOT="${WORK_ROOT:-C:\\YOUR_WORK_FOLDER}"
fi

# ── Dry run ───────────────────────────────────────────────────────────────────
if [[ "$DRY_RUN" == true ]]; then
  echo "  ── DRY RUN (no files will be modified) ──"
  echo ""
  echo "  Mode:          $MODE"
  echo "  Target:        $TARGET"
  echo "  Workflow pack: $WORKFLOW_PACK"
  echo "  Tracker:       $TRACKER"
  echo "  User:          $USER_NAME"
  [[ "$TRACKER" == "ado" ]] && echo "  ADO project:   $ADO_PROJECT"
  [[ "$TRACKER" == "ado" ]] && echo "  ADO repo:      $ADO_REPO"
  [[ "$TRACKER" == "ado" ]] && echo "  ADO org path:  $ADO_ORG_PATH"
  [[ "$MODE" == "global" ]] && echo "  Work root:     $WORK_ROOT"
  echo ""
  echo "  Would copy:"
  SKILL_COUNT=$(find "$REPO_DIR/skills/" -maxdepth 1 -mindepth 1 -type d 2>/dev/null | wc -l)
  AGENT_COUNT=$(find "$REPO_DIR/agents/" -name "*.md" 2>/dev/null | wc -l)
  HOOK_COUNT=$(find "$REPO_DIR/hooks/" -type f 2>/dev/null | wc -l)
  RULE_COUNT=$(find "$REPO_DIR/rules/" -name "*.md" 2>/dev/null | wc -l)
  TRACKER_COUNT=$(find "$REPO_DIR/trackers/$TRACKER/" -name "*.sh" 2>/dev/null | wc -l)
  echo "    $SKILL_COUNT skills → $TARGET/skills/"
  echo "    $AGENT_COUNT agents → $TARGET/agents/"
  echo "    $HOOK_COUNT hooks → $TARGET/hooks/"
  echo "    $RULE_COUNT rules → $TARGET/rules/"
  echo "    $TRACKER_COUNT tracker scripts ($TRACKER) → $TARGET/trackers/active/"
  if [[ "$MODE" == "project" ]]; then
    echo "    task templates → $PROJECT_DIR/tasks/"
  fi
  echo ""
  echo "  Would generate: $TARGET/settings.json"
  echo "  Would replace placeholders: YOUR_NAME, YOUR_PROJECT_NAME, YOUR_ADO_*"
  echo ""
  echo "  Run without --dry-run to install."
  exit 0
fi

# ── Copy files ────────────────────────────────────────────────────────────────
echo "  Installing to: $TARGET"
echo ""

# Detect existing install and warn about overwrites
if [[ -d "$TARGET/skills" || -d "$TARGET/agents" || -d "$TARGET/hooks" ]]; then
  echo "  An existing installation was detected at $TARGET."
  echo "  Skills, agents, hooks, and rules will be overwritten with the latest versions."
  echo "  Task files (tasks/) will NOT be overwritten."
  echo ""
  read -p "  Continue with upgrade? [y/N]: " upgrade_confirm
  echo ""
  [[ "$upgrade_confirm" != "y" && "$upgrade_confirm" != "Y" ]] && echo "  Aborted." && exit 0
fi

mkdir -p "$TARGET/skills" "$TARGET/agents" "$TARGET/hooks" "$TARGET/rules" "$TARGET/trackers/active"

echo "  Copying skills..."
for skill_dir in "$REPO_DIR/skills/"*/; do
  skill_name=$(basename "$skill_dir")
  if [[ -d "$TARGET/skills/$skill_name" ]]; then
    echo "    Updating:   skills/$skill_name"
  else
    echo "    Installing: skills/$skill_name"
  fi
  cp -r "$skill_dir" "$TARGET/skills/"
done

echo "  Copying tracker adapter ($TRACKER)..."
cp "$REPO_DIR/trackers/$TRACKER/"*.sh "$TARGET/trackers/active/"
chmod +x "$TARGET/trackers/active/"*.sh

# Adapters source ../lib/retry.sh and ../lib/auth-check.sh — must ship these too.
mkdir -p "$TARGET/trackers/lib"
cp "$REPO_DIR/trackers/lib/"*.sh "$TARGET/trackers/lib/" 2>/dev/null || true

echo "  Copying agents..."
for agent_file in "$REPO_DIR/agents/"*.md; do
  agent_name=$(basename "$agent_file")
  if [[ -f "$TARGET/agents/$agent_name" ]]; then
    echo "    Updating:   agents/$agent_name"
  else
    echo "    Installing: agents/$agent_name"
  fi
  cp "$agent_file" "$TARGET/agents/"
done

echo "  Copying hooks..."
for hook_file in "$REPO_DIR/hooks/"*; do
  [[ -f "$hook_file" ]] || continue
  hook_name=$(basename "$hook_file")
  if [[ -f "$TARGET/hooks/$hook_name" ]]; then
    echo "    Updating:   hooks/$hook_name"
  else
    echo "    Installing: hooks/$hook_name"
  fi
  cp "$hook_file" "$TARGET/hooks/"
done
# Copy the hooks/lib/ helpers used by the Node hooks
if [[ -d "$REPO_DIR/hooks/lib" ]]; then
  mkdir -p "$TARGET/hooks/lib"
  cp "$REPO_DIR/hooks/lib/"*.js "$TARGET/hooks/lib/" 2>/dev/null || true
  echo "    Installed: hooks/lib/"
fi

echo "  Copying rules..."
for rule_file in "$REPO_DIR/rules/"*.md; do
  [[ -f "$rule_file" ]] || continue
  rule_name=$(basename "$rule_file")
  if [[ -f "$TARGET/rules/$rule_name" ]]; then
    echo "    Updating:   rules/$rule_name"
  else
    echo "    Installing: rules/$rule_name"
  fi
  cp "$rule_file" "$TARGET/rules/"
done

# Copy task templates for project installs only
if [[ "$MODE" == "project" ]]; then
  mkdir -p "$PROJECT_DIR/tasks/stories"
  echo "  Copying task templates ($WORKFLOW_PACK pack)..."

  if [[ "$WORKFLOW_PACK" == "solo" ]]; then
    # Solo: simpler task files (plan.md, notes.md)
    TASK_TEMPLATE_DIR="$REPO_DIR/templates/tasks-solo"
  else
    # Enterprise: full task files (todo.md, lessons.md, pr-queue.md, flags-and-notes.md, etc.)
    TASK_TEMPLATE_DIR="$REPO_DIR/templates/tasks"
  fi

  for f in "$TASK_TEMPLATE_DIR/"*; do
    [[ -d "$f" ]] && continue  # skip directories (handled below)
    fname=$(basename "$f")
    dest="$PROJECT_DIR/tasks/$fname"
    if [[ ! -f "$dest" ]]; then
      cp "$f" "$dest"
      echo "    Created: tasks/$fname"
    else
      echo "    Skipped (exists): tasks/$fname"
    fi
  done

  # Copy story handoff contract templates (both packs use these)
  for f in "$REPO_DIR/templates/tasks/stories/"*; do
    [[ -f "$f" ]] || continue
    fname=$(basename "$f")
    dest="$PROJECT_DIR/tasks/stories/$fname"
    if [[ ! -f "$dest" ]]; then
      cp "$f" "$dest"
      echo "    Created: tasks/stories/$fname"
    else
      echo "    Skipped (exists): tasks/stories/$fname"
    fi
  done

  # Substitute PRD mode in newly-created task files
  if [[ "$WORKFLOW_PACK" == "solo" ]]; then
    TASK_CONFIG="$PROJECT_DIR/tasks/notes.md"
  else
    TASK_CONFIG="$PROJECT_DIR/tasks/tracker-config.md"
  fi
  if [[ -f "$TASK_CONFIG" ]]; then
    sed -i "s|YOUR_PRD_MODE|$PRD_MODE|g" "$TASK_CONFIG" 2>/dev/null || true
  fi
fi

# ── CONTEXT.md + ADR convention (project installs only) ──────────────────────
if [[ "$MODE" == "project" ]]; then
  echo "  Optional: CONTEXT.md + ADR convention"
  echo ""
  echo "    CONTEXT.md — domain glossary, module map, codebase conventions"
  echo "    docs/adr/  — lightweight records of hard-to-reverse decisions"
  echo ""
  read -p "  Set up CONTEXT.md + ADR convention? [y/N]: " ctx_choice
  echo ""
  if [[ "$ctx_choice" == "y" || "$ctx_choice" == "Y" ]]; then
    if [[ -f "$PROJECT_DIR/CONTEXT.md" ]]; then
      echo "    Skipped (exists): CONTEXT.md"
    else
      cp "$REPO_DIR/templates/CONTEXT.md.template" "$PROJECT_DIR/CONTEXT.md"
      echo "    Created: CONTEXT.md"
    fi

    mkdir -p "$PROJECT_DIR/docs/adr"
    for f in "$REPO_DIR/templates/docs/adr/"*; do
      [[ -f "$f" ]] || continue
      fname=$(basename "$f")
      dest="$PROJECT_DIR/docs/adr/$fname"
      if [[ -f "$dest" ]]; then
        echo "    Skipped (exists): docs/adr/$fname"
      else
        cp "$f" "$dest"
        echo "    Created: docs/adr/$fname"
      fi
    done
  fi
fi

# ── Build path variables ──────────────────────────────────────────────────────
# Unix path for bash hook commands
if [[ "$MODE" == "global" ]]; then
  HOOKS_UNIX="$HOME/.claude/hooks"
else
  HOOKS_UNIX="$TARGET/hooks"
fi

# Windows path for PowerShell hook commands
# Converts /c/Users/foo → C:\Users\foo
HOOKS_WIN="$(echo "$HOOKS_UNIX" | sed 's|^/\([a-zA-Z]\)/|\1:/|' | tr '/' '\\')"
# JSON-escaped Windows path (doubles backslashes)
HOOKS_WIN_JSON="$(echo "$HOOKS_WIN" | sed 's|\\|\\\\|g')"

# For project-level references in hooks (tasks/ folder, etc.)
if [[ "$MODE" == "global" ]]; then
  # At runtime, hooks run from the project dir so $(pwd) resolves correctly
  PROJECT_ROOT_BASH='$(pwd)'
  PROJECT_ROOT_WIN='%CD%'
else
  PROJECT_ROOT_BASH="$PROJECT_DIR"
  PROJECT_ROOT_WIN="$(echo "$PROJECT_DIR" | sed 's|^/\([a-zA-Z]\)/|\1:/|' | tr '/' '\\')"
fi

# ── Replace placeholders ──────────────────────────────────────────────────────
echo ""
echo "  Configuring placeholders..."

# Only sed within the directories we just installed — never touch Claude Code's
# own state folders (backups/, cache/, plugins/, sessions/, todos/, etc.).
SED_DIRS=()
for d in skills agents hooks rules trackers; do
  [[ -d "$TARGET/$d" ]] && SED_DIRS+=("$TARGET/$d")
done

find "${SED_DIRS[@]}" -type f 2>/dev/null | while read -r file; do
  sed -i \
    -e "s|YOUR_PROJECT_ROOT/.claude/hooks|$HOOKS_UNIX|g" \
    -e "s|YOUR_PROJECT_ROOT\\\\.claude\\\\hooks|$HOOKS_WIN|g" \
    -e "s|YOUR_PROJECT_ROOT|$PROJECT_ROOT_BASH|g" \
    -e "s|YOUR_PROJECT_NAME|$PROJECT_NAME|g" \
    -e "s|YOUR_NAME|$USER_NAME|g" \
    -e "s|YOUR_ADO_PROJECT|$ADO_PROJECT|g" \
    -e "s|YOUR_ADO_REPO|$ADO_REPO|g" \
    -e "s|YOUR_ADO_ORG_PATH|$ADO_ORG_PATH|g" \
    -e "s|YOUR_ORG|$ORG_NAME|g" \
    -e "s|YOUR_LEAD_DEV|$LEAD_DEV|g" \
    -e "s|YOUR_INFRA_PERSON|$INFRA_PERSON|g" \
    -e "s|YOUR_DEVOPS_PERSON|$DEVOPS_PERSON|g" \
    -e "s|YOUR_QA_PERSON|$QA_PERSON|g" \
    -e "s|YOUR_HARNESS_REPO_PATH|$HARNESS_REPO_PATH|g" \
    -e "s|YOUR_PRD_MODE|$PRD_MODE|g" \
    "$file" 2>/dev/null || true

  # Work root (global only) — legacy PowerShell catalog-skills.ps1 placeholder.
  # Kept for backward compat on any stale content; harmless no-op otherwise.
  if [[ "$MODE" == "global" && -n "$WORK_ROOT" ]]; then
    WORK_ROOT_ESCAPED="$(echo "$WORK_ROOT" | sed 's|\\|\\\\|g')"
    sed -i "s|C:\\\\\\\\YOUR_WORK_FOLDER|$WORK_ROOT_ESCAPED|g" "$file" 2>/dev/null || true
    sed -i 's|C:\\YOUR_WORK_FOLDER|'"$WORK_ROOT"'|g' "$file" 2>/dev/null || true
  fi
done

# ── Generate settings.json ────────────────────────────────────────────────────
echo "  Generating settings.json..."

SETTINGS_FILE="$TARGET/settings.json"

# Back up existing settings.json if present
if [[ -f "$SETTINGS_FILE" ]]; then
  cp "$SETTINGS_FILE" "${SETTINGS_FILE}.bak"
  echo "  (Backed up existing settings.json to settings.json.bak)"
fi

# Hooks now run on Node.js (>= 20) — one implementation for all platforms.
# catalog-skills.js reads CLAUDE_HARNESS_WORK_ROOT from the env block below.
ENV_BLOCK=""
if [[ "$MODE" == "global" && -n "$WORK_ROOT" ]]; then
  ENV_BLOCK='  "env": {
    "CLAUDE_HARNESS_WORK_ROOT": "'"$WORK_ROOT"'"
  },
'
fi

cat > "$SETTINGS_FILE" << SETTINGS_EOF
{
${ENV_BLOCK}  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash|Write",
        "hooks": [
          {
            "type": "command",
            "command": "node \"$HOOKS_UNIX/safety-check.js\""
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "node \"$HOOKS_UNIX/catalog-trigger.js\""
          },
          {
            "type": "command",
            "command": "node \"$HOOKS_UNIX/drift-check.js\""
          }
        ]
      }
    ],
    "PreCompact": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "node \"$HOOKS_UNIX/pre-compact.js\""
          }
        ]
      }
    ],
    "SessionStart": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "echo \"SESSION START: Before doing anything else — read tasks/$(if [[ "$WORKFLOW_PACK" == "solo" ]]; then echo 'notes.md and tasks/plan.md'; else echo 'lessons.md, todo.md, pr-queue.md, and flags-and-notes.md'; fi)\""
          }
        ]
      }
    ],
    "SessionEnd": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "node \"$HOOKS_UNIX/session-log.js\""
          }
        ]
      }
    ]
  }
}
SETTINGS_EOF

# ── Verify installation ───────────────────────────────────────────────────────
echo "  Verifying installation..."
VERIFY_FAIL=0
[[ ! -f "$TARGET/skills/story/SKILL.md" ]]        && echo "  [MISSING] skills/story/SKILL.md"        && VERIFY_FAIL=1
[[ ! -f "$TARGET/hooks/safety-check.js" ]]        && echo "  [MISSING] hooks/safety-check.js"        && VERIFY_FAIL=1
[[ ! -f "$TARGET/rules/code-style.md" ]]          && echo "  [MISSING] rules/code-style.md"          && VERIFY_FAIL=1
[[ ! -f "$TARGET/trackers/active/get-issue.sh" ]] && echo "  [MISSING] trackers/active/get-issue.sh" && VERIFY_FAIL=1
[[ ! -f "$TARGET/trackers/lib/retry.sh" ]]        && echo "  [MISSING] trackers/lib/retry.sh"        && VERIFY_FAIL=1

# Dev-only files must NOT be present in the install.
for forbidden in package.json node_modules eslint.config.js __tests__ coverage; do
  if [[ -e "$TARGET/$forbidden" ]] || compgen -G "$TARGET/*/$forbidden" >/dev/null 2>&1; then
    echo "  [LEAKED]  $forbidden — dev-only artefact found in install" && VERIFY_FAIL=1
  fi
done

if [[ "$VERIFY_FAIL" -eq 0 ]]; then
  echo "  [OK] All critical files present, no dev artefacts leaked"
fi

# Scan for any unresolved YOUR_ placeholders in installed files
echo "  Scanning for unresolved placeholders..."
ORPHAN_COUNT=0
while IFS= read -r line; do
  if [[ -n "$line" ]]; then
    echo "  [PLACEHOLDER] $line"
    ORPHAN_COUNT=$((ORPHAN_COUNT + 1))
  fi
done < <(grep -rn 'YOUR_' "${SED_DIRS[@]}" --include="*.md" --include="*.sh" --include="*.js" --include="*.json" --include="*.yaml" 2>/dev/null \
  | grep -v 'node_modules' \
  | grep -v 'CONFIGURE.md' \
  | head -20)

if [[ "$ORPHAN_COUNT" -eq 0 ]]; then
  echo "  [OK] All placeholders resolved"
else
  echo ""
  echo "  [WARN] $ORPHAN_COUNT unresolved placeholder(s) found."
  echo "  Run the installer again with correct values, or edit manually."
  echo "  See CONFIGURE.md for the full placeholder reference."
fi
echo ""

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo "  ────────────────────────────────────────────────────────────────"
echo "  claude-code-harness installed successfully."
echo "  Workflow pack: $WORKFLOW_PACK"
echo ""

if [[ "$MODE" == "global" ]]; then
  echo "  Skills are now available in every project on this machine."
else
  echo "  Skills installed in: $PROJECT_DIR"
fi

if [[ "$WORKFLOW_PACK" == "solo" ]]; then
  echo "  Get started: /implement #42  or  /implement 'add dark mode'"
  echo "  Plan your work: /plan"
else
  echo "  Get started: /story <story-id>"
  echo "  Plan a sprint: /sprint-plan <N>"
fi

echo ""

# Warn if any placeholders were left unfilled
UNFILLED=""
[[ "$USER_NAME"    == "YOUR_NAME" ]]         && UNFILLED="$UNFILLED YOUR_NAME"
[[ "$PROJECT_NAME" == "YOUR_PROJECT_NAME" ]] && UNFILLED="$UNFILLED YOUR_PROJECT_NAME"
if [[ "$TRACKER" == "ado" ]]; then
  [[ "$ADO_PROJECT"  == "YOUR_ADO_PROJECT"  ]] && UNFILLED="$UNFILLED YOUR_ADO_PROJECT"
  [[ "$ADO_REPO"     == "YOUR_ADO_REPO"     ]] && UNFILLED="$UNFILLED YOUR_ADO_REPO"
  [[ "$ADO_ORG_PATH" == "YOUR_ADO_ORG_PATH" ]] && UNFILLED="$UNFILLED YOUR_ADO_ORG_PATH"
fi
if [[ "$WORKFLOW_PACK" == "enterprise" ]]; then
  [[ "$ORG_NAME"      == "YOUR_ORG"           ]] && UNFILLED="$UNFILLED YOUR_ORG"
  [[ "$LEAD_DEV"      == "YOUR_LEAD_DEV"      ]] && UNFILLED="$UNFILLED YOUR_LEAD_DEV"
  [[ "$INFRA_PERSON"  == "YOUR_INFRA_PERSON"  ]] && UNFILLED="$UNFILLED YOUR_INFRA_PERSON"
  [[ "$DEVOPS_PERSON" == "YOUR_DEVOPS_PERSON" ]] && UNFILLED="$UNFILLED YOUR_DEVOPS_PERSON"
  [[ "$QA_PERSON"     == "YOUR_QA_PERSON"     ]] && UNFILLED="$UNFILLED YOUR_QA_PERSON"
fi

if [[ -n "$UNFILLED" ]]; then
  echo "  Note: Some values were left at their defaults:$UNFILLED"
  echo "  See CONFIGURE.md to fill them in manually."
  echo ""
fi
