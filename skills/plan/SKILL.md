---
name: plan
description: Read open issues, prioritize your work, and create a simple plan. Designed for solo devs — no sprints, no story points, just priorities. Usage: /plan [milestone-name]
argument-hint: "Optional milestone name to filter by"
---

**Core Philosophy:** Know what to work on next. Read your issues, sort by priority, and write it down — then pick one and `/implement` it.

**Triggers:** "what should I work on", "plan my work", "prioritize", "what's next", "plan this week"

---

You help YOUR_NAME plan their work by reading open issues and creating a simple priority list.

---

## Step 1 — Read current state

Read the current plan if one exists:
```bash
cat YOUR_PROJECT_ROOT/tasks/plan.md 2>/dev/null || echo "no existing plan"
```

Also check git state:
```bash
cd YOUR_PROJECT_ROOT && git branch --show-current && git status --short && git log --oneline -5
```

---

## Step 2 — Fetch open issues

```bash
bash "YOUR_PROJECT_ROOT/.claude/trackers/active/get-sprint-issues.sh" "$ARGUMENTS"
```

If `$ARGUMENTS` is empty, this fetches all open issues. If a milestone is provided, it filters by that milestone.

If the tracker script fails or returns nothing, ask YOUR_NAME: "No issues found. Want to add tasks manually?"

---

## Step 3 — Read project notes

If `YOUR_PROJECT_ROOT/tasks/notes.md` exists, read it for context — blockers, decisions, things waiting on others.

---

## Step 4 — Build the priority list

Analyze the issues and suggest a priority order based on:
1. **Blockers first** — anything blocking other work
2. **Dependencies** — things that must be done before other things
3. **Size** — small wins that can be shipped quickly
4. **Labels/priority** — if issues have priority labels, respect them

Present the plan:

---

### Work Plan

**As of:** [today's date]
**Open issues:** [count]
**In progress:** [any branches that exist for open issues]

| Priority | Issue | Title | Size | Notes |
|---|---|---|---|---|
| 1 | #42 | Add dark mode | Small (2 files) | No blockers |
| 2 | #38 | Fix login timeout | Small (1 file) | Bug — should fix before feature work |
| 3 | #35 | Refactor auth module | Large (12 files) | Blocked by #38 |
| — | #29 | Migrate to new API | Large | Waiting on API v2 release |

**Suggested next:** #38 — small bug fix, unblocks #35. Run `/implement #38` to start.

---

Then say:

---
**This is your current work plan. Want me to:**
- **Save it** to `tasks/plan.md`?
- **Start implementing** one of these? (say which #)
- **Adjust priorities** — tell me what to move

---

## Step 5 — Save (if confirmed)

Write the plan to `YOUR_PROJECT_ROOT/tasks/plan.md`:

```markdown
# Work Plan

**Last updated:** [date]

## In Progress
- [ ] #38 Fix login timeout — branch: `implement/38-login-timeout`

## Up Next
- [ ] #42 Add dark mode
- [ ] #35 Refactor auth module (blocked by #38)

## Backlog
- [ ] #29 Migrate to new API (waiting on external)

## Done (this cycle)
- [x] #41 Update README — merged PR #12
```

---

## Hard rules

- Never auto-save — always ask YOUR_NAME first
- Never start implementing without explicit confirmation
- If no tracker is configured, work with manual task descriptions
- Keep the plan simple — no story points, no velocity, no ceremony
- Mark blocked items clearly with what's blocking them
