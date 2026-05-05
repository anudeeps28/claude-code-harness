---
name: debug
description: Root cause diagnosis when the 3-attempt rule triggers — stop retrying and diagnose. Builds a deterministic feedback loop first, then generates ranked falsifiable hypotheses. Mandates regression tests and instrumentation cleanup. Aliases: /debug, /diagnose. Usage: /debug
---

**Core Philosophy:** Building the feedback loop IS the skill. Without a deterministic, agent-runnable pass/fail signal, diagnosis is guessing. Refuse to proceed without one.

**Triggers:** "debug this", "diagnose this", "3-attempt rule triggered", "same error 3 times", "can't fix this", "stuck on a build error", "invoke /debug", "/debug", "/diagnose"

---

You are the diagnosis orchestrator. The 3-attempt rule has triggered — something failed 3 times and the normal approach is not working.

**Do not retry the same thing. Do not guess. Build a feedback loop first.**

---

## Step 1 — Build the feedback loop (THIS IS THE SKILL)

Before any diagnosis begins, you need a **deterministic, agent-runnable pass/fail signal** — a single command that returns PASS or FAIL reliably and quickly.

### 1a — Find or create the signal

Look for an existing signal:
- A failing test command (`dotnet test --filter "TestName"`, `npm test -- --grep "pattern"`)
- A build command that reproduces the error (`dotnet build src/Project.csproj`)
- A curl/HTTP command that triggers the failure
- A script that exercises the broken path

If none exists, try to create one:
- Write a minimal reproduction script or test that captures the failure
- Prefer the narrowest possible signal (one test > full test suite > full build)

### 1b — Verify the signal

Run the signal command. Confirm:
- It **fails** right now (reproduces the issue)
- It **fails deterministically** (run it twice — same result both times)
- It runs in **under 60 seconds** (fast enough for iterative diagnosis)

If you cannot build a deterministic signal:

> "I cannot build a reliable feedback loop for this issue.
>
> **What I tried:** [list attempts]
> **Why it's not deterministic:** [explanation]
>
> Without a pass/fail signal, diagnosis is guessing. Options:
> **(A)** You provide a reproduction command or test
> **(B)** I write a targeted test that isolates the behavior — describe the expected vs. actual
> **(C)** Manual investigation — I'll read the code and hypothesize, but with lower confidence"

**STOP.** Wait for the user to choose. Do not proceed to hypothesis generation without a signal unless the user explicitly picks option (C). *(Gate type: escalation)*

### 1c — Record the signal

State it clearly:

> **Feedback loop established:** `[exact command]`
> **Current result:** FAIL — [one-line error summary]
> **Target result:** PASS

---

## Step 2 — Collect failure context

Gather everything needed for diagnosis. Do all of these in parallel:

1. Read `tasks/lessons.md` (or `tasks/notes.md` for solo) — known fixes and patterns
2. Run:
   ```bash
   git status && git diff HEAD
   ```
   Capture the full diff of uncommitted changes.
3. Copy the exact error text from the feedback loop signal (Step 1b output).
4. Read the files involved in the failure.

---

## Step 3 — Spawn the debug agent

Spawn a **`debug-agent`** (foreground) with:
- The feedback loop command and its current output
- What was being attempted (from task files + conversation context)
- The exact error message(s) from the 3 failed attempts
- The full git diff
- Relevant file paths

Wait for the debug agent to return its diagnosis.

---

## Step 4 — Present the diagnosis

Output the debug agent's full report under:

### Diagnosis report

Then say **exactly**:

---
**STOP — [N] hypotheses above, ranked by confidence. Each is falsifiable with the feedback loop. Which do you want to test? (Say "1", "2", etc., or describe a different direction.)**

---

Do NOT attempt any fix until the user chooses. *(Gate type: escalation)*

---

## Step 5 — Test one hypothesis at a time

Once the user picks a hypothesis:

1. Confirm: "Testing hypothesis [N]: [name]. I'll change exactly one variable: [what]. The feedback loop should flip from FAIL to PASS if this hypothesis is correct."
2. Wait for the user to say "go".
3. Make **exactly one change** — the minimum edit to test the hypothesis. Do not fix other things along the way.
4. Run the feedback loop signal.

**If PASS:**
- Hypothesis confirmed. Proceed to Step 6.

**If still FAIL:**
- Hypothesis falsified. Report: "Hypothesis [N] falsified — feedback loop still fails after change. [one-line summary of what we learned]."
- **Revert the change** (or ask the user if they want to keep it).
- Return to Step 4 — present remaining hypotheses.

**After 3 failed hypotheses** on the same issue: *(Gate type: escalation)*

> "Three hypotheses tested, none resolved the issue. Reassessing — the root cause may be different from all initial hypotheses.
>
> **What we've ruled out:** [list]
> **New information from the tests:** [what we learned]
>
> Options:
> **(A)** I generate fresh hypotheses based on what we've learned
> **(B)** You provide additional context or a hunch
> **(C)** Stop — this needs a human deep-dive"

Wait for the user to choose.

---

## Step 6 — Add regression test

The fix is in. Now make it stick:

1. Write a test that **fails without the fix and passes with it**.
2. The test should be the narrowest assertion possible — one behavior, one test.
3. Run the full test suite to confirm no regressions.

If the user's project has no test framework set up, note it:

> "This fix should have a regression test, but no test framework is configured. Add the test command to `tasks/lessons.md` and write the test manually."

**Do not skip this step.** A fix without a regression test is a fix that will break again.

---

## Step 7 — Cleanup instrumentation

If you added any debugging instrumentation during diagnosis (console.logs, debug prints, temporary assertions, test fixtures):

1. List every piece of instrumentation added.
2. Remove each one.
3. Run the feedback loop one final time — confirm it still passes after cleanup.

> "Instrumentation cleanup complete. Removed [N] debug artifacts. Feedback loop: PASS."

---

## Cognitive bias mitigations

Apply these throughout diagnosis:

| Bias | Mitigation |
|---|---|
| **Confirmation** | For each hypothesis, actively seek **disconfirming** evidence before testing |
| **Anchoring** | Generate all hypotheses **independently** before ranking — don't let the first one anchor the rest |
| **Availability** | Treat each bug as **novel** — don't assume it's the same class as the last bug you saw |
| **Sunk cost** | Reassess after 3 failed hypotheses — discard the approach regardless of time invested |

---

## Rules

- Never proceed to hypotheses without a feedback loop (Step 1). This is the hardest rule and the most important one.
- Never test more than one variable at a time. One change → one feedback loop run → one conclusion.
- Never skip the regression test (Step 6).
- Never leave instrumentation behind (Step 7).
- Never retry the same approach that already failed 3 times.
- Never proceed past Step 4 without the user choosing a hypothesis.
- If the root cause points to an external dependency (cloud resource, team member, third-party API) — say so clearly and do not write code.
- `/debug` and `/diagnose` are aliases for this same skill.