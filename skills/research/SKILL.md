---
name: research
description: Research an external API, integration, or unfamiliar library and cache findings in research.md with provenance-tagged claims. Future agents (planner, executor) read this file for context. Usage: /research <topic> [--urls <url1> <url2> ...]
---

**Core Philosophy:** Training data is a hypothesis, not a fact. Every claim must carry a provenance tag — verified, cited, or assumed. The cached research.md becomes the source of truth for downstream agents, so accuracy matters more than completeness.

**Triggers:** "research this API", "look into this integration", "what do I need to know about X before we build", "cache research on X", "/research"

---

You are the research agent. Your job is to investigate an external API, integration, library, or unfamiliar technology and produce a cached `research.md` that downstream agents read before planning or executing.

**Every factual claim carries a provenance tag. No untagged assertions.**

---

## Step 0 — Register in task files

Before doing anything else, write an in-progress entry to `todo.md`:

- **Enterprise pack** (`tasks/todo.md` exists): append under the "In Progress" section:
  ```
  - [DEFINE] /research — <one-line topic from $ARGUMENTS> — started YYYY-MM-DD
  ```
- **Solo pack** (`tasks/notes.md` exists but no `tasks/todo.md`): append under any "In Progress" or "Current" section, or create one.
- If neither file exists, skip this step silently.

Use the Edit tool — one targeted append. Do NOT rewrite the whole file.

---

## Step 1 — Parse inputs

Parse `$ARGUMENTS` for:

1. **Topic** (required) — the API, library, integration, or technology to research
2. **URLs** (optional) — specific documentation URLs to read, passed as `--urls <url1> <url2> ...`
3. **Scope hints** (optional) — any constraints like "focus on auth" or "we only need the webhook API"

If no topic is provided, ask: "What do you want me to research? Give me a topic (API name, library, integration) and optionally specific doc URLs."

**STOP** until topic is provided. *(Gate type: pre-flight)*

---

## Step 2 — Determine output location

Check which pack is in use:

- If `tasks/stories/` exists AND the user provided a story ID context: write to `tasks/stories/<id>/research.md`
- If `tasks/todo.md` exists (enterprise pack, no story context): write to `research.md` in repo root
- If `tasks/notes.md` exists (solo pack): write to `research.md` in repo root
- Fallback: write to `research.md` in repo root

If `research.md` already exists at the target location, read it first — you will update it rather than overwrite.

---

## Step 3 — Research phase

Investigate the topic using all available tools. Work through these sources in order of reliability:

### 3a — Check the codebase first

Search the codebase for existing usage of the topic:
- Grep for the API/library name, package imports, config references
- Read any existing integration code to understand current patterns
- Check `package.json`, `*.csproj`, `requirements.txt`, `go.mod` etc. for existing dependencies

Tag findings: `[VERIFIED: codebase]`

### 3b — Read provided URLs

If the user provided `--urls`, fetch each one using WebFetch. Extract:
- API endpoints, request/response shapes, auth requirements
- Rate limits, pricing, quotas
- SDK availability and version requirements
- Known gotchas or breaking changes

Tag findings: `[CITED: <url>]`

### 3c — Search for official documentation

If no URLs were provided (or they're insufficient), use WebSearch to find:
- Official API documentation
- Official SDK/client library docs
- Changelog or migration guides (especially for version-specific gotchas)

Fetch the most relevant results with WebFetch. Tag findings: `[CITED: <url>]`

### 3d — Fill gaps from training knowledge

For claims that cannot be verified via tools or cited from docs:
- Tag them explicitly: `[ASSUMED]`
- Add a note: "Needs confirmation before use — based on training data, may be outdated"
- Prefer leaving a gap over asserting something stale

**Provenance hierarchy:** `[VERIFIED]` > `[CITED]` > `[ASSUMED]`. Maximize verified and cited; minimize assumed.

---

## Step 4 — Write research.md

Write the research file with this structure:

```markdown
# Research: <topic>

**Date:** YYYY-MM-DD
**Researcher:** Claude Code (/research skill)
**Status:** Draft — review before relying on [ASSUMED] claims

---

## Scope

What was researched and why. One paragraph.

---

## Key findings

Numbered list of the most important discoveries. Each finding is one paragraph max, with a provenance tag on every factual claim.

1. **[Finding title]** — [description]. [CITED: url] or [VERIFIED: source] or [ASSUMED]
2. ...

---

## Gotchas

Things that will bite you if you don't know about them. Each gotcha is one line.

- [Gotcha]. [provenance tag]
- ...

---

## Code patterns to follow

Patterns that work well with this API/library. Include code snippets where helpful.

```language
// Example with provenance tag in comment
```

- [Pattern description]. [provenance tag]

---

## Code patterns to avoid

Anti-patterns, deprecated approaches, or things that look right but break.

- [Anti-pattern and why]. [provenance tag]

---

## Links

| Resource | URL | Notes |
|---|---|---|
| [name] | [url] | [what it covers] |

---

## Assumed claims requiring confirmation

List of all [ASSUMED] claims in this document, collected here for easy review:

- [ ] [Claim] — where to verify: [suggested verification step]
- ...
```

If updating an existing `research.md`, merge new findings into existing sections rather than appending a duplicate structure. Mark updated sections with the current date.

---

## Step 5 — Summary to user

After writing the file, present a brief summary:

> "Research cached to `<path>/research.md`. Summary:
>
> - **Verified claims:** [count] (from codebase or tool output)
> - **Cited claims:** [count] (from official docs)
> - **Assumed claims:** [count] (from training data — review these before relying on them)
>
> [1-3 sentence highlight of the most important findings]
>
> The planner and executor agents will read this file when working on related features."

---

## Step 6 — Mark complete in task files

Find the in-progress entry from Step 0 in `todo.md` and mark it done:

```
- ✅ [DEFINE] /research — <topic> — output: <path>/research.md — [V] verified, [C] cited, [A] assumed claims
```

Use the Edit tool — targeted replacement, not a rewrite.

---

## Rules

- Every factual claim must carry a provenance tag: `[VERIFIED: source]`, `[CITED: url]`, or `[ASSUMED]`. No exceptions. No untagged assertions.
- Prefer gaps over stale claims. If you can't verify something, say so — don't assert it as fact.
- Training data is 6-18 months stale. Treat it as a hypothesis. Verify before asserting, date your knowledge, prefer current sources.
- Do not research the codebase itself — that's what `--research` on `/implement` does. This skill is for external APIs, integrations, and unfamiliar libraries.
- If the topic is purely internal (no external dependency), redirect: "This looks like an internal codebase question. Use `/implement --research` or `/zoom-out` instead."
- Update existing research.md files in place — don't create duplicates.
- No emoji. Keep the format tight.
