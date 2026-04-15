---
name: babysit-pr
description: Drive a PR to zero review threads — fetch, categorize, fix, reply, repeat. Use when handling Code Rabbit comments, fixing PR review feedback, or working through the CR cycle. Usage: /babysit-pr <PR_ID>
argument-hint: "/babysit-pr 17009"
---

**Core Philosophy:** Drive a PR to zero review threads — analyze once, get your approval at every gate, fix and commit, and never post a reply or push code without your explicit word.

**Triggers:** "babysit PR 17009", "fix Code Rabbit comments", "handle PR review", "clear review threads", "work through the CR cycle"

---

You are babysitting PR **#$ARGUMENTS** through its Code Rabbit review cycle.

Your job: drive this PR to zero active Code Rabbit threads. You do this in loops of: fetch → analyze → fix → reply → wait 10 min → repeat.

---

## Before you start

Read `YOUR_PROJECT_ROOT\tasks\lessons.md`. Note the "PR Comment Review Process" and "Patterns Code Rabbit Flags" sections.

Check you are on the right branch:
```bash
cd YOUR_PROJECT_ROOT && git status && git branch --show-current
```

If the branch shown does not match PR #$ARGUMENTS, tell YOUR_NAME and stop.

Initialize an **attempt tracker**: a map of `{file}:{lineStart}:{commentHash}` → count. Starts empty. Persists for the entire session — you update it every loop.

The `commentHash` is the first 60 characters of the Code Rabbit comment body, lowercased and stripped of line numbers and whitespace. This ensures the same issue re-raised on a different line (after a rename or code move) is still tracked as the same attempt.

---

## Loop (repeat until done)

Each loop runs Phases 1–4 in order. A loop ends after Phase 4.

---

## Phase 1 — Fetch & Categorize

### 1A. Fetch active threads

```bash
bash "YOUR_PROJECT_ROOT/.claude/trackers/active/get-pr-review-threads.sh" $ARGUMENTS
```

If the result is `[]` or empty → say **"Zero active Code Rabbit threads on PR #$ARGUMENTS. Done!"** and stop entirely.

### 1B. Check the 3-attempt rule

For each thread, compute its key: `{file}:{lineStart}:{commentHash}` (use `"general"` as the file if `file` is null).

Check the attempt tracker. If any thread's key has a count of **3 or more**:
- Remove it from this loop's working set
- Say: **"3-attempt rule triggered for [file]:[line]. This thread has been addressed 3 times and Code Rabbit keeps re-raising it. Removing from this cycle — needs YOUR_NAME's manual review."**

### 1C. Spawn the analyst

Spawn a **`babysit-pr-analyst`** (foreground) with this prompt:
> PR ID: $ARGUMENTS
> Active threads JSON: [paste the full JSON from step 1A, excluding any threads removed in 1B]
> Categorize each thread as fix or reply. Produce the full analysis table.

Wait for it to return the categorized result.

---

## GATE 1 — Present & Approve

Output the analyst's full result under the heading:

### Code Rabbit Analysis — PR #$ARGUMENTS — Loop [N]

Then say **exactly**:

---
**GATE 1 — [X] fix items, [Y] reply items.**

Review the table above. You can:
- Change category: *"move #3 to reply"* or *"move #1 to fix"*
- Edit a fix description: *"fix #2 should also add an upper-bound check"*
- Edit a reply draft: *"change reply #1 to say ..."*
- Skip an item entirely: *"skip #4"*

**Say "go" when the plan looks right.**

---

Do NOT proceed until YOUR_NAME says "go". If corrections are given, apply them to the analyst's output and re-show the updated table, then wait again.

---

## Phase 2 — Apply Fixes

*(Skip this phase entirely if there are zero fix items after Gate 1.)*

### 2A. Increment attempt counter

For each fix item, increment its `{file}:{lineStart}:{commentHash}` count in the attempt tracker.

### 2B. Spawn the fixer

Spawn a **`babysit-pr-fixer`** (foreground) with this prompt:
> Apply these fix items to the YOUR_ORG codebase, then run full build and all tests.
>
> Fix items:
> [paste the "Fix items — detailed descriptions" section from the analyst output, with any edits from Gate 1 applied]

Wait for it to return.

### 2C. Show the fixer's report

Output the fixer's full report (build status, test status, table of changes, output tails).

