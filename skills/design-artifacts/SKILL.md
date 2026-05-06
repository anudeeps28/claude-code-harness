---
name: design-artifacts
description: Generate the full project-level spec stack from ARCHITECTURE.md and PRD — DATABASE_SCHEMA, API_REFERENCE, SEQUENCE_DIAGRAMS, DATA_FLOW, DEPLOYMENT, DEVELOPMENT_GUIDE, DEBUGGING-GUIDE, TEMPLATE_SCHEMA. The missing link between DEFINE and BUILD. Usage: /design-artifacts [all | doc-name ...]
---

**Core Philosophy:** Agents during BUILD read whatever docs exist. If no specs exist, they guess. This skill generates the foundational docs that make /story and /implement reliable — grounded in the architecture and PRD, not invented from scratch.

**Triggers:** "generate design docs", "create the spec stack", "write the database schema doc", "set up project documentation", "design artifacts", "/design-artifacts"

---

You are the design artifacts generator. Your job is to produce the project-level specification documents that BUILD phase agents read for context. Every doc is grounded in the existing ARCHITECTURE.md and PRD — you don't invent scope, you document what's already decided.

**8 output docs. All by default. Individual selection supported.**

---

## Step 0 — Register in task files

Before doing anything else, write an in-progress entry to `todo.md`:

- **Enterprise pack** (`tasks/todo.md` exists): append under the "In Progress" section:
  ```
  - [DEFINE] /design-artifacts — <project name or "all docs"> — started YYYY-MM-DD
  ```
- **Solo pack** (`tasks/notes.md` exists but no `tasks/todo.md`): append under any "In Progress" or "Current" section, or create one.
- If neither file exists, skip this step silently.

Use the Edit tool — one targeted append. Do NOT rewrite the whole file.

---

## Step 1 — Input gate (pre-flight)

Read these two files — both are required:

1. **ARCHITECTURE.md** — check `docs/ARCHITECTURE.md` then `ARCHITECTURE.md` at repo root
2. **PRD.md** — check `PRD.md` at repo root

If either is missing, stop immediately:

> "I need both an ARCHITECTURE.md and a PRD.md to generate design artifacts.
>
> - ARCHITECTURE.md: [found at <path> / not found — run `/architect` first]
> - PRD.md: [found at <path> / not found — run `/prd` first]"

*(Gate type: pre-flight)*

---

## Step 2 — Gather context

Read silently (skip if not found):
- `CONTEXT.md` — domain glossary and module map
- `docs/adr/*.md` — architecture decisions
- `tasks/lessons.md` or `tasks/notes.md` — project conventions (frameworks, patterns)
- `research.md` — cached external API research
- `tasks/compliance-owners.md` — regulated data handling

If the project already has code, explore it:
- Read `package.json`, `*.csproj`, `requirements.txt`, `go.mod`, or equivalent for dependencies
- Glob `src/**/*` to understand the current structure
- Read key files (entry points, route definitions, data models) to ground the docs in reality

---

## Step 3 — Ask which docs to generate

Parse `$ARGUMENTS` for doc selection. Accept:
- `all` (default if no args) — generate all 8 docs
- Individual names: `database-schema`, `api-reference`, `sequence-diagrams`, `data-flow`, `deployment`, `development-guide`, `debugging-guide`, `template-schema`
- Multiple names: `database-schema api-reference deployment`

If the user specified individual docs, confirm:

> "Generating: [list]. The others will be skipped. Proceed?"

If `all`, proceed without asking.

**The 8 docs:**

| Doc | Output path | What it covers |
|---|---|---|
| Database Schema | `docs/DATABASE_SCHEMA.md` | Entity definitions, relationships, field types, constraints, indexes |
| API Reference | `docs/API_REFERENCE.md` | Endpoints, request/response shapes, auth, status codes |
| Sequence Diagrams | `docs/SEQUENCE_DIAGRAMS.md` | Key flows as Mermaid sequence diagrams |
| Data Flow | `docs/DATA_FLOW.md` | How data moves through the system, regulated data paths highlighted |
| Deployment | `docs/DEPLOYMENT.md` | Deployment steps, environment config, infrastructure dependencies |
| Development Guide | `docs/DEVELOPMENT_GUIDE.md` | Local setup, dev conventions, how to run the project |
| Debugging Guide | `docs/DEBUGGING-GUIDE.md` | Common problems and how to diagnose them |
| Template Schema | `docs/TEMPLATE_SCHEMA.md` | Project-specific template/schema definitions (optional) |

---

## Step 4 — Generate the docs

For each selected doc, generate content grounded in the ARCHITECTURE.md and PRD. Use the templates in `skills/design-artifacts/templates/` as the structure.

**Two modes:**

**Mode A — Project init (no existing code):**
Generate from PRD + ARCHITECTURE.md as the design spec. Entities, endpoints, and flows come from the architecture decisions and PRD requirements. Mark sections as "Planned" where implementation doesn't exist yet.

**Mode B — Mid-project (existing code):**
Read the codebase first. Entities come from actual data models. Endpoints come from actual route definitions. Flows come from actual code paths. Only add "Planned" sections for things in the PRD/architecture that haven't been built yet.

**For each doc:**
1. Check if the doc already exists at the output path
2. If it exists, read it and update only sections that changed — don't regenerate from scratch
3. If it doesn't exist, create it from the template
4. Use Mermaid for all diagrams (sequence diagrams, data flow diagrams, entity relationships)
5. Use domain vocabulary from CONTEXT.md if available
6. Highlight regulated data paths (PHI/PII) in DATA_FLOW.md

Work through docs one at a time. After each doc is written, report:

> "Wrote `docs/<NAME>.md` — [one-sentence summary of what it covers]."

---

## Step 5 — Log completion in task files

After all selected docs are written:

1. **`todo.md`** — find the in-progress entry and mark done:
   ```
   - ✅ [DEFINE] /design-artifacts — <project> — N docs generated — output: docs/
   ```

2. **`flags-and-notes.md`** — append to "Important Notes":
   ```
   - [DESIGN-ARTIFACTS] Generated N docs — <date> — output: docs/ — Status: Draft
   ```

Use the Edit tool — targeted appends, not rewrites.

---

## Step 6 — Summary

Present a summary table:

> **Design artifacts generated:**
>
> | Doc | Path | Status |
> |---|---|---|
> | Database Schema | `docs/DATABASE_SCHEMA.md` | Created / Updated / Skipped |
> | ... | ... | ... |
>
> "These docs are now available for `/story` and `/implement` to read during planning. Review them and update as the project evolves."

---

## Rules

- Never generate a doc without grounding it in ARCHITECTURE.md and PRD. No invented scope.
- Never regenerate a doc from scratch if it already exists. Update in place — preserve user edits.
- All diagrams use Mermaid. No external tools, no image generation.
- Use domain vocabulary from CONTEXT.md when available.
- Highlight regulated data paths in DATA_FLOW.md — call out where PHI/PII flows and how it's protected.
- TEMPLATE_SCHEMA.md is optional — only generate it if the PRD or architecture mentions project-specific templates or schemas.
- Mark sections as "Planned" when documenting features not yet implemented. Don't present planned work as existing.
- No emoji. Keep the format tight.
