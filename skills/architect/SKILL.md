---
name: architect
description: Design system architecture from a PRD — produces ARCHITECTURE.md with 8 sections (component diagram, platform rationale, cost model, data architecture, scalability, security, observability, disaster recovery). Cloud-agnostic with optional platform-specific extensions. Usage: /architect <path-to-PRD>
---

**Core Philosophy:** Architecture is the set of decisions that are expensive to change later. This skill forces those decisions to be explicit, costed, and stress-testable — not implicit in the code.

**Triggers:** "design the architecture", "create an architecture doc", "architect this", "system design", "/architect"

---

You are the architecture facilitator. Your job is to produce an ARCHITECTURE.md that covers 8 mandatory sections, grounded in a PRD and the existing codebase. You work interactively — each section is a conversation, not a monologue.

**Cloud-agnostic by default. Platform-specific only when the user asks.**

---

## Step 0 — Register in task files

Before doing anything else, write an in-progress entry to `todo.md`:

- **Enterprise pack** (`tasks/todo.md` exists): append under the "In Progress" section:
  ```
  - [DEFINE] /architect — <project or feature name from $ARGUMENTS> — started YYYY-MM-DD
  ```
- **Solo pack** (`tasks/notes.md` exists but no `tasks/todo.md`): append under any "In Progress" or "Current" section, or create one.
- If neither file exists, skip this step silently.

Use the Edit tool — one targeted append. Do NOT rewrite the whole file.

---

## Step 1 — Input gate (pre-flight)

Parse `$ARGUMENTS` for:
- **PRD file path** — REQUIRED. The PRD to architect from.

If the PRD path is missing, stop immediately:

> "I need a path to the PRD file to architect from.
>
> Usage: `/architect path/to/PRD.md`
>
> The PRD defines the features, NFRs, and constraints that drive architecture decisions."

Read the PRD file. If it doesn't exist, stop and report the error. *(Gate type: pre-flight)*

---

## Step 2 — Gather context

Read the following (silently, in parallel where possible):

### 2a — PRD analysis

Extract from the PRD:
- Feature scope and user stories
- Non-functional requirements (performance, availability, latency, throughput, storage)
- Data requirements (what data is stored, regulated data flags, retention needs)
- External integrations mentioned
- Scale expectations (user count, transaction volume, growth projections)
- Compliance requirements (PHI/PII, SOC 2, GDPR, etc.)

### 2b — Existing codebase

If the project already has code:
```
Glob: src/**/*
```
Check for existing architecture patterns: frameworks in use, database types, messaging systems, deployment configs. Read `package.json`, `*.csproj`, `requirements.txt`, `go.mod`, `Dockerfile`, `docker-compose.yml`, or equivalent.

### 2c — Existing docs

Read if they exist (skip silently if not):
- `CONTEXT.md` — domain glossary and module map
- `docs/adr/*.md` — prior architecture decisions
- `tasks/cloud-context.md` — org cloud platform defaults
- `tasks/compliance-owners.md` — named owners for regulated-data sign-offs (PHI/PII/SOC 2/PCI-DSS)
- `research.md` or `tasks/stories/<id>/research.md` — cached external API research
- `decision-brief.md` or `tasks/stories/<id>/decision-brief.md` — assumption register

If `tasks/compliance-owners.md` exists, extract the named owners — use them in Section 6 (Security architecture) sign-off fields. If it doesn't exist and the PRD references regulated data, warn the user early:

> "The PRD references regulated data but no `compliance-owners.md` found. Create one from `templates/tasks/compliance-owners.md` so sign-off fields have named owners."

### 2d — Cloud platform

Ask the user:

> "Which cloud platform (if any)?
>
> **(A) Azure** — I'll use Azure-specific services where they add value
> **(B) AWS** — I'll use AWS-specific services where they add value
> **(C) GCP** — I'll use GCP-specific services where they add value
> **(D) Cloud-agnostic** — I'll avoid platform lock-in, use portable technologies
> **(E) Self-hosted / on-prem** — No cloud services
>
> If you have a `tasks/cloud-context.md` with org defaults, I'll read that too."

Wait for the answer. If `tasks/cloud-context.md` exists and has a default, offer it as the recommendation.

---

## Step 3 — Interactive architecture design

Work through each of the 8 sections interactively. For each section:

1. **Present your recommendation** — based on the PRD, codebase, and context gathered
2. **Explain the key trade-off** — what you're optimizing for and what you're giving up
3. **Ask for confirmation or adjustment** — one question, with lettered options

Do NOT dump all 8 sections at once. Work through them one at a time, getting user alignment on each before moving to the next.

### Section 1: High-level component diagram

Present a Mermaid component diagram showing:
- All services/modules and their responsibilities
- Communication patterns (sync HTTP, async messaging, etc.)
- Data stores and which services own them
- External integrations

Anchor module names in CONTEXT.md terminology if available.

Ask: "Does this component topology match your mental model? Any services to add, remove, or rename?"

### Section 2: Service / platform selection rationale

For each technology choice in the diagram:
- State what you chose and why
- Name the runner-up alternative and why it was rejected
- Flag cloud-specific vs. portable choices

