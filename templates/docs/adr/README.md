# Architectural Decision Records (ADRs)

ADRs capture significant, hard-to-reverse decisions made about this codebase. They are not a change log — they are a reasoning log. Future engineers (and AI agents) read them to understand *why* the code is shaped the way it is.

---

## When to write an ADR

Write one when a decision is all three:
1. **Hard to reverse** — changing it later would cost significant refactoring or migration
2. **Surprising to a future reader** — something a reasonable engineer would question without context
3. **Has load-bearing trade-offs** — the rejected alternatives matter to the reasoning

Routine implementation choices don't need ADRs. If you're unsure, ask: "Would someone reading this code six months from now wonder why we did it this way?" If no, skip it.

## When to update CONTEXT.md instead

Use CONTEXT.md when:
- A term is being used in a new or project-specific way (glossary update)
- A module's responsibilities have shifted (module map update)
- A convention has been adopted across the codebase (conventions update)

ADRs explain decisions; CONTEXT.md explains current state. Both can be true at once.

---

## Numbering

Use sequential four-digit numbers: ADR-0001, ADR-0002, etc. The template is `0000-template.md`.

Never reuse a number. If a decision is superseded, update the old ADR's status to `superseded by ADR-XXXX` and leave it in place — the history matters.

## Status values

- `proposed` — under discussion, not yet in force
- `accepted` — in force
- `superseded by ADR-XXXX` — replaced by a later decision; leave in place for history

---

## File naming

```
docs/adr/
├── README.md           ← this file
├── 0000-template.md    ← copy this for new ADRs
├── 0001-example.md
└── 0002-example.md
```
