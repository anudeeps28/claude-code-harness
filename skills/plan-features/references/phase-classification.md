# Phase Classification Heuristics

Phases group stories **by kind of work**, not by feature area and not by time.
A phase tag answers "what discipline does this require?" — it drives staffing
and sequencing logic (e.g. you can't build UI against an API that doesn't
exist yet). Phases are orthogonal to backlog order — a stretch of the
top-ranked backlog will usually contain stories from more than one phase once
you're past the first few Features.

## Default skeleton

```
Architecture → Backend → UI → QA
```

Use this unmodified for a typical CRUD/web-app project: stand up the foundation
(infra, auth, schema), build the API/business logic, build the screens on top of
it, then verify. Most single web-application projects fit this skeleton without
changes.

## When to deviate

Don't force the work into 4 phases if it doesn't actually sort that way. Read
these signals off the repository's `docs/` and the `features/` specs — the same
signals a PRD used to carry are now spread across those files.
Signals that warrant a different skeleton:

| Signal in docs/ or features/ | Adaptation |
|---|---|
| Heavy ETL / data pipeline / warehouse work, with application backend as a thin layer on top of it | Insert a **Data Platform** phase between Architecture and Backend, covering schema design, ingestion, transformation, and data-quality plumbing. This is genuinely different work (data modeling, SQL, pipeline orchestration) from application backend (API endpoints, business logic). |
| No end-user UI at all (a service, a batch job, a CLI tool, an internal API consumed only by other services) | Drop the **UI** phase entirely. Don't invent screens that aren't in the PRD. |
| Multiple distinct front-ends (e.g. an internal ops console + a separate end-user portal) | Keep a single **UI** phase but tag stories with a `Component` tag per front-end (see story-writing-template.md) rather than splitting UI into multiple phases — they're still the same kind of work. |
| Heavy third-party/system integration (multiple external APIs, file feeds, partner connections) | Insert an **Integration** phase if integration work is large enough to be its own stream and has its own risk profile (auth flows, rate limits, data mapping) distinct from the core backend. If it's just 1-2 endpoints, fold it into Backend instead. |
| Infrastructure-as-code / DevOps is a first-class deliverable (the PRD explicitly scopes CI/CD pipelines, environment provisioning, IaC) | Keep this in **Architecture** rather than a separate phase unless the PRD treats it as a major independent workstream with its own milestones. |
| Compliance/security requirements with dedicated controls (PHI/PII masking, audit logging, RLS, BAAs) | Don't create a separate "Security" phase for ordinary requirements — fold security stories into whichever phase implements the control (a masking rule is Data Platform work; an RLS check in an API is Backend work). Only break out a dedicated **Compliance** phase if the PRD has a large, distinct compliance workstream (e.g. a multi-step certification process with its own deliverables). |
| Migration of existing data/systems is in scope | Insert a **Migration** phase — migration work has its own sequencing constraints (cutover windows, rollback plans) that don't fit cleanly into Architecture or Data Platform. |
| QA is described as a continuous embedded practice rather than a final pass (e.g. the PRD has an explicit verification/acceptance section) | Keep **QA** as the last phase for cross-cutting verification (end-to-end reconciliation, performance, security testing), but also let individual stories in other phases carry their own acceptance criteria — don't push all testing into QA-phase stories. QA-phase stories are for verification that spans multiple components, not unit-level correctness of a single story. |

## Decision checklist

When classifying the project (from what you read in `docs/` and `features/`),
walk through:

1. **Is there schema/data-model work distinct from application logic?**
   If yes and it's substantial → add a Data Platform phase.
2. **Is there a real, user-facing UI in scope?**
   If no → drop UI. If multiple front-ends → keep one UI phase, split by Component tag.
3. **Is there major third-party integration work?**
   If yes and it's large → add an Integration phase. If small → fold into Backend.
4. **Is migration of existing data/systems in scope?**
   If yes → add a Migration phase.
5. **Always keep Architecture first and QA last** — every other phase is
   inserted between them based on the signals above.
6. **State your phase list and one-line rationale per phase to the user before
   drafting stories** — phase classification is the kind of decision the user
   should be able to correct cheaply, before 50+ stories are built on top of it.

## Worked example — a data-platform project

A project (documented in `docs/`, with features in `features/`) describing a
scheduler that ingests data, loads a medallion-architecture warehouse, and
exposes a separate analytics portal would NOT use the default 4-phase skeleton
verbatim. Applying the checklist:

- Schema/data-model work is substantial (medallion architecture, star schema,
  SCD2, watermarking) → **Data Platform** phase added.
- A real UI is in scope, but there are two distinct portals (an ops console
  and an analytics portal) → keep one **UI** phase, tag stories
  `Component:DataOps Portal` / `Component:Analytics Portal`.
- No major third-party integration beyond internal source systems via a
  connection registry → fold into Data Platform, no separate Integration phase.
- No migration in scope → no Migration phase.

Resulting skeleton: **Architecture → Data Platform → Backend → UI → QA**,
where "Backend" covers orchestration logic and portal APIs (including the
metrics layer and row-level security), separate from the raw ETL/warehouse
work in Data Platform.

## A stated "build sequence" is not your phase list

The docs or the feature set may describe a phased rollout by *feature area*
(e.g. "Phase 0: foundation, Phase 1: Claims, Phase 2: Enrollment...") — or the
ordering of the `features/` files may itself imply one. That is a
**priority/sequencing signal**, not a kind-of-work phase. Use it to inform
backlog ordering within each kind-of-work phase (build foundation stories before
Claims stories, build Claims stories before Enrollment stories), but keep your
Phase tags as kind-of-work (Architecture/Data Platform/Backend/UI/QA).
Conflating the two collapses two independent axes of planning into one and makes
the backlog harder to staff and resequence later.

## Features vs. Phases

This skill works with **two** groupings. Don't confuse them:

- **Phase** = kind of work (this file's whole subject). Answers "what
  discipline?" — Architecture / Data Platform / Backend / UI / QA, etc.
- **Feature** = a cohesive, stakeholder-nameable capability. Answers "what can
  I point to and say 'this shipped'?" A Feature almost always spans *multiple*
  Phases — "Claims Analytics Dashboard" needs Data Platform work (the Gold
  facts), Backend work (the metrics/RLS engine), and UI work (the actual
  dashboard) before it's real.

**Features are not skill-generated in this version.** They are the input: each
file in the repository's `features/` folder (e.g. `FR-1.md`, `FR-2.md`) *is* a
Feature, and its ID is the file's own identifier (`FR-1`). You do not draw
Feature boundaries — the feature files already did. Your job (SKILL.md Phase 3)
is to generate the independently-testable User Stories *within* each given
feature, and to classify each of those stories by Phase (kind of work) for
sequencing.

Because Features are fixed by the input, the only grouping you decide is the
Phase (kind-of-work) tag on each story. A single feature file's stories will
typically span several Phases; that is expected and correct — do not try to
force one feature into one phase.
