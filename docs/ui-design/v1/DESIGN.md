# Harness UI — design spec

The app shows every Feature the harness is building, across every repo on the machine. You see what's happening at a glance, step in only when a run needs you, and can dig into any step without opening an editor.

Working reference: `prototype/Prototype.dc.html`. Every screen and interaction below is built and clickable there. Its rendering format is a custom template, so read it for **layout, copy, states and behavior**, not as code to copy. Colors, type and motion live in `tokens.css`.

---

## 1. Principles

1. **Glance first, dig on demand.** The home screen answers "what needs me, what's running, what's next" in two seconds. Detail is one click deeper, never on the first screen.
2. **You only decide at gates.** The run asks every question at once at the plan gate, then goes straight to the PR. The UI makes answering fast: answer in place, from the board, with one click.
3. **One person to talk to.** You chat only with the **orchestrator**. Sub-agents (story-builder, suite-runner, story-reviewer) are view-only. To change what a sub-agent does, tell the orchestrator.
4. **No editor dependency.** Everything (the session, file changes, the plan, every step) is viewable in the app. There is no "Open in VS Code" button.
5. **Honest motion.** Only status moves (dots pulse, bars fill, cards slide when they change column). Nothing animates on actions you repeat all day. Respect `prefers-reduced-motion`.
6. **Plain words.** Buttons name the action ("Park it, free the slot", "Approve and build"). Errors name the problem and the fix.

### Never (anti-patterns we rejected)
- Gradient text or backgrounds, glass blur as decoration, colored left-border cards, emoji as icons.
- Monospace as a "techy" costume: mono only for code, commands, ids, times, numbers.
- Same-size icon+title+text card grids as the page structure.
- A modal for anything that isn't the ⌘K bar or the Dig deeper drawer.
- Status shown by color alone: every state also has a shape or a word (hollow dot = queued, square = stuck, the label text).

---

## 2. Status language (use everywhere)

| State | Dot | Color token | Words |
|---|---|---|---|
| Needs you (question, plan gate) | filled circle, pulsing (`.ask`) | `--amber` | "Question", "Plan gate", "Waiting on you" |
| Working | filled circle, breathing (`.live`) | `--blue` | "Building", "working · <step>" |
| Stuck | filled **square** | `--red` | "Stuck", "Stuck after 3 tries" |
| PR open, being watched | filled circle | `--violet` | "PR #212 · checks pass · ready to merge" |
| Queued / idle | **hollow** circle | `--hollow` border | "Ready · next free slot", "Starts after X", "not used yet" |
| Done / merged | filled circle | `--done` | "Merged 2 h ago" |

Story progress bar = one 4px segment per story: gray done, blue in progress, amber question, red stuck, empty not started.

---

## 3. App shell

- **Header** (every screen): logo button (goes home) · ⌘K search button "Jump to, answer, or run…" · Board/Focus switch · "Live" indicator · **New feature** · "**3 need you**" pill (amber, pulsing; "All clear" when zero; click → home) · light/dark toggle (sun/moon).
- **Project rail** (home, Vision, Completed): "Projects on this Mac", then All projects + one row per repo, each with its worst status dot and an open-feature count. Click to filter everything to that project. Below: **Add a repo**. Bottom: Home, Vision & roadmap, Completed (count).
- Layout is fluid. Rails stack above content on a phone. Wide tables scroll inside their own box.

---

## 4. Screens

### 4.1 Home — Board (default)

1. **Title row**: scope ("All projects" or the repo) + summary "5 running · 3 need you · 4 up next · 2 in PR".
2. **Needs you** row: one card per decision, with the action buttons *on the card*, so most decisions never leave the board.
   - Question card (amber): the question, recommended answer first ("Top nav · recommended"), other answers, "Open chat".
   - Plan gate card (amber): "5 stories, every spec line covered. 1 question still open." → "Review the plan".
   - Stuck card (red): the cause in one line, "I added it · retry", "Park it, free the slot", "Open".
   - Empty state: dashed box "Nothing needs you. Everything is moving."