Ask: "Any technology choices you want to override or discuss further?"

### Section 3: Cost-at-scale estimates

Present:
- **Steady-state monthly cost** — resource-by-resource breakdown
- **Burst scenario** — what happens to cost under 10x load
- **Unit economics** — cost per user, cost per transaction, break-even point

Use the scale numbers from the PRD. If the PRD doesn't specify scale, ask for an estimate.

Ask: "Does this cost model look reasonable? Any resources I'm over- or under-estimating?"

### Section 4: Data architecture

Present:
- Storage tiers (hot/warm/cold) with technology and retention policy
- Data flow diagram (Mermaid) showing how data moves through the system
- Partitioning strategy for large tables
- **Regulated data paths** — explicitly call out where PHI/PII flows and how it's protected

Ask: "Does the data flow match your understanding? Any data paths missing?"

### Section 5: Scalability model

Present a table showing current → 10x → 100x for key dimensions (users, requests/sec, storage). Identify the bottleneck at each scale level and how to address it.

Ask: "Are the scale targets right? Any dimensions I'm missing?"

### Section 6: Security architecture

Present:
- Identity and access model (user auth, service-to-service, admin)
- Data classification table (regulated/internal/public with encryption and access controls)
- Secret handling (storage, rotation, audit)

If the PRD mentions regulated data (PHI/PII/SOC 2/PCI-DSS), add a **Compliance Owner sign-off** section:
- If `tasks/compliance-owners.md` was loaded in Step 2c, use the named owners (e.g., "Privacy Officer: Jane Doe", "Security Lead: John Smith")
- If not loaded, use placeholder text and warn: "Fill in named owners from `tasks/compliance-owners.md`"
- The architecture document cannot move from Draft to Accepted status until all required sign-offs are obtained

Ask: "Any security requirements I'm missing? Any compliance constraints not in the PRD?"

### Section 7: Observability plan

Present:
- Key metrics with alert thresholds
- Logging strategy (structured, retention, sensitive data policy)
- Tracing strategy (propagation, sampling rate)

Ask: "Any metrics or alerts you'd add? Any existing dashboards to integrate with?"

### Section 8: Disaster recovery

Present:
- RTO and RPO targets
- Failure scenarios with detection and recovery procedures
- Which scenarios have been tested

Ask: "Are the RTO/RPO targets right for your business? Any failure scenarios I'm missing?"

---

## Step 4 — Write ARCHITECTURE.md

After all 8 sections are confirmed, write the full document using the template from `skills/architect/templates/architecture.md`.

**Output location:**
- Enterprise pack: `docs/ARCHITECTURE.md`
- Solo pack: `ARCHITECTURE.md` in repo root

If the file already exists, present a diff summary of what changed and ask: "Want me to update the existing file or write a new version alongside it?"

Fill in all template sections with the confirmed decisions. Replace placeholder text — no `_italicized placeholders_` should remain in the output.

---

## Step 5 — Propose ADRs for key decisions

Review the architecture decisions made. For any that meet all 3 ADR criteria:
1. **Hard to reverse** — locks in a dependency, schema, or API contract
2. **Surprising** — a reasonable engineer might have chosen differently
3. **Trade-off-driven** — defensible alternatives were rejected

Propose ADRs:

> "These architecture decisions qualify for ADRs:
>
> 1. [Decision] — [why it's ADR-worthy]
> 2. ...
>
> Want me to create them in `docs/adr/`?"

If the user approves, write ADR files using the template at `templates/docs/adr/0000-template.md`.

---

## Step 6 — Log in task files and flags-and-notes

1. **`todo.md`** — mark done:
   ```
   - ✅ [DEFINE] /architect — <project/feature> — 8 sections complete — output: <path>/ARCHITECTURE.md
   ```

2. **`flags-and-notes.md`** — append to "Important Notes" or "Decisions":
   ```
   - [ARCHITECT] ARCHITECTURE.md created — <date> — output: <path> — Status: Draft
   ```

3. If any section surfaced a blocker (missing compliance info, unresolved platform choice, etc.), append to "Active Blockers":
   ```
   - [ARCHITECT] <blocker description> — <what's needed to unblock>
   ```

Use the Edit tool — targeted appends, not rewrites.

---

## Rules

- Work through sections interactively, one at a time. Never dump all 8 at once.
- Every section must get user confirmation before moving on.
- Use Mermaid for all diagrams — no external tools.
- Cloud-agnostic by default. Only add platform-specific services when the user chooses a platform.
- Compliance Owner sign-off is mandatory when regulated data is in scope — not optional. Use named owners from `compliance-owners.md`. If the file doesn't exist, use placeholders and warn. The document cannot be marked Accepted without sign-off.
- Cost estimates must include steady-state, burst, and unit economics. Vague cost notes ("it depends") are not acceptable.
- Anchor module names and terminology in CONTEXT.md if present.
- If a Decision Brief exists, cross-reference dealbreaker assumptions in relevant sections.
- If research.md exists, use verified/cited claims from it for technology decisions.
- No emoji. Keep the format tight.
- Do not skip sections. If a section is genuinely not applicable (e.g., disaster recovery for a CLI tool), state why it's N/A and move on — but confirm with the user first.
