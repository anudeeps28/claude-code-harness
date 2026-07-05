# Next Task — Mandatory Live Check

When the user asks about tasks, next work, status, or what to work on (any variation of
"what's next?", "what should I work on?", "what are the tasks?", "show me my work",
"where did we leave off?", "what's the status?"), you MUST follow this procedure.

**NEVER answer from memory, cached plan.md content, or prior conversation context alone.**

---

## Step 1 — Identify configured sources

First, read `.claude/.harness-manifest.json` → `tracker` field to determine the active tracker (github, todoist, ado, or null). This is the single source of truth for which tracker this project uses.

Check which sources exist for this project (in parallel where possible):

| Source | How to check | Priority |
|---|---|---|
| Live tracker | Read manifest `tracker` field + does `trackers/active/get-sprint-issues.sh` exist? | **Highest — always query first if configured** |
| Sprint file | Does `tasks/sprint*.md` exist? (use the highest-numbered one) | Medium |
| Plan file | Does `tasks/plan.md` exist? | Medium |
| Todo file | Does `tasks/todo.md` exist? | Low (implementation scratch) |

---

## Step 2 — Fetch live data from ALL existing sources

Run these checks (in parallel):

1. **Tracker** (if configured):
   ```bash
   bash trackers/active/get-sprint-issues.sh
   ```
   Or if installed globally: `bash ~/.claude/trackers/active/get-sprint-issues.sh`

2. **Sprint file**: Read the Master Status Table — extract stories with status New, In Progress, or Blocked.

3. **Plan file**: Read the "In Progress" and "Up Next" sections.

4. **Todo file**: Read the "In Progress", "Up Next" sections AND any `<tasks>` XML blocks (check which are partially complete — have some `✅` but not all).

---

## Step 3 — Cross-check for drift

Compare what the sources say:

- Does the tracker show tasks that aren't in the local files?
- Does plan.md/todo.md reference issues that are already closed in the tracker?
- Is there a half-done task plan in todo.md for a story that isn't in the sprint file?
- Does the sprint file show a story as "New" but plan.md says it's "In Progress"?

**If all sources agree** → proceed to Step 4.

**If sources disagree** → report the drift clearly:

```
Sources are out of sync:
- Tracker shows #42 as open, but plan.md doesn't list it
- todo.md has a half-done task plan for #38, but tracker shows #38 as completed
- Sprint file says #45 is "New" but there's already a branch for it

Run /sync-tasks to resolve, or tell me which source is correct.
```

Do NOT recommend a next task until drift is resolved or the user acknowledges it.

---

## Step 4 — Recommend next task

Priority order for what to recommend:

1. **Resume in-progress work** — if todo.md has a partially-complete `<tasks>` block, that's the most immediate thing. Say: "You have unfinished execution for #X — resume with `/run-tasks X`?"

2. **In-progress items** — anything marked in-progress in plan.md or sprint file that doesn't have a completed branch/PR yet.

3. **Up next / highest priority** — the first item in plan.md's "Up Next" section, or the highest-priority unstarted story in the sprint file, or the highest-priority open task from the tracker.

Present it concisely:

```
Next task: #42 "Add dark mode to settings"
Source: Todoist (priority 1) / plan.md "Up Next" / sprint3.md (status: New)
Start with: /implement #42
```

---

## Hard rules

- ALWAYS fetch live data. Never answer "your tasks are in Todoist" without actually querying Todoist.
- If the tracker fetch fails (CLI not installed, auth expired, network error), say so explicitly and fall back to local files — but warn that local state may be stale.
- If NO sources exist (no tracker, no plan.md, no todo.md, no sprint file), say: "No task tracking is set up. Run `/plan` to fetch from your tracker, or create `tasks/plan.md` manually."
- Never invent tasks. Only report what the sources actually contain.
- Show the source of each recommendation so the user knows where it came from.
