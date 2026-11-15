# Harness UI — design spec

**Version 2 · 2026-11-13.** Adds the round-2 changes: the planning view, side chat, New project, the update notice, Settings, the answer detail panel, Pause / Stop now / Park, merge-based queueing, proof per acceptance check, and the smaller build-rule additions. Section 9 lists every change from version 1.

The app is built in **Electron** and runs on **Mac and Windows**. It shows every Feature the harness is building, across every project on the computer. You see what's happening at a glance, step in only when a run needs you, and can dig into any step without opening an editor.

**Working reference:** `prototype/Prototype.dc.html`. Every screen and interaction below is built and clickable there; its script also simulates runs, slots and the queue, so the behaviour is exact. It's written in a canvas template format: read it for **layout, copy, states and behaviour**, not as code to copy. Colors, type and motion live in `tokens.css`.

---

## 1. Principles

1. **Glance first, dig on demand.** Home answers "what needs me, what's running, what's next" in two seconds. Detail is one click deeper, never on the first screen.
2. **You only decide at gates.** Questions are asked at once, with a recommended answer first, and can be answered in place with one click, from the board, Focus, the plan gate or the planning view.
3. **One agent takes instructions.** Instructions go only to the run's **orchestrator**. Sub-agents are view-only. A separate **side chat** answers questions immediately but can't change the run; it can only draft an instruction for you to send.
4. **No editor dependency.** Everything is viewable in the app. There is no "Open in VS Code".
5. **Nothing is created or built without one clear approval.** Planning ends with **Create these**; a plan gate ends with **Approve and build**.
6. **Honest motion.** Motion marks progress: a page opening, a question arriving, an answer settling, a card changing column, moving across the map. Nothing animates on actions repeated all day (pointing at answers, the ⌘K bar). Respect `prefers-reduced-motion`.
7. **Plain words.** Buttons name the action ("Park it, free the slot", "Approve and build"). Errors name the problem and the fix.

### Never
- Modals. The only overlays are the ⌘K bar and the Dig deeper drawer. The planning view and New project are full pages.
- Gradient text or backgrounds, glass blur as decoration, colored left-border cards, emoji as icons.
- Monospace as a costume: mono only for code, commands, paths, ids, times and numbers.
- Same-size icon+title+text card grids as page structure.
- Status shown by color alone: every state also has a shape or a word.

---

## 2. Status language

| State | Dot | Token | Words |
|---|---|---|---|
| Needs you | filled circle, pulsing (`.ask`) | `--amber` | "Question", "Plan gate", "Main changed", "Waiting on you" |
| Working | filled circle, breathing (`.live`) | `--blue` | "Building", "working · write the code" |
| Pausing | amber pill | `--amber` | "Pausing · finishing write the code first" |
| Stuck | filled **square** | `--red` | "Stuck", "Stuck after 3 tries" |
| PR open, watched | filled circle | `--violet` | "PR #212 · checks pass · ready to merge" |
| Queued / idle / planning / parked | **hollow** circle | `--hollow` | "Ready · next free slot", "Starts after X is merged", "Planning · grilling", "Parked by you" |
| Done / merged | filled circle | `--done` | "Merged 2 h ago" |

Story bar: one 4px segment per story. Gray = done, blue = in progress, amber = question, red = stuck, empty = not started.

---

## 3. App shell