**If BUILD is FAIL:**
- Attempt 1 or 2 → say: **"Build failed. I can retry with the error context. Say 'retry' to try again, or 'debug' to invoke /debug."**
- Attempt 3 → invoke `/debug` automatically. Do NOT offer a 4th attempt.
- Do NOT proceed to Gate 2 with a failing build.

---

## GATE 2 — Review Fixes Before Committing

Show the diff:
```bash
cd YOUR_PROJECT_ROOT && git diff
```

Output the diff under the heading:

### Changes to commit — PR #$ARGUMENTS

Then say **exactly**:

---
**GATE 2 — Fixes applied. Build: [PASS/FAIL]. Tests: [PASS/FAIL].**

Review the diff above. Say **"commit"** to commit and push, or tell me what to change first.

---

Do NOT commit until YOUR_NAME says "commit".

### 2D. Commit and push

When YOUR_NAME says "commit":

```bash
cd YOUR_PROJECT_ROOT && git add -A && git commit -m "Fix Code Rabbit review comments" && git push
```

**CRITICAL: Never add "Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>" or any Co-Authored-By line to the commit message.**

Confirm: **"Committed and pushed. Code Rabbit will re-analyze within ~10 minutes."**

---

## Phase 3 — Reply & Resolve

*(Skip this phase entirely if there are zero reply items after Gate 1.)*

### 3A. Show reply drafts

Output all reply drafts as a numbered list:

### Reply drafts — PR #$ARGUMENTS

1. **Thread [ID] — [file]:[line]:** *"[draft reply text]"*
2. **Thread [ID] — general:** *"[draft reply text]"*

Then say **exactly**:

---
**GATE 3 — [Y] reply drafts above.**

Edit any draft before sending: *"change reply #2 to say ..."*

**Say "send" to post all replies and resolve the threads.**

---

Do NOT post anything until YOUR_NAME says "send". If edits are given, update the drafts and re-show, then wait again.

### 3B. Post replies and resolve

For each approved reply item, run in sequence:

```bash
bash "YOUR_PROJECT_ROOT/.claude/trackers/active/reply-pr-thread.sh" $ARGUMENTS <THREAD_ID> "<REPLY_TEXT>"
```

```bash
bash "YOUR_PROJECT_ROOT/.claude/trackers/active/resolve-pr-thread.sh" $ARGUMENTS <THREAD_ID>
```

After all are done, confirm: **"[Y] threads replied to and resolved."**

Also increment the attempt counter for each reply item (same as fix items — these are addressed attempts).

---

## Phase 4 — Wait & Repeat

**If fixes were pushed in Phase 2 (new code was pushed this loop):**

Say **exactly**:

---
**GATE 4 — Fixes were pushed this loop. Code Rabbit needs ~10 minutes to re-analyze.**

Say **"wait"** to start the 10-minute timer, or **"check now"** if you know Code Rabbit has already re-analyzed.

---

Do NOT proceed until YOUR_NAME says "wait" or "check now". Do NOT skip this gate even if Code Rabbit appears to have already responded.

- If YOUR_NAME says **"wait"**: run `sleep 600`, then go back to Phase 1. Increment loop counter.
- If YOUR_NAME says **"check now"**: go back to Phase 1 immediately. Increment loop counter.

**If NO fixes were pushed (only replies, or neither):**

There is nothing new for Code Rabbit to analyze. Do a final check:

```bash
bash "YOUR_PROJECT_ROOT/.claude/trackers/active/get-pr-review-threads.sh" $ARGUMENTS
```

- If `[]` → **"PR #$ARGUMENTS has zero active Code Rabbit threads. All done!"**
- If threads remain → **"[N] threads still active. These may be from other reviewers (not Code Rabbit), or Code Rabbit threads we replied to but that aren't auto-resolved. Listing them for manual review:"** → list thread IDs, files, first line of content → stop.

---

## Hard rules (never break these)

- Never skip a GATE — always wait for YOUR_NAME's explicit word ("go", "commit", "send", "wait", "check now")
- Never commit without "commit" at Gate 2
- Never post replies without "send" at Gate 3
- Never add "Co-Authored-By" to any commit message
- 3-attempt rule: same `{file}:{lineStart}:{commentHash}` seen 3 times across loops → skip and flag
- If YOUR_NAME says **"stop"** at any point → stop immediately, summarize current state (which threads are fixed/replied/pending) and wait
- Follow the commit format from `tasks/lessons.md`
- ONE step at a time — explain what you are about to do, then do it, then stop
