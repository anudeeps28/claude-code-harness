# Design changes for the next round

Changes to the Harness UI design (prototype E), agreed while planning the build on 2026-11-13. Please
work them into the canvas so they can be clicked through and iterated on.

**Keep everything in `DESIGN.md` that this file doesn't change**: the principles, the status language,
the "Never" list, the tokens in `tokens.css`, the motion rules and the accessibility floor in §6.

**Context that affects the design:** the app is built in Electron and runs on Windows and Mac. Show
platform-correct wording: ⌘K and "Projects on this Mac" on Mac, Ctrl+K and "Projects on this PC" on
Windows.

---

## A. New screens and panels

### A1. New feature: the planning view (biggest change)

Replaces the inline "Describe it, or paste an issue number" panel in §4.6.

**Flow:**
1. **New feature** opens the planning view as **its own full page**, like the feature run screen, with a
   back button home. It is not a modal (the "Never" list still holds). Enter it with a smooth transition
   so it feels like it "opens up".
2. Step one is one large field: "Describe it in plain words, or paste an issue number", plus a project
   picker and **Plan this**.
3. **Plan this** starts a planning conversation. The planner first sizes the idea and says which way it is
   going:
   - **Grilling** (fits in one sitting): one question at a time. Each question is a card with its
     answers as buttons, recommended answer first, using the **option detail panel** (B1). You can also
     type a reply. Answered questions settle into a compact trail; the next question arrives with motion.
   - **Wayfinder** (too big for one sitting): the planner proposes switching. On OK, the view
     transitions into a **map**: the destination plus its decision tickets as nodes, with status
     (open / being worked / resolved) and the links between them. You work one ticket at a time, and
     moving between tickets is animated. The map is also reachable later from Vision & roadmap, with
     **Work the next ticket**.
4. **Right-hand sidebar: the live summary.** While you talk, it fills in with decisions made, open
   questions and scope. When planning is settled it becomes the **proposed features and stories**,
   with their order and "after X" links (from `/plan-features`). **Create these** is the one approval;
   nothing is created before it.
5. After approval, the features appear in **Up next**, each heading to its own plan gate (§4.5).
6. A pasted issue number skips straight to that feature's plan gate.

**Motion:** the user wants this to feel great: questions arriving, answers settling into the trail,
the switch from grilling to the map, and moving across the map. Use the motion tokens. Motion should
mark progress, not decorate, and respect `prefers-reduced-motion`.

**Board card while planning:** "Planning · grilling" or "Planning · map, 3 of 7 decided", hollow dot.

### A2. Side chat on a feature run

New. It answers immediately while the build keeps running.

- Opens beside the run (for example sliding in on the right, or sharing the center). It is a
  conversation with a separate, **read-only** assistant that knows the plan, the recent steps and the
  current changes.
- Back and forth as long as you like. It may disagree and suggest a better option.
- **Send to the run**: it drafts the agreed instruction, you see and can edit the exact text, then it is
  sent. The sent instruction shows "Sent · read at its next step", then "Read".
- The composer gets two modes: **Side chat** (default) and **Message the run** (direct to the
  orchestrator, read at its next step).
- Drop the word **"Supervised"** from the composer.
- The side chat is kept per feature, so it is there when you come back.

### A3. New project

Replaces **Add a repo** in the project rail.

- Three choices: **Brand-new project** (name, location; creates an empty folder with git),
  **Existing folder** (pick a folder), **Clone from GitHub** (paste a URL).
- When the folder doesn't have the harness, explain what will be added (a `.claude/` folder and a
  `tasks/` folder), with **Install and add** / **Cancel**.
- When a project's harness is older than the app's, a quiet notice on that project row with
  **Update**.
- **House rules starter:** after install, show a drafted "definition of done" list for this project
  (what every finished feature must include), one line per rule, each editable or removable, with
  **Looks good** to save it. Also shown after a harness update that adds rules.
- **Branding offer:** when the project has a UI and no branding file, offer "Set up branding" (a short
  conversation that writes the brand rules, with screenshots). Skippable; it is offered again on the
  first feature that changes the UI.

