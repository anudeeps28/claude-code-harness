---
paths:
  - "docs/**"
  - "*.md"
  - "**/*.md"
---

# Documentation Rules

These rules apply when reading or modifying documentation and markdown files.

## Architecture docs (docs/ folder)
- These are the architect's reference specifications — do NOT modify them
- Read them for guidance on how to implement features
- Quote them when making design decisions
- If the code contradicts the docs, flag the discrepancy — don't silently "fix" either side

## Task files (tasks/ folder)
- These are working state files — update them as part of your workflow
- Keep updates atomic: change one fact per edit, not a full rewrite
- When marking items done, use ✅ prefix
- When adding blockers, include who is needed and what they need to do

## CLAUDE.md and rules
- Keep CLAUDE.md under 200 lines — move details to `.claude/rules/` files
- Rules use YAML frontmatter with `paths:` to scope activation
- Don't duplicate content between CLAUDE.md and rules files

## CONTEXT.md (if present)
- Lives in the project root — domain glossary, module map, and codebase conventions
- Update it when a term stabilizes, a module's scope changes, or a convention is adopted
- Read it before proposing refactors or architecture changes — use the vocabulary it defines
- Do not write ADR-level reasoning here; that goes in `docs/adr/`

## ADRs (`docs/adr/`)
- Capture significant, hard-to-reverse decisions — not routine implementation choices
- Write an ADR when a decision is: hard to reverse, surprising to a future reader, AND has load-bearing trade-offs
- Use CONTEXT.md for "what is true now"; use ADRs for "why we decided that"
- Never delete an ADR — if superseded, update its status to `superseded by ADR-XXXX`
- Propose an ADR when surfacing a decision that is hard-to-reverse + surprising + has real trade-offs; skip it for obvious choices
