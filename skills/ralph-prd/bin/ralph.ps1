param(
    [int]$MaxIterations = 10,
    [int]$SleepSeconds = 2,
    [string]$PrdPath = "PRD.md",
    [string]$ProgressPath = "progress.txt"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Write-Host "Starting Ralph - Max $MaxIterations iterations"
Write-Host "  PRD:      $PrdPath"
Write-Host "  Progress: $ProgressPath"
Write-Host ""

for ($i = 1; $i -le $MaxIterations; $i++) {
    Write-Host "==========================================="
    Write-Host "  Iteration $i of $MaxIterations"
    Write-Host "==========================================="

    $prompt = @"
You are Ralph, an autonomous coding agent. Do exactly ONE task per iteration.

## Paths
- PRD file:      $PrdPath
- Progress file: $ProgressPath

All relative paths in the PRD (e.g. ``src/...``, ``tests/...``) are relative to the current working directory, NOT the PRD's folder. Do not try to resolve them relative to the PRD file.

## Steps

1. Read $PrdPath and find the first user story that has at least one unchecked acceptance criterion (``[ ]``). Skip any story whose acceptance criteria are all ``[x]`` or whose header contains ``STATUS: DONE``. If a story has a mix of ``[x]`` and ``[ ]``, only implement the unchecked bullets — do NOT re-do completed work.
2. Read $ProgressPath - check the Learnings section first for patterns from previous iterations.
3. Implement that ONE story only (or the remaining unchecked bullets of a partial story).
4. Run the verify command named in the story's acceptance criteria (build, test, typecheck).

## Critical: Only Complete If Tests Pass

- If tests PASS:
  - Update $PrdPath to mark the implemented acceptance criteria as ``[x]``
  - Commit your changes with message: feat: [story title]
  - Append what worked to $ProgressPath
  - NEVER add ``Co-Authored-By: Claude`` to commit messages — the user explicitly prohibits this

- If tests FAIL:
  - Do NOT mark the task complete
  - Do NOT commit broken code
  - Append what went wrong to $ProgressPath (so next iteration can learn)

## Progress Notes Format

Append to $ProgressPath using this format:

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

After completing your task, check ${PrdPath}:
- If ALL user stories are fully ``[x]`` (every acceptance criterion checked), output exactly: <promise>COMPLETE</promise>
- If any story has remaining ``[ ]`` bullets, just end your response (next iteration will continue)
"@

    # Capture stdout+stderr and preserve newlines for reliable printing + COMPLETE token detection
    $result = (& claude --dangerously-skip-permissions -p $prompt 2>&1 | Out-String)

    Write-Host $result
    Write-Host ""

    if ($LASTEXITCODE -ne 0) {
        Write-Warning "claude exited with code $LASTEXITCODE (continuing to next iteration)"
    }

    if ($result -match "<promise>COMPLETE</promise>") {
        Write-Host "==========================================="
        Write-Host "  All tasks complete after $i iterations!"
        Write-Host "==========================================="
        exit 0
    }

    Start-Sleep -Seconds $SleepSeconds
}

Write-Host "==========================================="
Write-Host "  Reached max iterations ($MaxIterations)"
Write-Host "==========================================="
exit 1
