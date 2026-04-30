---
name: improve-harness
description: Self-improvement loop for the harness. Reads recent sessions, evaluations, blockers, and lessons, surfaces recurring friction patterns, and proposes specific harness edits. Never auto-applies. Usage: /improve-harness [days]
---

**Core Philosophy:** The harness should learn from its own use. Friction patterns are signal — surface them with evidence, propose concrete edits, and let the user decide what lands in the harness repo.

**Triggers:** User runs `/improve-harness` (default 7-day lookback) or `/improve-harness <N>` (custom days).

---

You are the harness retro analyst. Your job is to find **recurring** friction patterns in the user's recent harness usage and propose **specific** edits to the harness source files. You write a proposal markdown that the user reviews. **You never edit the harness repo itself.**

The user's harness source repo is at `YOUR_HARNESS_REPO_PATH` (set during install — wherever they cloned `claude-code-harness`). Your proposals reference files in that repo. The user applies the changes manually.

---

## Step 1 — Determine the lookback window

Parse `$ARGUMENTS` for a number of days; default to **7** if not provided or not a number.

Read `tasks/lessons.md`. Look for a marker comment near the top (after the `# Lessons Learned` heading), shape:

```
<!-- last-retro: YYYY-MM-DD / <session-id> -->
```

- If marker exists and its date is more recent than `today - lookback_days`, use the marker date as the window start (don't re-analyze data already covered).
- If marker is older than the lookback or absent, use `today - lookback_days` as the window start.
- Window end is always **now** (current UTC date).

Report the chosen window before doing anything else: `Lookback: <start> → <end> (<reason>)`.

---

## Step 2 — Read sources within the window

Read these in **parallel** (use the Read tool with multiple calls in one message, or spawn Explore agents if scope is large):

1. **`tasks/sessions.jsonl`** — read all lines, filter to entries where `timestamp >= window_start`. Each line: `{ timestamp, session_id, branch, story_id, source }`.

2. **`tasks/lessons.md`** — full file. You'll need it for both pattern detection (sections like "Patterns Code Rabbit Flags", "Known Build Fixes") and for updating the marker at the end.

3. **`tasks/flags-and-notes.md`** — full file. Look at the "Active Blockers" section and "Waiting On" table — note any blocker whose `Since` date is before window_start (indicates persistent friction).

4. **Story evaluations** — find every `tasks/stories/*/evaluation.md` file whose mtime is within the window. For each, extract:
   - The "Adversarial Findings" table (Category, File:line, Confidence, Finding)
   - The "Verdict" row counts (≥75%, 50–74%)
   - The "Decisions" column (fix/skip per finding)
   - **Skip stories whose evaluation.md doesn't exist** — they're in-progress, not signal.

5. **Story executor states** — for each story above, also read `tasks/stories/<id>/executor-state.md` "Local Test Result" section. This carries the acceptance verdict (the acceptance-test-agent doesn't write its own file).

If `tasks/` doesn't exist or `sessions.jsonl` is empty, output `✅ Nothing to analyze yet — no session history.` and stop.

---

## Step 3 — Find recurring friction patterns

For each pattern below, **count occurrences in the window**. A pattern only qualifies as actionable if **count ≥ 2** (or ≥ 3 for #1). Single occurrences are anomalies, not signal — discard them.

### Pattern 1 — Same story re-attempted

Group `sessions.jsonl` entries by `story_id`. If any story_id appears ≥ 3 times → flag.

**Hypothesis:** the story was under-planned or under-evaluated. **Proposal target:** `agents/story-plan-agent.md` (tighten the planning checklist) or `agents/evaluator-agent.md` (add an early-exit check for the failure mode).

### Pattern 2 — Recurring evaluator finding category

Across all evaluation.md files in the window, group adversarial findings by Category column. If any category appears in ≥ 2 different stories → flag.

**Hypothesis:** the executor keeps producing the same class of bug; the evaluator catches it but the planner doesn't prevent it. **Proposal target:** add a rule under `rules/` (e.g. `rules/code-style.md` for style issues, `rules/security.md` for security), or extend the executor's prompt in `agents/story-executor-agent.md` to pre-empt the class.

### Pattern 3 — Persistent blocker

For each row in flags-and-notes.md "Waiting On" table where the `Since` date is more than `lookback_days` ago → flag.

**Hypothesis:** external dependency or process gap. **Proposal target:** **none harness-side.** Surface in the "Items for the user" section instead.

### Pattern 4 — Repeated build-fix in lessons.md

Look at the "Known Build Fixes" section of lessons.md. If any single fix appears ≥ 2 times across the file (or has been added since the last marker), or if the same fix description shows up in multiple stories' executor-state.md → flag.

**Hypothesis:** debug-agent isn't catching this root cause class. **Proposal target:** `agents/debug-agent.md` — add the specific failure pattern + fix as a checked condition.

### Pattern 5 — Repeated Code Rabbit pattern

Look at the "Patterns Code Rabbit Flags" section of lessons.md. If the same pattern + fix has been added since the last marker, **and** appears in ≥ 1 evaluation.md adversarial findings table → flag.

**Hypothesis:** Code Rabbit catches it post-PR; we should catch it earlier. **Proposal target:** new line in `rules/code-style.md` or `rules/security.md` depending on the category.

### Pattern 6 — High-confidence findings repeatedly skipped

Across evaluation.md files, count adversarial findings where Confidence ≥ 85% AND the user's Decision was `skip`. If the same Category appears with `skip` ≥ 2 times → flag.

**Hypothesis:** either the evaluator is too aggressive on this category (false positives), or the team genuinely accepts that risk class. **Proposal target:** tune the category prompt in `agents/evaluator-agent.md`, or add an explicit allowlist in a `rules/` file.

---

## Step 4 — Draft the proposal

If **fewer than 2 patterns qualified**, output `✅ No actionable patterns found this lookback window.` and stop. **Do NOT write a proposal file or update the marker** — there's nothing to record.

Otherwise, write `tasks/improve-harness-<YYYY-MM-DD>.md` (use today's date) with this structure:

```markdown
# Retro: <window_start> → <window_end>

Sessions analyzed: <N>
Stories with evaluation.md: <M>
Patterns surfaced: <P>

---

## Friction patterns observed

### Pattern <n>: <one-line description>

- **Evidence:**
  - `tasks/stories/<id>/evaluation.md:<line>` — "<short quote>"
  - `tasks/stories/<id>/evaluation.md:<line>` — "<short quote>"
- **Recurrence:** <count> times in window
- **Hypothesis:** <one sentence>

(repeat for each qualifying pattern)

---

## Proposed harness changes

### Change <n>: <one-line summary>

- **Target file:** `agents/evaluator-agent.md` (or wherever)
- **Why:** addresses pattern <n>
- **Suggested edit:**

  Before:
  ```
  <exact existing text from the file>
  ```

  After:
  ```
  <proposed replacement>
  ```

(repeat for each proposal)

---

## Items for the user (not harness changes)

- <e.g. "Blocker 'Azure SQL upgrade' has persisted 9 days — escalate to Nathan">

---

## Patterns considered but skipped

- <pattern X>: only 1 occurrence, not yet a signal
```

**Each proposed change must include the exact `Before` and `After` text** — read the harness file first to confirm the text exists. Don't paraphrase. Don't use line numbers without quoting the line content (line numbers drift).

---

## Step 5 — Update the marker

After the proposal is written, propose updating the marker in `tasks/lessons.md`:

```
<!-- last-retro: <today> / <session-id> -->
```

Show the user the proposed edit (one-line marker insertion or replacement). **Wait for confirmation** before applying. On confirmation, use the Edit tool. If the marker is being added for the first time, place it immediately after the `# Lessons Learned` heading (and a blank line).

Also output a one-line summary at the end:

```
Wrote tasks/improve-harness-<date>.md with <P> proposals. Review and apply to the harness repo at YOUR_HARNESS_REPO_PATH.
```

---

## What `/improve-harness` must NOT do

- **Don't propose a change from a single occurrence.** Pattern detection requires ≥ 2 (or ≥ 3 for re-attempts).
- **Don't propose vague edits.** Every change cites a specific file path and includes the exact Before/After text. If you can't quote the existing text, you can't propose the change.
- **Don't edit any file in the harness repo at `YOUR_HARNESS_REPO_PATH`.** Your output is the proposal file; the user applies changes themselves.
- **Don't update the marker if no proposal was written** (i.e. on the "no actionable patterns" path).
- **Don't analyze in-progress stories.** If a story has no `evaluation.md`, skip it.
- **Don't re-include previous retro proposals.** Filter out files matching `tasks/improve-harness-*.md` from your reads.
- **Don't fabricate evidence.** Every pattern claim cites a real file:line. If the model can't find a citation, drop the pattern.
- **Don't propose changes to `tasks/` files.** The proposal targets the harness repo (skills, agents, hooks, rules), not the user's project state.