3. **Four columns, left to right in the order work flows:**
   - **Up next**: numbered queue (1, 2, 3). Each says why it's waiting: "Ready · starts at the next free slot", "Starts after Team workspaces", "Plan ready · 1 question open", "Parked by you" (parked items are not numbered).
   - **Running**: "5 of 5 slots in use. One story at a time inside each." Cards show the story bar and "Story 47 · writing code".
   - **In PR**: "Checked every 5 min until you merge."
   - **Merged**: "Moves to Completed after a day." (cards at 75% opacity)
4. **Card** (button): status dot, name, repo, story bar (if running), one-line note.
   - **Hover / focus a waiting card** → the feature it waits on gets a blue outline and the label "Blocks Invoice PDF redesign"; the hovered card says "Waiting on Team workspaces"; unrelated cards fade to 55%.
   - A card that just changed column plays `.rise` once with a blue outline for ~2 ticks.
5. **Density** setting: comfortable (12px card padding) / compact (9px 10px).

### 4.2 Home — Focus (alternative home, also the future phone view)

- Big headline: "One thing needs you. The rest is moving." / "All clear. Everything is moving."
- One decision card at a time, large buttons, "1 of 3" with ‹ › to step through.
- Below: **Running** list (rows with bars) and **Since you left** (event feed with times; new events fade in).

### 4.3 Feature run

- **Bar**: back to home · repo / feature name · status pill (Waiting on you / Building / Stuck / PR open · watching / Paused) · **Dig deeper** (blue) · **Pause run / Resume** (paused runs keep their slot).
- **Left: feature line** (vertical): Plan gate → each story (title + short sha when committed, current step when live) → Panel · 7 checks → Prove it → PR. Dots use the status language; gates not reached are dashed squares.
- **Left: Agents**
  - **Orchestrator**: chat icon, "You talk here · handed off to story-builder".
  - Label "Sub-agents · view only", then story-builder, suite-runner, story-reviewer × 2, each with an eye icon and a live status: "working · write the code" (blue), "show them red · 22s ago", "not used yet".
- **Center tabs**: **Session** · **Changes** · **Plan**. (No Terminal/Tests tabs: Dig deeper covers them.)
- **Session** (orchestrator):
  - Story dividers "Story 44 · Workspace switcher · 10:36".
  - Assistant text; the newest sentence types in with a blinking caret.
  - Tool calls as collapsible rows: verb (Read/Write/Edit/Bash/Agent) · target · result (green pass, red fail) · time. Expanded = one-line detail.
  - To-do list for the current story: Write the tests → Show them red → Write the code → Show them green → Two reviews → Commit.
  - Inline question card (amber), stuck card (red) or ready-to-merge card (violet) with action buttons.
  - A live line "writing code …" with a breathing dot.
- **Peek at a sub-agent** (click it in Agents): the center shows only that agent's steps (its reasoning + its commands, grouped by story). Top bar: "Peeking at story-builder · view only. Writes the tests, then the code." + **Back to orchestrator**. The composer is replaced by: "Sub-agents can't be messaged. Tell the orchestrator and it passes it on at the next step." + **Message the orchestrator** (prefills "About story-builder's last step: ").
- **Composer**: "To: Orchestrator", "Supervised", Enter sends, Shift+Enter new line.
- **Right: At a glance**: branch, stories committed, tests, context used, started. Then "After the PR: the run stops at the PR, checks it every 5 min, fixes review comments, moves to Completed once you merge."

### 4.4 Dig deeper (drawer)

Opens from the run bar, "See them over time ›" next to Agents, or ⌘K. Slides in from the right (`.drawer`, `--ease-drawer`), width `min(1180px, 100%)`, scrim behind; Esc or "Back to run" closes.

1. **Header**: current agent avatar · "story-builder · Working" · its command in mono · status chip · big timer (mm:ss on the current step).
   - Chip: "Last step 4s ago" → turns amber "No new step for 20s" after 15s of silence; "Waiting on you" (amber), "Stuck after 3 tries" (red), "Paused by you", "Watching the PR" (violet).
