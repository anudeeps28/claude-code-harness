---
name: to-issues
description: Decompose a PRD into vertical-slice tracker issues. Each slice is end-to-end demoable, linked to the PRD section, tagged with risk flags, and has Given/When/Then acceptance criteria.
triggers: /to-issues
---

# /to-issues

Decompose a PRD into vertical-slice tracker issues. Each issue cuts through schema + API + UI + tests and is independently demoable. Explicit linkage to PRD sections, architecture sections, and Decision Brief assumptions.

**Triggers:** explicitly called with `/to-issues`

## Input

```
/to-issues <prd-path> [--arch <arch-path>] [--brief <brief-path>]
```

- `<prd-path>` — path to PRD file (required)
- `--arch <path>` — path to ARCHITECTURE.md (optional; enables arch-section linkage)
- `--brief <path>` — path to Decision Brief (optional; enables assumption linkage + risk flags)

## Hard input gate

Before doing anything else:
1. Check that `trackers/active/create-issue.sh` exists. If not, halt: *"Tracker adapter does not support create-issue. Run the harness installer or add `create-issue.sh` to `.claude/trackers/active/`."*
2. Verify `<prd-path>` exists. If not, halt: *"PRD file not found: `<prd-path>`. Provide a valid path."*

## Phase 1 — Read inputs

Read the PRD in full. If arch doc provided, read it. If Decision Brief provided, read it and note assumption IDs and risk tier of each.

## Phase 2 — Decompose into vertical slices

**Slicing rules (per Matt Pocock):**
- Each slice is independently demoable — a stakeholder could verify it works on its own
- Prefer many thin slices over few thick ones
- No horizontal-only slices — "add the schema column" alone is not a slice; it belongs inside a slice that delivers a visible behavior
- Each slice includes schema + API + UI + tests end-to-end as applicable

Identify 3–12 slices from the PRD. For each slice, prepare:

| Field | Content |
|---|---|
| **Title** | Imperative verb phrase, ≤ 60 characters |
| **What it delivers** | 1–2 sentences describing the end-to-end behavior |
| **PRD section** | e.g., "PRD § 3.1 — User authentication" |
| **Arch section** | e.g., "ARCHITECTURE.md § Auth service" (or "N/A") |
| **Brief assumptions** | Assumption IDs from the Decision Brief this slice validates (or "N/A") |
| **Risk flags** | Any of: `security-sensitive`, `performance-sensitive`, `customer-data-touching`, `regulated-data` |
| **Acceptance criteria** | 3–5 statements in Given/When/Then format |
| **Labels** | `needs-triage` (always) |

## Phase 3 — Review with user

Present the proposed slices as a numbered table with one-line summaries. Ask:

> "Does this decomposition look right? Any slices to merge, split, or reorder? Say 'go' to create the issues, or give feedback."

Do not proceed to Phase 4 without explicit user approval.

## Phase 4 — Create issues

For each approved slice, call:
```bash
bash trackers/active/create-issue.sh "<title>" "<body>" "needs-triage"
```

Format the body as:
```markdown
## What this slice delivers
<1–2 sentence description of the end-to-end behavior>

## Links
- PRD section: <§ reference>
- Architecture section: <reference or N/A>
- Decision Brief assumption(s): <ID list or N/A>

## Risk flags
<comma-separated flags, or "none">

## Acceptance criteria
- Given <context>, when <action>, then <outcome>
- Given ...
- Given ...
```

Print each created issue (ID + URL) as it's created. If creation fails, print the error and continue with remaining slices.

## Phase 5 — Summary

List all created issues with IDs and titles. Note any that failed. Suggest next step:

> "Run `/story <first-issue-id>` to start building the first slice."

## Constraints

- Additive only — creates issues, never modifies existing ones
- Max 20 slices per run — if the PRD warrants more, suggest splitting into delivery phases
