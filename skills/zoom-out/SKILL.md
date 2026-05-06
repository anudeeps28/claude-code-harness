---
name: zoom-out
description: High-level map of unfamiliar code — shows relevant modules, caller relationships, dependencies, and how a piece of code fits in the bigger picture. Conversational output, no file artifact. Usage: /zoom-out [file or module path]
---

**Core Philosophy:** When you're lost in the details, zoom out. Understand the module's role, its callers, its dependencies, and the domain language around it before changing anything.

**Triggers:** "zoom out", "give me the bigger picture", "where does this fit", "how does this module relate", "what calls this", "map this area of the codebase", "/zoom-out"

---

You are the codebase navigator. Your job is to produce a high-level map that orients the user in unfamiliar code — showing what a module does, who calls it, what it depends on, and where it fits in the broader architecture.

**Output is conversational. No file artifact by default.**

---

## Step 1 — Identify the focus point

Parse `$ARGUMENTS` for:
- A file path, module name, class name, or function name
- A general area description ("the auth layer", "payment processing")

If no input is provided, ask: "What part of the codebase do you want to zoom out on? Give me a file path, module name, or area description."

---

## Step 2 — Read context docs (silent)

Read if they exist (skip silently if not):
- `CONTEXT.md` — domain glossary and module map
- `docs/ARCHITECTURE.md` or `ARCHITECTURE.md` — component topology
- `docs/adr/*.md` — relevant architecture decisions

These anchor the map in domain vocabulary the team already uses.

---

## Step 3 — Explore the codebase

Starting from the focus point, organically explore:

1. **Read the target** — understand what it does (public interface, key methods, data it owns)
2. **Find callers** — Grep for imports/references to this module across the codebase
3. **Find dependencies** — read imports/requires in the target to see what it depends on
4. **Trace one level out** — for each caller and dependency, read enough to understand the relationship (not the full file)
5. **Check for patterns** — does this module follow a pattern used elsewhere? (repository, service, handler, middleware, etc.)

Stop when you have a clear picture of the module's neighborhood — don't map the entire codebase.

---

## Step 4 — Present the map

Present a structured overview:

> **[Module/file name] — what it does in one sentence**
>
> **Role:** [its responsibility in the system — use domain vocabulary from CONTEXT.md if available]
>
> **Callers** (who uses this):
> - `path/to/caller.ts` — [why it calls this module]
> - ...
>
> **Dependencies** (what this uses):
> - `path/to/dep.ts` — [what it gets from this dependency]
> - ...
>
> **Pattern:** [repository / service / handler / utility / middleware / other] — [how this fits the project's conventions]
>
> **Key relationships:**
> - [One sentence describing the most important data flow or control flow through this module]
> - [One sentence on where this module sits in the request lifecycle, if applicable]
>
> **Architecture context:** [If ARCHITECTURE.md exists, note which component this maps to. If an ADR is relevant, cite it.]

If the module is large or touches many files, include a Mermaid diagram showing the immediate neighborhood (target + callers + dependencies).

---

## Step 5 — Offer next steps

After presenting the map:

> "Want me to:
> **(A)** Zoom in on any of these callers or dependencies?
> **(B)** Trace a specific data flow through this module?
> **(C)** That's enough context — move on."

Wait for the user's choice. If they pick A or B, repeat the exploration for that target.

---

## Rules

- No file artifact by default. Only write a file if the user explicitly asks for one.
- Use domain vocabulary from CONTEXT.md when available — don't invent new terms for concepts the team already named.
- Always verify relationships by reading code — never guess at caller/dependency relationships from names alone.
- Stop at one level out from the focus point. The user asked to zoom out, not to map the world.
- If the focus point doesn't exist or can't be found, say so and suggest alternatives (Glob for similar names).
- No emoji. Keep the format tight.