2. **Stats line**: feature name · Story 3 of 4 · Steps 27 · Files changed 4 · Tests passed 18.
3. **Agents over time**: one lane per agent (orchestrator, story-builder, suite-runner, story-reviewer) with a status line ("working now", "last 1m 28s ago", "idle").
   - Each step is a block on a shared timeline (last ~24 steps).
   - Dashed rules + labels where each Story / Panel / Prove it / PR starts; a blue "now" line on the right.
   - Block styles: done gray, expected-red step muted red, **failed attempt hatched red**, **current step animated stripes** (`.pole`), waiting amber (pulsing), stuck red. Selected = 2px ring.
   - Click a block → select that step.
4. **Step list** (newest first): avatar · step name · agent · command · result chip · time. A blue divider "**6 new since you last looked**". "Last looked" = where you were when you last closed the drawer for this feature.
5. **Step detail**: "Following live" (auto-follows the newest step) or "Back to live" after you pick an older one · **Ask about this step** (closes the drawer, opens the orchestrator chat prefilled "About story-builder's step "Write the code · story 48": ").
   - Tabs: **Thinking** (the agent's reasoning, italic, types in live on the current step) · **Raw** (the exact tool call as JSON) · **Files** (files changed with +/−, or "This step didn't change any files.").

### 4.5 Plan gate

- Bar: back · repo / feature · "Plan gate" pill · "Plan v4".
- **Left (the plan)**:
  - Goal paragraph.
  - **Stories, in build order**: number · title · "after 2" dependency · tag (changed / new / "changed in v4").
  - **Comment on a line**: hover a story → speech-bubble button → inline box "What should change on this line?" → Enter. The line updates, the sub-line turns green "Changed from your note: …", the plan version goes up, and the chat confirms. Locked after approval.
  - **Coverage table**: every spec line → the story that covers it.
  - **Questions · 2 of 3 answered**: open ones amber; options as buttons, recommended first.
  - Sticky footer: hint ("Answer the open question to approve. Nothing is built until you do.") + **Approve and build** (disabled until every question is answered). After approval: "Approved. It starts on its own when a slot frees up."
- **Right: Talk it through**: chat with the orchestrator about the plan; changes it makes show as chips (+ story 3b, ~ story 3 → 3a).
- **Writing state** (plan not ready yet): "Writing the plan" + skeleton lines; the board card shows "Writing the plan…".

### 4.6 New feature

Inline panel on home (not a modal): "Describe it, or paste an issue number" + Project select + "Write the plan". It joins Up next as "Writing the plan…", then turns into a plan gate. From ⌘K: typing something with no match + Enter opens this panel prefilled.

### 4.7 ⌘K command bar

Centered dialog, input autofocused. Groups: **Needs you** (answer questions, retry/park, review plans) · **This run** (Dig deeper, when on a run) · **Features** (jump to any) · **Commands** (New feature, light/dark, theme style, go to Board/Focus/Vision/Completed, show a project). ↑ ↓ move, ↵ runs, Esc closes. No open/close animation (used too often).

### 4.8 Vision & roadmap

Per project: the vision sentence + its features with status dot and a dependency/status note ("after Team workspaces", "running", "in PR", "needs you"). Click opens the feature.

### 4.9 Completed

Table: Feature · Project · PR · Stories · Merged. Merged features land here a day after merging.

---

## 5. Behavior rules

- **Parallel slots**: up to 5 Features run at once per machine (setting). Inside a Feature, stories run one at a time.
- **Queue**: Up next is ordered. A feature starts when (a) a slot is free, (b) its plan is approved, and (c) every feature it depends on has reached its PR. A stuck run keeps its slot until you retry or park it; parking frees the slot and the next in line starts.
- **PR**: the run stops at the PR, polls checks/comments every 5 min, fixes comments, and moves to Merged when you merge, then to Completed after a day.
- **Pause** keeps the slot. **Resume** continues from the saved step.

---

## 6. Accessibility floor

Real `<button>`/`<a>`/`<input>`+`<label>`; icon-only buttons have `aria-label`; tabs use `role="tab"`/`aria-selected`; the drawer and ⌘K are `role="dialog" aria-modal="true"`; text ≥ 4.5:1 in all four theme/tone combos; touch targets ≥ 44px where practical; tabular numbers for times and counts; status never by color alone.
