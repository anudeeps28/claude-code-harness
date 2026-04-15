---
name: debug
description: Root cause diagnosis when the 3-attempt rule triggers — stop retrying and diagnose. Use when the same error recurs 3 times, when stuck, or when /story tells you to invoke /debug. Usage: /debug
---

**Core Philosophy:** The 3-attempt rule triggered — stop retrying and diagnose; present 2-3 ranked approaches before touching any code.

**Triggers:** "debug this", "3-attempt rule triggered", "same error 3 times", "can't fix this", "stuck on a build error", "invoke /debug"

---

You are the debug orchestrator. The 3-attempt rule has triggered — something failed 3 times and the normal approach is not working.

**Do not retry the same thing. Do not guess. Diagnose first.**

---

## Step 1 — Collect the failure context

Gather everything needed for the debug agent. Do all of these in parallel:

1. Read `YOUR_PROJECT_ROOT\tasks\todo.md` — what was being attempted, what error was seen
2. Read `YOUR_PROJECT_ROOT\tasks\lessons.md` — known fixes and patterns that might apply
3. Run:
   ```bash
   cd YOUR_PROJECT_ROOT && git status && git diff HEAD
   ```
   Capture the full diff of uncommitted changes.
4. If a build error was shown in this conversation — copy the exact error text.

---

## Step 2 — Spawn the debug agent

Spawn a **`debug-agent`** (foreground) with all of this as input:
- What was being attempted (from todo.md + conversation context)
- The exact error message(s) from the 3 failed attempts
- The full git diff (what changes are currently in the working tree)
- Relevant file paths that were being modified

Wait for the debug agent to return its full diagnosis.

---

## Step 3 — Present the diagnosis

Output the debug agent's full report under the heading:

### Debug report

Then say **exactly**:

---
**STOP — 3 approaches above, ranked by confidence. Which do you want to try? (Say "1", "2", or "3", or describe a different direction.)**

---

Do NOT attempt any implementation until YOUR_NAME chooses an approach.

---

## Step 4 — Execute the chosen approach

Once YOUR_NAME picks an approach:

1. Confirm: "Starting approach [N]: [name]. Here's exactly what I'll do: [one-paragraph plan]."
2. Wait for YOUR_NAME to say "go".
3. Implement — following the approach exactly as described in the debug report.
4. Run the verify command from the original task's `<verify>` block.
5. Run `/local-test 1` to confirm build + unit tests still pass. If Docker is available, run `/local-test 2` instead.
6. Report result (pass/fail + output).

If this attempt also fails: **stop immediately**. Do not try again. Say:

> "Approach [N] also failed. I need external input before continuing. Here's the full picture: [summary of what was tried and what failed]."

---

## Rules

- Never retry the same approach that already failed 3 times
- Never proceed past Step 3 without YOUR_NAME choosing an approach
- If the debug agent's diagnosis points to an external dependency (Azure, ADO, or a team member) — say so clearly and do not write any code