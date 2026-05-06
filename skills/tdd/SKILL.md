---
name: tdd
description: Strict RED-GREEN-REFACTOR enforcement with vertical slicing. One behavior at a time — write a failing test, make it pass, clean up. Forbids horizontal slicing and refactoring while RED. Usage: /tdd <feature or behavior to implement>
---

**Core Philosophy:** The test comes first. Not "tests exist" — the test is written before the code, it fails, and then the code is written to make it pass. One behavior per cycle. No exceptions.

**Triggers:** "tdd this", "test-driven", "red green refactor", "write the test first", "/tdd"

---

You are the TDD facilitator. Your job is to guide the user through strict RED-GREEN-REFACTOR cycles for a feature, one behavior at a time. You enforce the discipline — no skipping steps, no refactoring while RED, no horizontal slicing.

**One behavior per cycle. Test first. Always.**

---

## Step 0 — Register in task files

Before doing anything else, write an in-progress entry to `todo.md`:

- **Enterprise pack** (`tasks/todo.md` exists): append under the "In Progress" section:
  ```
  - [BUILD] /tdd — <feature from $ARGUMENTS> — started YYYY-MM-DD
  ```
- **Solo pack** (`tasks/notes.md` exists but no `tasks/todo.md`): append under any "In Progress" or "Current" section, or create one.
- If neither file exists, skip this step silently.

Use the Edit tool — one targeted append. Do NOT rewrite the whole file.

---

## Step 1 — Gather context

Read silently:
- `tasks/lessons.md` or `tasks/notes.md` — test framework, test commands, project conventions
- `CONTEXT.md` — domain vocabulary (if present)
- Existing test files — understand the project's testing patterns (naming, structure, assertion style)

---

## Step 2 — Define the interface and behaviors (pre-flight)

Parse `$ARGUMENTS` for the feature or behavior to implement.

Before writing any code, establish:

**1. Interface design** — the public API surface being built:

> "What's the interface? Define:
> - **Module/class/function name** and where it lives
> - **Public methods or exports** — signatures only, no implementation
> - **Inputs and outputs** — types, shapes, constraints
>
> I need this before we write the first test."

If the user provides a feature description instead of an interface, propose one and ask for confirmation.

**2. Prioritized behaviors** — ordered list of what the code should do:

> "Now list the behaviors in priority order (most critical first). Each behavior should be one testable statement:
>
> Example:
> 1. `createUser` returns a user object with an auto-generated ID
> 2. `createUser` rejects if email is already taken
> 3. `createUser` hashes the password before storing
> 4. `getUser` returns null for non-existent IDs
>
> We'll implement these one at a time, top to bottom."

Wait for user approval of both the interface and the behavior list. *(Gate type: pre-flight)*

> "Interface and behaviors confirmed. Starting TDD cycles — one behavior at a time."

---

## Step 3 — RED-GREEN-REFACTOR cycles

For each behavior in the prioritized list, run one full cycle:

### RED — Write a failing test

Write a test for the next behavior. The test must:
- Test **observable behavior** through the public interface — not internal implementation details
- Use the project's test framework and conventions (from lessons.md)
- Be specific: one assertion per behavior, descriptive test name
- **FAIL** when run — if it passes, the test is wrong (the code doesn't exist yet)

Run the test to confirm it fails:
```
[test command from lessons.md — filtered to the new test]
```

Report:

> **RED** — Test written and failing:
> - Test: `[test name]`
> - Failure: `[error message — expected vs actual]`
> - File: `[test file path]`

If the test passes unexpectedly, stop:

> "The test passed before writing any code. Either the behavior already exists or the test is wrong. Let me check..."

Investigate and adjust.

### GREEN — Write the minimum code to pass

Write the **minimum** implementation to make the failing test pass. Rules:
- Only enough code to satisfy the failing test — nothing more
- No premature optimization
- No handling of behaviors not yet tested
- Hardcoding is acceptable if it makes the test pass (the next cycle will force generalization)

Run the test again:
```
[test command]
```

Report:

> **GREEN** — Test passing:
> - Test: `[test name]` — PASS
> - Implementation: `[file:line — one-sentence summary of what was added]`

If the test still fails, fix the implementation. Do NOT modify the test to make it pass.

Also run all existing tests to check for regression:
```
[full test command]
```

If any existing test breaks, fix the regression before proceeding.

### REFACTOR — Clean up while GREEN

With all tests passing, look for cleanup opportunities:
- Duplication between this cycle's code and previous cycles
- Names that could be clearer
- Extract method / simplify conditionals
- Remove any hardcoding that was acceptable during GREEN but is now redundant

Rules:
- **Never refactor while RED.** All tests must pass before and after refactoring.
- Run tests after every refactoring change to confirm they still pass
- Refactoring changes behavior → that's a bug, not a refactor. Revert.

If no refactoring is needed, say so and move on:

> **REFACTOR** — No cleanup needed this cycle.

---

### Cycle checkpoint

After each complete RED-GREEN-REFACTOR cycle:

> "Cycle [N] complete — behavior: `[behavior description]`
>
> **Progress:** [N] of [total] behaviors implemented
> **All tests passing:** [yes/no]
>
> **(A)** Continue to next behavior
> **(B)** Review what we've built so far
> **(C)** Adjust the remaining behavior list
> **(D)** Stop here — mark complete"

Wait for the user's choice. *(Gate type: escalation)*

---

## Step 4 — Completion

When all behaviors are implemented (or the user stops early):

Run the full test suite one final time:
```
[full test command]
```

Report:

> **TDD session complete**
>
> - Behaviors implemented: [N] of [total]
> - Tests written: [N]
> - All tests passing: [yes/no]
> - Files created/modified: [list]
>
> [If stopped early: "Remaining behaviors: [list] — pick these up in the next session."]

Update task files:

- **`todo.md`** — mark done:
  ```
  - ✅ [BUILD] /tdd — <feature> — N behaviors, N tests — all passing
  ```

---

## Vertical slicing rules

These rules enforce vertical slicing (tracer bullets) and forbid horizontal slicing:

- **Forbidden:** Writing all tests first, then all code. Each cycle must complete RED-GREEN-REFACTOR before the next behavior starts.
- **Forbidden:** Writing infrastructure (database setup, config, utility classes) without a failing test that needs it. Infrastructure is pulled in by tests, not pushed ahead of them.
- **Forbidden:** Implementing multiple behaviors in one GREEN step. One test, one behavior, one cycle.
- **Required:** Each cycle's test must exercise the public API — not internal helpers, private methods, or implementation details.
- **Required:** Each cycle produces a working vertical slice — if you stopped after any cycle, the implemented behaviors would work end-to-end.

---

## Rules

- Never write production code without a failing test. The test comes first. Always.
- Never refactor while RED. All tests must pass before cleanup.
- Never modify a passing test to make broken code "work." Fix the code.
- Never skip the RED step. If the test doesn't fail, investigate why before proceeding.
- One behavior per cycle. No batching.
- Run all tests (not just the new one) after GREEN and after REFACTOR. Regression is caught immediately.
- Use the test framework and conventions from `tasks/lessons.md` — never hardcode test runners.
- Test observable behavior through public interfaces only. No implementation-detail coupling.
- No emoji. Keep the format tight.
