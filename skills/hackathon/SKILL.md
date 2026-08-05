---
name: hackathon
description: Ship a queue of small changes fast, one at a time, each verified by launching the real app and having YOUR_NAME look at it. Use when there is a demo or deadline and a list of fixes to get through — no story workspace, no planning agents, no review panel, no PR gate. Stack-agnostic — reads build, test, and branching rules from tasks/lessons.md (enterprise) or tasks/notes.md (solo). Usage: /hackathon [the list of changes, or a file that holds it]
argument-hint: Optional — the changes to work through (paste the list, or point at a queue file). If omitted, read the existing queue and continue.
---

**Core philosophy:** One change, then eyes on the running app, then the next. The loop is
*fix → build → launch → YOUR_NAME looks → next*. Speed comes from cutting **process**, never from
cutting verification: the app still gets built, the tests still get run before a push, and every
change is seen working. A change nobody looked at is not done.

**Triggers:** "hackathon mode", "we have a demo tomorrow", "let's just make these work", "fix these
one by one and launch the app", "/hackathon".

**What this is NOT:** not `/story` or `/implement` (no brief, no task plan, no evaluator, no e2e
gate) and not a licence to skip building or testing. If a change turns out to be architectural,
risky, or bigger than it looked — **stop and say so**, don't hack it in. That is the one thing that
ends hackathon mode.

---

## Phase 0 — Read the project's rules before the first edit

This skill is stack-agnostic; everything it runs comes from the project's own files. Read these once
at the start and use them for the whole session:

| What | Where | Used for |
|---|---|---|
| Build command | `tasks/lessons.md` **Build/Test commands** (enterprise) or `tasks/notes.md` (solo) | Steps 4 and 5 |
| Test commands (Level 1 / full) | same file, **Test Commands** section | Step 4, and the pre-push gate |
| Branch + commit policy | same file, **Git Commit Rules** | Landing work |
| Known build fixes and project traps | same file, **Known Build Fixes** | Step 4 — check here before debugging a build error |

**Do not hardcode or guess any of these.** If the build or test command is missing, ask for it once
and offer to write it into that file — every later change in the queue needs it too.

**The branch policy is the project's to decide, not this skill's.** Some repos are trunk-based and
push straight to `main`; the harness default is a feature branch per change. Read the rule and follow
it. Hackathon mode compresses *process*, and a branch is not the slow part.

---

## The queue

Keep every requested change in **`tasks/hackathon-<YYYY-MM-DD>.md`** — create it on the first run.
Changes get described in batches and out of order; the file is what stops any of them being lost
between sessions.

```markdown
# Hackathon queue — <date>  (demo: <when>)
| # | Change | Status | Notes |
|---|--------|--------|-------|
| 1 | Move the evidence panel to the wide column | ✅ pushed 52a5522 | |
| 2 | Side panel resizable | ✅ pushed | |
| 3 | Commit list not rendering | 🔎 in progress | |
| 4 | ... | ⬜ queued | |
```

Statuses: `⬜ queued` · `🔎 in progress` · `👀 awaiting YOUR_NAME's look` · `✅ done` · `⛔ blocked/escalated`.
Also mirror the queue into `TodoWrite` so progress is visible live (see `rules/progress-tracking.md`).
**One item `🔎 in progress` at a time** — that is the whole point of the mode.

---

## The loop (per change)

**1. Find the real cause before touching anything.** Grep for the symptom; read the component that
owns it. Most "add this" requests turn out to be "this already exists but is buried or broken" — a
missing list is often a panel that exists and got pushed below the fold. Say what you found in one
line before editing.

**2. Choose the smallest change that survives the test suite.** Prefer config over styling, styling
over markup, and markup over logic. A layout swap done with a CSS `order` property leaves the DOM —
and every test that queries it — untouched, where physically moving the elements would break both.

**3. Make the change.** Comment *why* at the point of change, especially when you deliberately did
NOT do the obvious thing. Comments are the only handover this mode has.

**4. Build — and close the running app first.** A running app can **lock its own build outputs**, so
the build fails with a file-in-use error (`MSB3021`/`MSB3027` on .NET, `EBUSY`/`EPERM` on Windows
Node, a stale lockfile elsewhere). That looks like a code error and is not. Sequence: **close the
app → build → launch**.

- Fast loop: the project's build command, scoped to the app project if the stack allows it.
- Before any commit: the **full** build and test suite — `/local-test 1` for build + unit, or the
  project's own Level 1 commands. If the project's notes say the build must be clean/non-incremental
  before testing (a common source of **false greens** from stale test binaries), obey that.

**5. Launch and look yourself.** Start the app (`/local-test 3` runs the dev server if the project
defines one) and verify with your own eyes before handing over:

- **GUI app** — screenshot the app window and *read the image*. Capture the window itself, not the
  whole screen: on a multi-monitor desktop a screen grab often catches the wrong window.
- **Web app** — load the page and read the rendered output, or screenshot it if you have a browser
  tool.
- **API or CLI** — call the endpoint or run the command and read the actual response.

Do not hand over something you have not looked at. This step catches most iterations before the
human ever sees them — that is where its value is.

**6. Hand it over specifically.** Say *what to click and what they should see* — not "have a look".
They are driving; they will paste a screenshot or describe what is off.

**7. On feedback, go back to step 1.** Do not batch-fix several points blind.

---

## Tests are not the process you're skipping

Run the full suite **before every push**, and read failures as information rather than obstacles. A
failing test in hackathon mode is usually telling you something true about the change you just made.

**The rule:**

- A test encoding a **product decision** (don't cap this height, don't animate that, this must stay
  keyboard-reachable) → **obey it and change your approach.** Before touching any guard-style
  assertion, read the commit that introduced it: `git log -S "<the assertion>" -- <test file>`. It
  usually exists because someone already hit the thing you are about to reintroduce.
- A test **pinning a structural count** (the grid declares 5 columns, the response has 3 fields) →
  **update it**, and say in the commit why the count moved.

**Never delete a test to get green.** If a test is genuinely wrong, fix it and explain the fix.

Two traps worth knowing, because both produce a **green run that means nothing**:

- A test that reads a source or config file straight off disk reflects your edit even when the
  **build failed**. Never trust a green run that followed a failed build.
- Incremental builds can leave stale test binaries, so the suite tests the previous version of the
  code. If the project's notes call for a clean build before testing, that is why.

---

## Landing work

Follow the project's **Git Commit Rules** (Phase 0) for branching and commit format — trunk-based or
feature-branch is the project's call, not this skill's.

- Batch a coherent set of changes into one commit rather than one commit per tweak.
- Never add a `Co-Authored-By` trailer.
- **Say what is untested when you push mid-hackathon.** Name the change nobody has looked at yet. Do
  not imply more confidence than you have — this mode's whole safety margin is that the queue file
  and the commit message tell the truth about what was verified.
- If pushing needs special credential handling in this repo, that recipe belongs in the project's
  notes file, not here.

---

## Project traps

Every project accumulates time-wasting quirks: the thing that must be rebuilt even for a
styling-only edit, the cached state that makes the first launch look wrong, the specificity rule that
silently loses. **These do not belong in this skill** — they are project facts, and this skill is
installed into every project.

When one costs you time, write it into `tasks/lessons.md` (**Known Build Fixes**) or `tasks/notes.md`
before moving on. Phase 0 reads that section back on the next run, so the next session pays for the
lesson once instead of every time.

---

## Ending a session

Update the queue file with what shipped (and the commit sha), what is still queued, and anything you
escalated. Add anything genuinely reusable to the project's notes file or memory — the demo is
tomorrow, but the codebase is not.
