---
name: prototype
description: Throwaway prototyping — creates 1-3 candidate approaches in _prototype/<feature>/, writes a decision.md comparing trade-offs, and cleans up losers after the user picks a winner. Usage: /prototype <feature or question to explore>
---

**Core Philosophy:** Test taste and approach before committing. A prototype is disposable by design — it exists to answer a question, not to ship. Build fast, compare honestly, pick one, delete the rest.

**Triggers:** "prototype this", "spike this out", "try a few approaches", "compare approaches", "throwaway implementation", "test this idea", "/prototype"

---

You are the prototyping facilitator. Your job is to create 1-3 candidate implementations of a feature or approach, write a structured comparison, and help the user pick a winner. Everything lives in `_prototype/` — disposable by design.

---

## Step 0 — Register in task files

Before doing anything else, write an in-progress entry to `todo.md`:

- **Enterprise pack** (`tasks/todo.md` exists): append under the "In Progress" section:
  ```
  - [DEFINE] /prototype — <feature name from $ARGUMENTS> — started YYYY-MM-DD
  ```
- **Solo pack** (`tasks/notes.md` exists but no `tasks/todo.md`): append under any "In Progress" or "Current" section, or create one.
- If neither file exists, skip this step silently.

Use the Edit tool — one targeted append. Do NOT rewrite the whole file.

---

## Step 1 — Understand the question

Parse `$ARGUMENTS` for the feature or question to explore. Accept:
- A feature description ("dark mode toggle", "payment flow with Stripe")
- An architectural question ("should we use a queue or polling?", "REST vs GraphQL for this API")
- A UI/UX question ("tabs vs sidebar for navigation")

If the input is vague, ask one clarifying question:

> "What specific question should this prototype answer? For example:
> - 'Which approach is simpler to maintain?'
> - 'Which performs better under load?'
> - 'Which UX feels more intuitive?'
>
> Knowing the question helps me build candidates that answer it."

---

## Step 2 — Read context

Read silently if they exist:
- `CONTEXT.md` — domain glossary and conventions
- `docs/ARCHITECTURE.md` or `ARCHITECTURE.md` — existing architecture patterns
- `tasks/lessons.md` or `tasks/notes.md` — project conventions (frameworks, test commands)
- `research.md` — cached research on relevant APIs/libraries

Explore the existing codebase around the feature area to understand current patterns.

---

## Step 3 — Propose candidates

Present 1-3 candidate approaches. For each:

> **Candidate [A/B/C]: [Name]**
> - Approach: [1-2 sentences — what this does differently from the others]
> - Trade-off: [what it optimizes for vs. what it gives up]
> - Complexity: [low / medium / high]

Ask the user:

> "These are the candidates I'd prototype. Want to adjust any, add one, or remove one before I build?"

Wait for confirmation. *(Gate type: pre-flight)*

---

## Step 4 — Build the prototypes

Create the prototype directory structure:

```
_prototype/<feature-slug>/
├── candidate-a/     ← first approach
├── candidate-b/     ← second approach (if applicable)
├── candidate-c/     ← third approach (if applicable)
└── decision.md      ← comparison doc (written in Step 5)
```

For each candidate:
- Implement the minimum needed to answer the question from Step 1
- Use real project patterns from Step 2 context — not generic boilerplate
- Include a brief comment at the top of the main file: what this candidate does differently
- If the prototype needs to run, include a run command in the comment

Build candidates sequentially. Each should be independently runnable or reviewable.

---

## Step 5 — Write decision.md

After all candidates are built, write `_prototype/<feature-slug>/decision.md`:

```markdown
# Prototype: <feature name>

**Date:** YYYY-MM-DD
**Question:** <the question from Step 1>
**Candidates:** <N>

## Comparison

| Dimension | Candidate A: <name> | Candidate B: <name> | Candidate C: <name> |
|---|---|---|---|
| Complexity | | | |
| Maintainability | | | |
| Performance | | | |
| Fits existing patterns | | | |
| [question-specific dimension] | | | |

## Recommendation

**Winner: Candidate [X]** — [1-2 sentence rationale focused on answering the original question]

**Runner-up: Candidate [Y]** — [when you'd pick this one instead]

## How to promote the winner

[Specific steps to move the chosen approach from _prototype/ into the real codebase]
```

---

## Step 6 — User picks a winner

Present the decision.md content and ask:

> "Review the comparison above. Which candidate do you want to go with?
>
> **(A)** Candidate A: [name]
> **(B)** Candidate B: [name]
> **(C)** Candidate C: [name] (if applicable)
> **(D)** None — discard all and rethink"

Wait for the user's choice. *(Gate type: escalation)*

---

## Step 7 — Clean up

After the user picks:

**If A, B, or C:**
- Delete the losing candidate directories
- Keep the winner directory and decision.md
- Update decision.md: add `**Chosen:** Candidate [X]` at the top
- Say: "Kept `_prototype/<feature>/<winner>/` and cleaned up the rest. When you're ready to promote this to real code, the steps are in decision.md."

**If D (none):**
- Keep all directories intact for reference
- Update decision.md: add `**Chosen:** None — all candidates rejected` at the top
- Say: "All candidates kept for reference. decision.md updated. What would you like to try differently?"

---

## Step 8 — Update task files

Mark the prototype complete:

- **`todo.md`** — find the in-progress entry and update:
  ```
  - ✅ [DEFINE] /prototype — <feature> — winner: Candidate [X] "<name>" — output: _prototype/<feature>/
  ```

- **`flags-and-notes.md`** — append to "Important Notes":
  ```
  - [PROTOTYPE] <feature> — <date> — winner: <name> — output: _prototype/<feature>/decision.md
  ```

Use the Edit tool — targeted appends, not rewrites.

---

## Rules

- Everything goes in `_prototype/`. Never write prototype code into `src/` or the main codebase.
- Prototypes are disposable. Don't gold-plate them — minimum viable to answer the question.
- Use real project patterns (from lessons.md, existing code) — not generic tutorial code.
- Always write decision.md before asking the user to pick. The comparison is the value, not the code.
- Clean up losers after the user picks. Don't leave dead candidates lying around.
- If the user wants to promote the winner, point them to `/implement` or `/story` — don't do the promotion inside this skill.
- No emoji. Keep the format tight.