- **Header:** logo (home) · search button "Jump to, answer, or run…" with **⌘K** on Mac or **Ctrl K** on Windows · Board / Focus · "Live" · **New feature** · "**3 need you**" pill (pulsing; "All clear" at zero) · light/dark toggle.
- **Platform wording.** Mac: ⌘K, "Projects on this Mac", `~/Projects`. Windows: Ctrl K, "Projects on this PC", `C:\Users\<you>\Projects`. (The prototype has a dashed Mac / Windows review toggle in the header. It doesn't ship.)
- **Project rail** (home, Vision, Completed, Settings):
  - "Projects on this Mac/PC", then All projects and one row per project, each with its worst status dot and an open-feature count. Click to filter everything to that project.
  - A project whose harness is older than the app shows a quiet line under its row, "Newer harness available", with **Update** (§4.11).
  - **New project** (§4.10).
  - The update notice when there is one (§4.11).
  - Bottom: Home, Vision & roadmap, Completed (count), **Settings**.
- The layout is fluid. Rails stack above content on a narrow window, and wide tables scroll inside their own box.

---

## 4. Screens

### 4.1 Home — Board (default)

1. **Title row:** scope + "5 running · 3 need you · 4 up next · 2 in PR".
2. **Needs you:** one card per decision, actions on the card.
   - **Question** (amber): the question, the context, and the answers as buttons, recommended first. Each answer has the **answer detail** (§5), which opens beside the card. Plus "Open chat".
   - **Main changed** (amber): "Main changed the same lines. Your call", naming the files, with the two answers ("Rebuild on main's version · recommended", "Keep this branch's lines") and their detail, plus "Open the run".
   - **Plan gate** (amber): "5 stories, every spec line covered. 1 question still open." → **Review the plan**.
   - **Stuck** (red): the cause in one line, "I added it · retry", "Park it, free the slot", "Open".
   - Empty: dashed box "Nothing needs you. Everything is moving."
3. **Four columns**, in the order work flows:
   - **Up next**: a numbered queue. Each card says why it's waiting:
     - "Ready · starts at the next free slot"
     - "Starts after Team workspaces **is merged**"
     - "Plan ready · 1 question open"
     - "Writing its plan · plan gate next"
     - Unnumbered: "Parked by you", "Planning · grilling", "Planning · map, 3 of 7 decided", "Planning · features ready to create", "Resumes at the next free slot".
   - **Running**: "5 of 5 slots in use. One story at a time inside each." Cards show the story bar and "Story 47 · writing code", or "Light review · 3 of 4 checks".
   - **In PR**: "Checked every 5 min until you merge."
   - **Merged**: "Moves to Completed after a day."
4. **Card hover / focus** on a waiting card: the feature it waits on gets a blue outline and the label "Blocks <name>". The hovered card says "Waiting on <name>", and unrelated cards fade to 55%. A card that just changed column plays `.rise` with a blue outline for about 2 ticks.
5. **Density:** comfortable (12px card padding) or compact (9px 10px).

### 4.2 Home — Focus

Big headline ("One thing needs you. The rest is moving."), then one decision at a time with large buttons, "1 of 3" and ‹ ›. Question cards show their answers with the **answer detail** beside the card, or a dashed hint "Point at an answer…" until you do. Below: Running, then Since you left.

### 4.3 Feature run

- **Run bar:** back · project / feature · status pill · **Dig deeper** · run controls (§4.3.1).
- **Left: feature line**
  - Plan gate → each story → review panel → Prove it → PR.
  - A committed story shows "a3f91c2 · saved to GitHub".
  - The panel step is labelled "Light review · 4 of 8" or "Full review · 8 checks", with its reason ("small change, nothing sensitive" / "touches billing").
- **Left: Agents.** The orchestrator ("You talk here · handed off to story-builder"), then "Sub-agents · view only" with a live status each. Clicking a sub-agent **peeks** at its steps, read-only, with "Back to orchestrator".
- **Center tabs:** **Session · Changes · Plan.**
- **Session:**
  - **PR summary** first, once a PR is open, with a **Not done** section at the top: each left-out story with its tracker link, or "Nothing. Every acceptance line is met."
  - Then story dividers, assistant text (the newest sentence types in), tool calls (verb · target · result · time, expandable), the current story's to-do list, inline question / stuck / ready-to-merge cards, and a live line.
- **Messages to the run** (§4.3.2) show inline with their status.
- **Composer:** messages the run only. Placeholder "Message the run. The orchestrator reads it at its next step." The footer reads left to right: "To the orchestrator · read at its next step" · "Enter sends" · the **side chat icon button** (§4.3.3) · **Send**. "Supervised" is gone.
- **Right:** At a glance (branch, stories, tests, context, started) and "After the PR…". It stays visible next to the side chat at normal width, and hides when the side chat is wide.

#### 4.3.1 Pause, Stop now, Park

| State | Status pill | Run bar |
|---|---|---|
| Running | Building | **Pause** · **Park** |
| Pause pressed | "Pausing · finishing *write the code* first" (amber), at once | **Stop now** · **Park** |
| Step saved | Paused (keeps its slot) | **Resume** · **Park** |
| Stop now | Paused at once; resume redoes that step | **Resume** · **Park** |
| Park | Same as pause, then the slot is freed and the card goes back to Up next, unnumbered: "Parked by you · <step>" | **Resume** (back in line: "Resumes at the next free slot") |

#### 4.3.2 Messages to the run

Each message you send shows "Sent · read at its next step" under the bubble, then "**Read**" (green). The orchestrator's reply follows. A message that came from side chat is labelled "From side chat".

#### 4.3.3 Side chat

- **The button:** a small 32px icon button (two chat bubbles), right of "Enter sends" and left of **Send**. It's the only way in.
  - Hover scales it to 1.06, and pressing to 0.94 (`.sc-btn`).
  - While the side chat is open it's blue (`--blueBg` / `--blue` / `--blueText`) and gives one ripple as it opens (`.sc-btn.on`). Its label switches between "Side chat: ask without interrupting the run" and "Close side chat". Clicking it again closes the panel.
- **Opening:** the panel sits directly right of the main column, so its bottom-left corner is next to the button. It **unfolds out of the button** (`.side-in`, 480ms, `--ease-drawer`): its width grows from 0, so the center column eases narrower, while a circle clip expands from that bottom-left corner. The content fades up 200ms in.
- **Closing:** it folds back into the button (`.side-out`, 280ms, `--ease-in-out`), then unmounts. With reduced motion it simply appears and disappears.
- **Panel:** "Side chat", with "Read-only. Knows the plan, the recent steps and the changes. The build keeps running."
  - A **wider / narrower** button: 380px ↔ 560px, width transition over 340ms. Inside, the content keeps a fixed width (`--sw`) so it doesn't reflow while the panel grows.
  - Close (×). Esc in its input also closes it.
- **Its own input** at the bottom: "Is this on track? Why did it…?", with **Ask** and the note "Answers now · nothing reaches the run unless you send it".
- **Answers** come at once, after a short "Looking at the run" beat. It may disagree and suggest a better option. Back and forth as long as you like.
- **Send to the run…** sits under an answer that proposes a change. It opens an editable box, "The exact instruction the run will get", with **Send to the run** and **Cancel**. Once sent, the box shows the text and "Sent to the run · read at its next step", then "Sent to the run · Read".
- Side chat is kept **per feature**, so it's there when you come back.

### 4.4 Dig deeper (drawer)

As version 1 (header with agent, status chip and timer · agent lanes over time · step list with "N new since you last looked" · step detail with Thinking / Raw / Files), plus:

- **Review panel size** in the stats line, with its reason: "Light review (4 of 8): 120 lines, nothing sensitive" or "Full review: touches login". The timeline marks the start of a "Light review" or "Full review".
- **Saved to GitHub** lane under the agent lanes: a small "↑ saved" pill at each finished story's commit.
- **Re-check results.** A panel step with findings lists them above the tabs, under "Findings · re-checked after the fix". Each shows **Fixed** (green) or **Still there** (amber).
- **Proof tab** on the Prove it step (and on later PR steps), one card per acceptance check:
  - AC id, text and **Met** / Not met.
  - Proof by kind: an inline **video player** (a recording of the app window, with play/pause, duration and a progress bar), a **response viewer** for API checks (request line, status chip, JSON body), the **test output**, or "**Signed off by you**".
- **Ask about this step** opens the orchestrator chat with "About story-builder's step "…": " typed in.

### 4.5 Plan gate

- A plan waiting for you holds **no slot**. After **Approve and build**: "Approved. It starts on its own when a slot frees up." The plan's chat works while nothing is running, with no visible difference.
- Stories in build order, each with a comment button (change a line, see "changed in v4"), and the coverage table.
- **Questions · 2 of 3 answered**, with **Accept all recommended**, a quiet secondary button next to the heading. It fills only the unanswered questions with their recommended answers, shown as selected so you can still change any. **Approve and build** stays the separate final click.
- **Answer detail (§5):**
  - Pointing at or tabbing to an answer turns the right column ("Talk it through") into "**About this answer**", with the note "click to pin".
  - Clicking an answer answers it **and pins** its detail ("pinned · Esc to close").
  - Moving away (unpinned), Esc, or **Back to the chat** returns to the chat.
  - The right column is **sticky**, so the detail stays in view however far you've scrolled.
- Sticky footer: hint + **Approve and build**, disabled until every question is answered.

### 4.6 New feature: the planning view

**New feature** (header, ⌘K, or ↵ on an unmatched ⌘K query) opens the planning view as **its own full page**, with a back button to home. It **opens up** from the button's corner (`.np-open`: clip + scale from the top right, 460ms, `--ease-drawer`). The bar shows project / "New feature · <title>" and a three-step indicator: **Describe → Talk it through** (or **Map it out**) **→ Proposed features**.

**1. Describe.**
- "What do you want to build?", with one large field: "Describe it in plain words, or paste an issue number".
- A **Project** picker, then **Plan this** (Enter plans; Shift+Enter adds a new line).
- A pasted issue number (`#58`) changes the button to **Open its plan gate** and skips straight there.

**2. Sizing.** Your idea appears as a bubble, then "Sizing it up · reading <project>" with thinking dots. The planner then says which way it's going.

**3a. Grilling** (fits in one sitting):
- "This fits in one sitting. I'll ask 4 quick questions, one at a time, with my pick first."
- **One question at a time:** an amber card with "Question 2 of 4", the question, and the answers as buttons, recommended first. Each answer has the **answer detail** (§5) in the right column.
- You can also **type a reply** ("Or answer in your own words").
- **Answered questions settle into a compact trail** above: question (muted) → answer (bold), with a check mark that draws itself (`.trail-in`).
- A short "Thinking" beat, then the **next question arrives** (`.q-in-a` / `.q-in-b`).

**3b. Wayfinder** (too big for one sitting):
- The planner proposes switching, asked as a question with the same detail: "Map it out · recommended" or "Keep going one by one".
- **The map.** The view switches to the destination plus its decision tickets as nodes. Nodes rise in one after another, then the links draw in.
  - **Open:** solid outline, hollow dot.
  - **Being worked:** blue, breathing dot.
  - **Resolved:** sunk, green check, shows the decision.
  - **Waiting on another:** dashed, "after <ticket>", not clickable.
  - The destination node shows "3 of 7 decided". There's a legend, and a progress bar of 7 segments.
- **One ticket at a time.** **Work the next ticket · <name>**, or clicking any open ticket, pans and zooms the map to centre it (`.map-layer`, 620ms, `--ease-in-out`). The ticket card below shows its question and answers.
- After you decide, the card turns to "Decided" with "You can still change it…" and **Work the next ticket**.
- **Whole map** zooms back out. **One by one** switches to grilling over the same tickets ("One by one · 3 of 7 decided · See the map").
- The map is also reachable later from **Vision & roadmap** ("Map · <title> · 3 of 7 decided", **Work the next ticket**).

**4. Right-hand live summary** (sticky):
- **Decided · n** (each new one rises in with a check), **Still open · n** as chips, and **Scope** with IN / OUT lines.
- When everything is settled, it becomes **Proposed features**:
  - Each feature with its stories in build order, "after 1" between stories, and "Starts after <feature> is merged" between features.
  - Sticky footer: **Create these 5 features** (or **Create this feature**), plus "Nothing is created until you click this. They join Up next, each heading to its own plan gate."
  - After creating, you return to the board with "5 features added to Up next. Each gets its own plan gate.", and the cards rise in.
- In the propose stage, typing to the planner is acknowledged ("That belongs in the plan gate of the feature it touches…"). The list stays the same.

**Leaving mid-plan** keeps it on the board as a hollow-dot card in Up next ("Planning · grilling" / "Planning · map, 3 of 7 decided"). Clicking it returns to the same point.

### 4.7 ⌘K command bar

As version 1. Groups: Needs you · This run (Dig deeper) · Features · Commands. Commands are New feature…, **New project…**, **Settings**, theme, theme style, go to Board / Focus / Vision / Completed, and show a project. Shown as ⌘K on Mac and Ctrl K on Windows.

### 4.8 Vision & roadmap

Per project: the vision sentence, any **maps in progress** (with **Work the next ticket**), and the project's features with a status note ("after Team workspaces is merged", "running", "in PR", "needs you").

### 4.9 Completed

Table: Feature · Project · PR · Stories · Merged.
- Each row **expands** to its acceptance record: AC id, text, **Met** / Not met, and the proof kind ("Recording · 0:14", "Response · 200 OK", "Test output", "Signed off by you").
- When the history setting has removed the proof, it reads "**Proof removed after 90 days**" (in the chosen length, in italics). The met / not met line stays.
- A feature merged with leftover stories says "**2 stories moved to Dark mode: scheduled themes**" under its name. That follow-up appears in Up next, waiting for its own plan approval.

### 4.10 New project

Full page, opened from **New project** in the rail or ⌘K, opening up from the bottom-left (`.np-open`, origin 0 100%).
1. "Add a project to this Mac/PC", with three choices (radio cards):
   - **Brand-new project**: Name, Location (default projects folder) and "Creates <path> with git" → **Create project**.
   - **Existing folder**: **Choose folder…** (native picker), then the path → **Add project**.
   - **Clone from GitHub**: URL → **Clone** ("Cloning" with dots).
2. **Harness missing:**
   - What was found ("Found: git repo · React app · no harness yet"), then "<name> doesn't have the harness yet".
   - Two cards: `.claude/` ("How the agents work in this project: their skills, rules and checks.") and `tasks/` ("Where plans, progress and history are kept. It's what the app reads.").
   - "Nothing else in your project changes." **Install and add** / **Cancel**.
3. **House rules starter:** "House rules for <name>" (the definition of done).
   - One editable line per rule, each removable (×), plus an "Add a rule" field.
   - **Looks good** saves it. Drafted from what's in the folder: a UI project gets UI rules, an empty one gets general rules.
4. **Branding offer**, only when the project has a UI and no branding file:
   - "Set up branding for <name>?", **Set up branding** (starts a short conversation that writes the brand rules, with screenshots) / **Skip for now**.
   - "If you skip, it's offered again on the first feature that changes the UI."
5. Back to the board, filtered to the new project.

### 4.11 Update notice

- The app checks daily by default. When there's an update, a calm card appears at the bottom of the project rail: "**Harness 3.3 is ready**", a **What's new** toggle with a short list, then **Update now** / **Later**.
- **Update now** shows "Updating. The app restarts in a moment." **Later** says "I'll remind you tomorrow."
- After updating, each project that needs the new harness shows the row notice (§3). **Update** on a row ("Updating…") then shows the **house rules** the update adds ("Harness 3.3 adds 2 house rules for <project>"), with the same edit / remove / **Looks good** screen.

### 4.12 Settings

Rail → **Settings** (or ⌘K). Two tabs.

**App:**
- **Parallel slots:** − 5 +. Takes effect at once; the board's "x of N slots" updates.
- **Plans written at once:** − 2 +. "Plans don't use a slot, but each one is a running session."
- **Keep step history for:** 30 days / **90 days** / 1 year / Forever. "After this, recordings and test output are removed. The met / not met record stays."
- **Check for updates:** **Daily** / Weekly, **Check now**, and "You're on Harness 3.2.0".
- **Default projects folder:** path + **Change…**.
- **Appearance:** Theme (Dark / Light), Tone (Modern / Soft), Density (Comfortable / Compact).

**Projects:** a project picker, then:
- **PR review bot:** found automatically ("CodeRabbit (found)"), or CodeRabbit, Copilot code review, Other, None.
- **Wait after the last review comment:** − 10 min +. "So it fixes a whole review at once, not one comment at a time."
- **Sensitive areas:** chips (`auth/`, `billing/`, `payments/`, `login`, `password`, `token`, `migrations/`), removable, plus an "Add a folder or word" field. "Changes that touch these folders or words always get the full review panel."

---

## 5. Answer detail panel (B1)

Used **wherever answer options appear**: the board's Needs-you card, Focus, the plan gate and the planning view.

- **Trigger:** pointing at an answer, tabbing to it, or clicking it. The pointed-at answer gets a blue outline.
- **Content:**
  - The question (small, muted).
  - The option label as a heading, with a **Recommended** tag (amber) when it is.
  - What it means.
  - **For** (green checks) and **Against** (red crosses).
  - **Pick it if** / **Skip it if** side by side in sunk boxes.
  - **Pick "<label>"**, or "Your answer." once chosen.
  - **Back to the chat** / **Back to the summary** / **Close**, depending on where it is.
- **Placement:** the plan gate and planning view use the right column, which is sticky. The board card opens it **beside the card**. Focus opens it beside the decision card.
- **Clicking an answer still answers in one click.** The panel has **no animation**, because pointing at answers is a repeated action. Esc closes it.
- Data per option: `label, recommended, means, pros[], cons[], pickIf, skipIf` (see DATA.md).

---

## 6. Behaviour rules

- **Slots:** up to N features build at once (Settings, default 5). Inside a feature, stories run one at a time. Plans and planning conversations hold no slot. "Plans written at once" caps those separately (default 2).
- **Queue:** Up next is ordered. A feature starts when (a) a slot is free, (b) its plan is approved, and (c) everything it depends on is **merged**. A stuck run or a paused run keeps its slot; a parked run frees it.
- **Review panel:** 8 checks. A small change with nothing sensitive gets the **light review** (4 of 8: security, acceptance, made-false, loosened tests). Anything touching a sensitive area gets the **full review**. Findings are fixed, then re-checked: Fixed / Still there.
- **Push:** each story is pushed to GitHub when it's committed.
- **PR:** the run stops at the PR, polls checks and comments every 5 minutes, waits the configured time after the last review comment, then fixes the whole review. It moves to Merged when you merge, then to Completed after a day.
- **Leftover stories:** merging with stories not done creates a **follow-up feature** in Up next, which needs its own plan approval.
- **Can't catch up with main:** when main changed the same lines, the run stops and asks (Needs you · "Main changed the same lines. Your call", with the files).
- **History:** recordings, responses and test output are removed after the history setting. The met / not met record is kept forever.

---

## 7. Motion summary

| Moment | Class | Duration · curve |
|---|---|---|
| Planning view / New project opens | `.np-open` | 460ms · `--ease-drawer` |
| A question arrives | `.q-in-a` / `.q-in-b` (alternate) | 380ms · `--ease-out` |
| An answer settles into the trail | `.trail-in` + `.chk` | 340ms · `--ease-out`; check draws after 140ms |
| Grilling → map | `.node-in` (stagger 55ms) then `.edge-in` (from 260ms, stagger 60ms) | 360ms / 800ms · `--ease-out` |
| Moving across the map | `.map-layer` transform | 620ms · `--ease-in-out` |
| Side chat unfolds from its button / folds back | `.side-in` / `.side-out` (+ `.sc-btn.on` ripple) | 480ms `--ease-drawer` / 280ms `--ease-in-out` |
| Dig deeper drawer | `.drawer` | 300ms · `--ease-drawer` |
| Card changes column, new item in a list | `.rise` | 260ms · `--ease-out` |
| Status dots | `.ask` / `.live` | constant |
| Pointing at answers, ⌘K open/close, answer detail | none | — |

With reduced motion, all of these are off, the map pan is instant and the links are simply shown.

---

## 8. Accessibility floor

As version 1 (real buttons, links and labelled inputs; `aria-label` on icon buttons; tabs with `role="tab"` / `aria-selected`; the drawer and ⌘K as `role="dialog" aria-modal="true"`; ≥ 4.5:1 text in all four theme/tone combos; ≥ 44px targets where practical; tabular numbers; status never by color alone), plus:
- Answer buttons use `aria-pressed` and point to the detail column with `aria-describedby`. Detail regions are `aria-live="polite"`.
- The New project choices are `role="radiogroup"` / `role="radio"`. Settings choices are radiogroups too.
- Map tickets are buttons. Locked ones are `disabled`, with an `aria-label` naming what they wait on.
- Expandable Completed rows and "What's new" use `aria-expanded`. The Side chat button uses `aria-expanded`.

---

## 9. What changed from version 1

| Item | Change |
|---|---|
| A1 | New feature is now the full-page planning view (grilling or map), replacing the inline panel |
| A2 | Side chat panel with its own input, opened from a small icon button next to Send and unfolding out of it; the composer messages the run only; "Supervised" removed |
| A3 | New project replaces Add a repo; harness install; house rules; branding offer; row Update notice |
| A4 | Update notice in the rail |
| A5 | Settings (App, Projects) |
| B1 | Answer detail panel everywhere options appear |
| B2 | Pause (pausing state) · Stop now · Park |
| B3 | Waits until dependencies are **merged** |
| B4 | Plans hold no slot; approval wording |
| B5 | "Sent · read at its next step" → "Read" |
| B6 | Proof per acceptance check; proof removal by history setting |
| B7 | Accept all recommended |
| B8 | Review panel size, re-check results, saved to GitHub, Not done, follow-up feature, main-changed card |
| — | Mac / Windows wording; Electron |
