---
name: calibrate
description: Learning effectiveness dashboard. Shows how learnings are performing, promotes high-scoring ones to permanent rules, archives ineffective ones. Usage: /calibrate
---

**Core Philosophy:** The proactive learning loop should be transparent. This skill shows what the harness has learned, whether those learnings are helping, and lets you promote or prune them.

**Triggers:** User runs `/calibrate`.

---

You are the learning loop analyst. Your job is to show the user how the harness's learnings are performing and help them tune the system.

---

## Step 1 — Read all learnings

Read learnings from both scopes in **parallel**:

1. **Project learnings** — `.claude/learnings/*.json` in the project root
2. **Global learnings** — `~/.claude/learnings/*.json`
3. **Archived learnings** — `.claude/learnings/archived/*.json` and `~/.claude/learnings/archived/*.json`

If no learnings exist in either scope, output `✅ No learnings recorded yet. Run /improve-harness to extract patterns from your session history.` and stop.

---

## Step 2 — Build the dashboard

Display a markdown table for each scope (project, global) with these columns:

```markdown
## Project Learnings

| Score | Category | Learning | Injections | Recurrences | Effectiveness | Status |
|-------|----------|----------|------------|-------------|---------------|--------|
| 5     | build-fix | pg_dump needs --no-owner on Azure Flex | 8 | 1 | 87% | ⬆ PROMOTE |
| 2     | evaluator | Check null from findById in service layer | 4 | 1 | 75% | active |
| 0     | executor | Use strict mode for TypeScript config files | 1 | 0 | — | new |
| -1    | code-rabbit | Avoid bare catch blocks in async handlers | 3 | 2 | 33% | declining |

## Global Learnings

(same format)

## Archived (ineffective)

| Score | Category | Learning | Reason |
|-------|----------|----------|--------|
| -3    | planning | Always split stories above 8 points | Score dropped below -2 |
```

**Effectiveness** = `(injections - recurrences_after) / injections * 100%`. Show `—` if injections is 0.

**Status** logic:
- `score >= 5` → `⬆ PROMOTE` (candidate for permanent rule)
- `score > 0` → `active`
- `score == 0` → `new`
- `score < 0 and > -2` → `declining`
- `score <= -2` → already archived

---

## Step 3 — Show session history

Read `tasks/sessions.jsonl` and show the last 10 sessions with their learning injection data:

```markdown
## Recent Sessions

| Date | Branch | Learnings Injected | Denials | Blocks | Outcome |
|------|--------|-------------------|---------|--------|---------|
| 2026-06-10 | feat/auth-rework | 3 | 0 | 0 | clean |
| 2026-06-09 | fix/db-migration | 2 | 1 | 0 | denial |
```

**Outcome** logic:
- No denials/blocks → `clean`
- Any denial → `denial`
- Any block → `block`
- Both → `block+denial`

---

## Step 4 — Offer actions

Present the user with available actions:

### For PROMOTE candidates (score >= 5):

> Learning `<hash>` has proven effective (score: <N>, <effectiveness>% effective). Want me to:
> 1. **Promote to a permanent rule** — add it to the appropriate `rules/*.md` file
> 2. **Keep as learning** — it's working, no need to hardcode

If the user chooses to promote, read the target rule file (based on category), propose the exact edit (Before/After), and apply on confirmation. After promoting, archive the learning with a note that it was promoted.

### For declining learnings (score < 0):

> Learning `<hash>` is declining (score: <N>, <effectiveness>% effective). Want me to:
> 1. **Archive it** — stop injecting
> 2. **Reset score** — give it another chance (resets to 0)
> 3. **Keep watching** — leave as-is

### For all learnings:

> Want me to **add a new learning** manually? Provide: category, one-line learning, and context.

---

## Step 5 — Summary

End with a one-line summary:

```
Learning loop: <N> active, <M> archived, <P> ready to promote. Overall effectiveness: <X>%.
```

Overall effectiveness = total `(injections - recurrences_after) / injections * 100%` across all active learnings. Show `—` if no injections yet.

---

## What `/calibrate` must NOT do

- **Don't auto-promote or auto-archive.** Always ask the user first. Auto-archiving at score <= -2 is handled by the session-log hook, not this skill.
- **Don't modify learning files directly.** Use the learnings library functions via hook scripts, or make surgical edits to the JSON files.
- **Don't edit the harness repo.** Rule promotions target the user's installed rules, not the harness source.
- **Don't fabricate data.** If sessions.jsonl or learnings files don't exist, say so.
