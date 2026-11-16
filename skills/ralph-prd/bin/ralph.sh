#!/usr/bin/env bash
# Ralph loop runner for macOS/Linux. Bash port of ralph.ps1.
#
# Usage:
#   ./ralph.sh [--max N] [--sleep N] [--prd PATH] [--progress PATH]
#
# Defaults: --max 10  --sleep 2  --prd PRD.md  --progress progress.txt

set -uo pipefail

MAX_ITERATIONS=10
SLEEP_SECONDS=2
PRD_PATH="PRD.md"
PROGRESS_PATH="progress.txt"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --max)      MAX_ITERATIONS="$2"; shift 2 ;;
    --sleep)    SLEEP_SECONDS="$2";  shift 2 ;;
    --prd)      PRD_PATH="$2";       shift 2 ;;
    --progress) PROGRESS_PATH="$2";  shift 2 ;;
    -h|--help)
      sed -n '2,8p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

if ! command -v claude >/dev/null 2>&1; then
  echo "ERROR: 'claude' CLI not found in PATH" >&2
  exit 127
fi

echo "Starting Ralph - Max ${MAX_ITERATIONS} iterations"
echo "  PRD:      ${PRD_PATH}"
echo "  Progress: ${PROGRESS_PATH}"
echo ""

for ((i = 1; i <= MAX_ITERATIONS; i++)); do
  echo "==========================================="
  echo "  Iteration ${i} of ${MAX_ITERATIONS}"
  echo "==========================================="

  PROMPT=$(cat <<EOF
You are Ralph, an autonomous coding agent. Do exactly ONE task per iteration.

## Paths
- PRD file:      ${PRD_PATH}
- Progress file: ${PROGRESS_PATH}

All relative paths in the PRD (e.g. \`src/...\`, \`tests/...\`) are relative to the current working directory, NOT the PRD's folder. Do not try to resolve them relative to the PRD file.

## Steps

1. Read ${PRD_PATH} and find the first user story that has at least one unchecked acceptance criterion (\`[ ]\`). Skip any story whose acceptance criteria are all \`[x]\` or whose header contains \`STATUS: DONE\`. If a story has a mix of \`[x]\` and \`[ ]\`, only implement the unchecked bullets — do NOT re-do completed work.
2. Read ${PROGRESS_PATH} - check the Learnings section first for patterns from previous iterations.
3. Implement that ONE story only (or the remaining unchecked bullets of a partial story).
4. Run the verify command named in the story's acceptance criteria (build, test, typecheck).

## Critical: Only Complete If Tests Pass

- If tests PASS:
  - Update ${PRD_PATH} to mark the implemented acceptance criteria as \`[x]\`
  - Commit your changes with message: feat: [story title]
  - Append what worked to ${PROGRESS_PATH}
  - NEVER add \`Co-Authored-By: Claude\` to commit messages — the user explicitly prohibits this

- If tests FAIL:
  - Do NOT mark the task complete
  - Do NOT commit broken code
  - Append what went wrong to ${PROGRESS_PATH} (so next iteration can learn)

## Progress Notes Format

Append to ${PROGRESS_PATH} using this format:

## Iteration [N] - [Story Title]
- What was implemented
- Files changed
- Learnings for future iterations:
  - Patterns discovered
  - Gotchas encountered
  - Useful context
---

## Update AGENTS.md (If Applicable)

If you discover a reusable pattern that future work should know about:
- Check if AGENTS.md exists in the project root
- Add patterns like: 'This codebase uses X for Y' or 'Always do Z when changing W'
- Only add genuinely reusable knowledge, not task-specific details

## End Condition

After completing your task, check ${PRD_PATH}:
- If ALL user stories are fully \`[x]\` (every acceptance criterion checked), output exactly: <promise>COMPLETE</promise>
- If any story has remaining \`[ ]\` bullets, just end your response (next iteration will continue)
EOF
)

  # Capture stdout+stderr; preserve newlines for printing + COMPLETE token detection.
  RESULT=$(claude --dangerously-skip-permissions -p "$PROMPT" 2>&1)
  EXIT_CODE=$?

  printf '%s\n\n' "$RESULT"

  if [[ $EXIT_CODE -ne 0 ]]; then
    echo "WARNING: claude exited with code ${EXIT_CODE} (continuing to next iteration)" >&2
  fi

  if [[ "$RESULT" == *"<promise>COMPLETE</promise>"* ]]; then
    echo "==========================================="
    echo "  All tasks complete after ${i} iterations!"
    echo "==========================================="
    exit 0
  fi

  sleep "$SLEEP_SECONDS"
done

echo "==========================================="
echo "  Reached max iterations (${MAX_ITERATIONS})"
echo "==========================================="
exit 1