### A4. Update notice

- The app checks for updates daily by default. When one exists, a calm notice (not a modal):
  "Harness 3.3 is ready", a short **What's new** list, **Update now** / **Later**.
- After the app updates, each project that needs the new harness shows the A3 project-row notice.

### A5. Settings (the design has none yet)

The things that are now settings:
- parallel slots (default 5);
- plans written at once (default 2);
- keep step history for: 30 days / 90 days (default) / 1 year / forever;
- check for updates: daily (default) / weekly;
- default projects folder;
- theme, tone, density.

**Per-project settings** (a project's own page or panel):
- **PR review bot:** detected automatically (for example CodeRabbit), editable, or "None";
- **wait after the last review comment** before fixing: default 10 minutes;
- **sensitive areas** list (folders and words that always get the full review panel), starting set
  shown, user can add to it.

---

## B. Changes to existing screens

### B1. Option detail panel (approved)

Mock: `additions/option-detail.html`. Pointing at an answer, tabbing to it, or clicking it shows that
option's detail:
- what it means;
- **For** and **Against**;
- **Pick it if** / **Skip it if**;
- a **Pick** button.

Where it appears:
- **Plan gate:** the right column ("Talk it through") becomes "About this answer" and returns to the
  chat on leave or Esc.
- **Board "Needs you" card:** the panel opens beside the card.

Clicking an answer still answers in one click. The panel itself has no animation, because pointing at
answers is a repeated action. Use it wherever answer options appear (board, plan gate, Focus view,
planning view).

### B2. Pause, Stop now, Park

- **Pause:** the status changes at once to "Pausing · finishing *Write the code* first". The run stops
  when that step is saved.
- **Stop now** is on the run bar from the start while pausing: it stops immediately, and resume redoes
  that step.
- **Park:** same as pause, then frees the slot. The card goes back to Up next, unnumbered, "Parked by
  you".

### B3. Queue rule wording

A feature now waits until what it depends on is **merged**, not just in PR. Up next wording: "Starts
after Team workspaces is merged". The waiting-on hover label stays.

### B4. Plan gate

- While a plan waits for you, it holds no slot. After **Approve and build**: "Approved. It starts on
  its own when a slot frees up."
- The plan's "Talk it through" chat works while nothing is running. Show no difference in the UI.

### B5. Messages to the orchestrator

Each sent message shows "Sent · read at its next step", then "Read".

### B6. Proof per acceptance check in Dig deeper

Next to each acceptance check, show its proof: a small inline **video player** (a recording of the app
window), a **response viewer** for API checks, or the **test output**. A check you signed off shows
"Signed off by you" instead. When the proof has been cleaned up by the history setting, show
"Proof removed after 90 days" next to the kept met / not met line.

### B7. Accept all recommended (plan gate)

A quiet secondary button near the questions: **Accept all recommended**. It fills every unanswered
question with its recommended answer (already-answered ones are left alone). Each filled answer shows as
selected, so you can still change any of them. **Approve and build** stays the separate, final click.

### B8. Small additions from the build rules

- **Review panel size** in Dig deeper: "Light review (4 of 8): 120 lines, nothing sensitive" or "Full
  review: touches login". One line, with the reason.
- **Re-check results:** each panel finding after its fix shows **Fixed** or **Still there**.
- **Pushed after each story:** the run timeline shows a small "saved to GitHub" mark per finished
  story.
- **Not done** section at the top of the PR summary in the app, listing anything left out, each with
  its tracker link.
- **Follow-up feature:** when a feature merges with stories left over, the Completed card says
  "2 stories moved to *<follow-up name>*", and the follow-up appears in Up next waiting for its own plan
  approval.
- **Can't catch up with main:** a Needs-you card, "Main changed the same lines. Your call", with the
  files named.

---

## C. Not changing

Board, Focus, Dig deeper, Completed, Vision & roadmap and ⌘K stay as designed, apart from the
additions above.

## D. Still to come

This list grows as decisions are made. Anything added after this date is marked with its date.
