# Story-Writing Template & Voice

## The overriding rule: every story must be independently testable

Before any granularity heuristic below, this rule wins:

> **Each User Story must represent an independently testable piece of
> functionality.** It is *not allowed* to create stories so small or so modular
> that they cannot be verified on their own. A tester or reviewer must be able
> to exercise the story end-to-end and observe a result.

Concretely, a story is **too small** if:
- its only "acceptance criteria" describe internal structure with no observable
  behavior (e.g. "add a nullable column" with nothing that writes or reads it,
  "create an empty service class", "add a config key" nothing consumes yet);
- it cannot be demonstrated without also completing a sibling story in the same
  breath (if two fragments can only ever be tested together, they are one
  story);
- its verification would be "code compiles" or "the method exists" rather than
  "given X, when Y, then an observable Z".

When you catch yourself drafting such a fragment, **fold it into the story that
gives it observable behavior** instead of shipping it as its own story. The
independently-testable threshold is the floor; the granularity bias below
operates only *above* that floor.

## Granularity bias (above the independently-testable floor)

Given two valid, independently-testable options, prefer **more, narrowly-scoped
stories** over fewer large ones. A story should be completable by one developer
in a few days at most. If you find yourself writing "and" in a story title, or
an AC list creeping past 5 items, consider splitting — *provided each half is
still independently testable.*

Rules of thumb:
- One feature usually yields **several** stories, not one — but each must clear
  the independently-testable bar.
- A story that touches more than ~2 components (e.g. DB schema + API + UI all in
  one story) is a candidate to split along those component lines — but only if
  each resulting piece has observable behavior on its own. A schema change whose
  only consumer is the very API in the same story is usually **not** worth
  splitting out; the schema + the endpoint that exercises it is the smallest
  testable unit.
- CRUD-style scope ("manage X") splits naturally into Create, Read/List, Update,
  Delete/Disable stories when each has independent, testable value — but don't
  manufacture a Delete story if the feature never mentions deleting.
- A backend capability and the UI that exposes it are often two stories — but
  only when the backend capability can be tested on its own (via API/response/
  query), not when it's an internal helper with no independently observable
  surface.

## Title format

```
<Verb> <object> <qualifier if needed>
```

Examples: `Apply Dynamic Data Masking to DimMember PHI columns`,
`Build run-history list view with status filter`,
`Register a source connection by name in the Shared Connection Manager`.

Avoid vague verbs ("Handle", "Support", "Improve") when a concrete verb is
available ("Validate", "Reject", "Mask", "Retry", "Render").

## Story body — voice

Use the standard user-story sentence **only when there's a real human role
behind it**:

```
As a <role>, I want <capability>, so that <benefit>.
```

For infrastructure/platform stories with no end-user-facing role, write a plain
capability statement instead — don't force a fake persona onto a database
migration:

```
<Capability statement.> This exists so that <downstream benefit/consumer>.
```

Example: "Provision the dedicated Azure SQL DataOps database, separate from the
warehouse. This exists so that orchestration state (job runs, schedules,
watermarks) never competes with or pollutes warehouse data."

## QAble / Not QAble classification and Acceptance Criteria (per User Story) — authored by plan-features

> **Ownership note.** `plan-features` authors the **QAble** classification,
> the **Acceptance Criteria**, the **Verification Method** tags, and the
> Postman/DB-query artifacts that go with them, during its own Phase 3 —
> directly into each User Story's own block, not a separate Feature-level
> section. This runs *before* any code exists, so it is grounded in the
> feature's stated scope and documentation (`DOCS_CONTEXT`), not the real
> implementation — `work-feature`'s Phase 4.2 re-validates every criterion
> against the real code it builds and corrects anything that no longer holds
> (wording, Verification Method tag, a scenario the implementation reveals
> was missed or doesn't actually apply), writing any correction back into
> the same story block. `work-feature`'s Phase 7 QA Verification Gate (the
> `ac-qa-verifier` agent) then actually exercises the surviving criteria
> against a dev environment before the PR is raised.
>
> **Acceptance Criteria live on the User Story, not the Feature.** Every
> field described below — `QAble`, the Acceptance Criteria list, each
> criterion's Verification Method tag, and (once generated) the `Postman`
> reference — is written directly into that story's own bullet block (see
> "Canonical story-block format" below for the exact shape). Feature work
> items never carry Acceptance Criteria content.

Every story carries a **QAble** field (`QAble` or `Not QAble`),
answering one question: **can QA observe and verify this change?**

- **QAble** — the change has a visible entry/exit point QA can exercise: a
  frontend UI, an API endpoint they can call, a file or report the system
  produces, an email/notification, a queryable data result exposed to them.
- **Not QAble** — there is no surface QA can observe or validate: a pure
  refactor with identical behavior, internal plumbing, infrastructure
  groundwork, a config/pipeline change with no user-visible effect.

Note this is a **QA-observability** classification, not the
independently-testable *granularity* rule at the top of this file. Every story
must still be independently verifiable by *someone* (a developer via query,
log, or system state); `Not QAble` only means **QA** has nothing to check —
it tells QA to skip the story and tells planning not to expect a QA pass on it.
A `Not QAble` story contributes **no Acceptance Criteria block at all**; its
developer-verification steps live in its Technical Requirements.

The value is written in the story block (`- **QAble:** …`) and carried as an
ADO tag (`QAble` / `Not QAble`).

## Acceptance criteria (QAble stories only, written into the story's own block)

**Only `QAble` stories carry an Acceptance Criteria block. A `Not QAble`
story gets NONE** — how the *developer* verifies a Not QAble change (query,
log entry, system state) belongs in that story's Technical Requirements
section, never in an AC block. Every criterion a `QAble` story has is written
into a `**Acceptance Criteria**` block inside that **same story's own bullet
block** (see "Canonical story-block format" below) — directly after the story
body, before `**Technical Requirements**`. Acceptance Criteria never live in
a separate Feature-level section.

AC are not solely a QA artifact. They are the one place Development, QA, and
the business all agree on what "done" means for this story: the developer
verifies every criterion locally before the story is considered ready to move
forward (`work-feature` SKILL.md, step 4.2/4.4/4.7), a final cross-story pass
checks the whole feature's stories together for duplicates and coverage gaps
(step 4.8) and then the surviving criteria are actually exercised against a
dev environment (step 7 — the QA Verification Gate, run by the dedicated
`ac-qa-verifier` agent) before the developer is even asked whether to raise a
PR, QA executes the surviving criteria to test, and together they are the
record of what the original request actually asked for. Writing them well
matters for all three audiences, not just for QA.

**No fixed count, in either direction.** There is no minimum or maximum
number of Acceptance Criteria for a story — cover every scenario that
genuinely needs to be tested, however many that takes. That said, more AC is
not automatically better:
- **Never manufacture a criterion just to hit a number**, and never split one
  real scenario into several near-duplicate lines to look thorough. Every
  criterion must earn its place by covering a distinct, real test case.
- **Cover the full range of scenarios, not just the happy path.** Prioritize
  the happy path first — the core scenario the story exists to deliver —
  then add every business-rule edge case, unusual/weird situation, relevant
  feature-flag or configuration state, and wrong-path/rejection/error case
  that the feature's stated requirements actually call for. Don't invent
  scenarios the feature never mentions, but don't stop at the happy path
  either — a feature whose only tested behavior is the success case is not
  actually covered.
- **Every criterion must be genuinely testable — no exceptions.** If you
  cannot picture a QA analyst (or `work-feature`'s own Phase 7 QA
  Verification Gate) actually executing a criterion and getting a clean
  pass/fail, it is not ready to ship as-is; rewrite it until it is, or don't
  write it at all. A criterion nobody can test is worse than no criterion.
- If a story's *real* scenario count turns out to be very large, that can be a
  signal the story is scoped too broadly (see the independently-testable rule
  at the top of this file) — but splitting is a judgment call, never a
  mechanical "over N, split" rule.

Use Given/When/Then, one criterion per line, tagged with a backticked
Verification Method and a bold, sequential `AC<N>` id (see "Verification
Method" below for the tag, and "Stable AC ids" for the id):

```
- `[TAG]` **AC<N>:** Given <precondition>, when <action>, then <observable outcome>.
```

### Business-testable framing (mandatory)

Every AC must be something a QA analyst with **no codebase access** can
execute and judge pass/fail on — a check against a *business rule*, not
against the mechanics of how the system implements it. This is the most
common way AC generation goes wrong, so check every criterion against it
before finalizing:

- **Bad (generic/technical) — reject these:**
  - "`[API]` **AC4:** Given a request to the endpoint, when it is called with
    valid parameters, then it returns a 200 status." *(protocol mechanics,
    not a business outcome — "valid parameters" and "200 status" tell QA
    nothing about what business result to check.)*
  - "`[API]` **AC5:** Given the service processes the record, when the job
    runs, then the record is updated." *(no concrete input, no concrete
    expected value — "updated" to what?)*
- **Good (business-testable) — match this shape:**
  - "`[API]` **AC4:** Given a member with an active enrollment effective
    2026-01-01, when the enrollment-eligibility check is run for that
    member, then the member is reported as eligible and the reported
    effective date is 2026-01-01."
  - "`[API]` **AC5:** Given a claim submitted for a service date outside the
    member's coverage window, when the claim is adjudicated, then the claim
    is denied with reason code `OUT_OF_COVERAGE`."

Concretely, every criterion must:
- name a **concrete input** — an actual value or scenario ("a member with an
  active enrollment effective 2026-01-01"), never a placeholder like "valid
  data" or "the correct input";
- name a **concrete, checkable expected outcome** — a specific field value,
  status, count, message, or state change, never "works correctly", "handles
  the case", or "responds appropriately";
- reference the **business rule** being proven, in business terms, whenever
  the feature's `## Requirement` or `## Acceptance Criteria` section names one
  (e.g. "a member cannot have two active enrollments in the same plan year").

If you cannot rewrite a criterion to name both a concrete input and a concrete
outcome, it is not ready to ship as-is — go back to the feature's Requirement
section and find the business rule it should be testing.

### Verification Method (mandatory per criterion, not per story)

Every Acceptance Criterion carries its own **Verification Method** tag,
which decides *how* QA executes that specific criterion. It is a **per-
criterion** tag, not a per-story field — one `QAble` story can legitimately
contribute criteria of more than one kind (e.g. a UI screen backed by an API
it also exposes gets both `[UI]` and `[API]` criteria):

- **`[API]`** — this criterion is reachable through an exposed API endpoint
  (existing or newly added by the contributing story). QA verifies it by
  calling that endpoint.
- **`[DB Query]`** — this criterion has **no exposed endpoint**; the only
  observable surface is the database state changing (a table/view/report
  result QA can query directly).
- **`[UI]`** (Portal) — this criterion's only observable surface is a UI
  screen; there is no separate API worth testing in isolation from the
  screen itself (the criterion's Given/When/Then already describes the
  on-screen steps).

Determine this from the contributing story's Technical Requirements / the
feature's `## Data Model / Touchpoints` section — verify with Grep whether
the story adds or touches a controller/route/endpoint before deciding; never
guess.

### Stable AC ids

Every criterion also carries a bold `**AC<N>:**` id, right after its
Verification Method tag — e.g. `` `[UI]` **AC3:** Given … ``. This is what
lets `work-feature`'s Phase 7 QA Verification Gate (the `ac-qa-verifier`
agent, backed by `tools/ac-verify`) map a Playwright test, a Postman request,
or a piece of evidence back to the exact criterion it verifies, and what lets
a fix-and-re-verify loop target one failing criterion without re-running
everything.

- **Numbered per story, not feature-wide** — sequential within that story's
  own Acceptance Criteria block, starting at `AC1`. Since each story's
  criteria live entirely inside that story's own block (never merged with a
  sibling story's), there is no cross-story numbering to keep in sync.
- **Assigned by `plan-features` as it drafts each story** (Phase 3) — in
  order, starting at `AC1` for that story.
- **Corrected in place, never renumbered wholesale**, when `work-feature`
  refines a story's criteria against the real implementation (Phase 4.2) or
  a cross-story pass touches it (Phase 4.8): if a criterion is removed,
  leave a gap rather than renumbering the rest — a stable id matters more
  than a gap-free sequence, since Postman requests and Playwright specs
  already reference the old numbers by the time any correction happens. Only
  a criterion added in that same pass gets a fresh, next-unused number for
  that story.

#### `[API]` criteria → generate a Postman collection

For every `[API]`-tagged criterion, the Acceptance Criterion text stands as
written (business-testable, per above), and in addition a Postman request is
generated so QA can exercise the endpoint directly:

- **One collection per Feature**, not per story: `postman/<FEATURE_ID>.postman_collection.json`
  at the repo root, created by `work-feature` (Phase 4d) when it builds the
  story — `plan-features` writes the criteria, never the collection, because
  the request shape follows the real endpoint. Every `[API]`-tagged criterion belonging to
  that Feature shares the one file, organized into per-story folders inside
  it — `work-feature` regenerates/extends the Feature's collection whenever
  a story's request shapes change during implementation (Phase 4.2/4.3).
- Inside the collection, one **folder per story** named `<STORY_ID> — <story
  title>` (the same story this criterion belongs to), containing one
  **request per `[API]`-tagged criterion** that story carries — each request
  maps to a distinct call (method + endpoint + input combination), labeled
  with a short form of that criterion's precondition/action.
- **Skeleton depth only at authoring time** — method, URL (using a
  `{{baseUrl}}` collection variable, declared once at the collection's top
  level), headers, and a sample request body/params populated from the
  criterion's concrete input. **Do not add a `pm.test()` script yet** — an
  assertion authored before the endpoint exists (or before the request has
  actually been run) would just be asserting a guess. `work-feature`'s Phase
  4.3 adds the assertion once the real endpoint exists and the request has
  actually been run against it.
- **`description` is stamped with the criterion's AC id** — `"Verifies
  AC<N>"` — the moment the request is created. This is what lets
  `tools/ac-verify` (and the `ac-qa-verifier` agent that drives it) match a
  Postman result back to the exact criterion it proves. Since AC ids are
  corrected in place rather than renumbered wholesale (see "Stable AC ids"),
  this stays in sync without special handling.
- The **developer** (via `work-feature`) runs this request against their
  local/dev environment as part of verifying the criterion before its story
  moves forward (`work-feature` SKILL.md, step 4.2/4.3/4.7), and **once the
  real response is confirmed**, adds the `pm.test()` script that checks it
  against the criterion's expected outcome. If a request genuinely can't be
  exercised locally at that point (e.g. it depends on data only present in a
  QA/dev environment), leave it unasserted and say so explicitly —
  `work-feature`'s Phase 7 QA Verification Gate gets a second, dedicated
  pass at exactly this gap once a real dev environment and test data are
  available, and QA should ultimately receive a request that already runs
  and already asserts the confirmed result, not a bare skeleton they have to
  build checks for themselves.
- Reference the collection from the story's own bullet block with a
  `- **Postman:** postman/<FEATURE_ID>.postman_collection.json → folder
  "<STORY_ID> — <story title>"` line, once that story has at least one
  `[API]`-tagged criterion.

Minimal shape of the collection file:

```json
{
  "info": {
    "name": "<FEATURE_ID>: <FEATURE_TITLE>",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "variable": [
    { "key": "baseUrl", "value": "https://<host>/api", "type": "string" }
  ],
  "item": [
    {
      "name": "<STORY_ID> — <story title>",
      "item": [
        {
          "name": "<criterion label>",
          "request": {
            "method": "POST",
            "header": [{ "key": "Content-Type", "value": "application/json" }],
            "url": "{{baseUrl}}/<endpoint-path>",
            "description": "Verifies AC<N>",
            "body": {
              "mode": "raw",
              "raw": "{\n  \"<field>\": \"<concrete value from the criterion>\"\n}"
            }
          }
        }
      ]
    }
  ]
}
```

#### `[DB Query]` criteria → DB steps embedded in the criterion, real SQL in Technical Requirements

For every `[DB Query]`-tagged criterion, do **not** generate a Postman
collection. Instead:

- The criterion's `when`/`then` names the query and expected result **in
  business language**, keeping the existing no-SQL-in-AC rule intact — e.g.
  "Given a member's plan was updated on 2026-01-01, when querying the
  member's current plan record, then it reflects the new plan with an
  effective date of 2026-01-01" rather than embedding a `SELECT` statement.
- The story's own **Technical Requirements** section gets a
  `**DB verification query:**` entry per `[DB Query]`-tagged criterion it
  carries, cross-referenced by AC id to which criterion it satisfies (e.g.
  "DB verification query (AC2): ..."). At authoring time (`plan-features`
  Phase 3), the schema may not exist yet — write the query as far as it can
  be determined from `## Data Model / Touchpoints`, or mark it an explicit
  open point; `work-feature`'s Phase 4.3 fills in or corrects the literal,
  runnable SQL once the schema actually exists (e.g. "DB verification query
  (AC2): `SELECT PlanCode, EffectiveDate FROM Member.Enrollment WHERE
  MemberId = <id> ORDER BY EffectiveDate DESC;` — expect one row, `PlanCode`
  = the new plan, `EffectiveDate` = 2026-01-01"). `[DB Query]` criteria stay
  developer-verified — they are the one Verification Method the Phase 7 QA
  Verification Gate does not automate.

#### `[UI]` criteria → no separate artifact needed

For `[UI]`-tagged (Portal) criteria, the Given/When/Then text already
describes the on-screen steps QA follows — no Postman collection and no DB
query block are generated. `work-feature`'s Phase 7 QA Verification Gate
drives these with Playwright against a real dev environment before the
feature's PR is even raised (falling back to a direct API call, when one
exists, if the UI path itself can't be exercised in this environment).

### General AC rule (all verification methods)

The AC must otherwise still be written strictly from a QA/business
perspective — expected behavior and observable outcomes only. No
implementation detail whatsoever beyond what's explicitly carved out above:
no class or method names, no file paths, no framework talk (`[DB Query]`
criteria are the one deliberate exception, and only for the literal SQL,
which lives in Technical Requirements, never in the AC line itself). How the
code achieves the outcome belongs in the Technical Requirements section,
never in the AC.

## Technical Requirements — mandatory, complete, strictly technical

Every story block ends with a `**Technical Requirements**` section. Its job is
to hand the developer (or the work-feature skill) everything needed to start
working **immediately, without first digging through the codebase**. It is the
mirror image of the AC: the AC say *what* must observably happen with zero
implementation detail; the Technical Requirements say *how/where* in the code
with zero business language.

Ground it in the repository documentation (`DOCS_CONTEXT`), the feature's
`## Data Model / Touchpoints` section, and — when the repo contains the actual
code — verify names with Glob/Grep before writing them down (a file path,
class, or column name you can check must never be guessed). Include, where
applicable:

- **Files/modules** to be modified or created (real paths);
- **Database tables/columns** to be touched (real names, including new columns
  to add);
- **Technologies/frameworks/libraries** involved;
- **Change type**: new feature, bug fix, refactor, migration, config;
- **Affected classes/methods** and, where pinpointable, specific code
  locations;
- anything else that removes up-front discovery work (patterns to follow, an
  existing similar implementation to mirror, a stored proc to extend, etc.).

Vagueness is a defect: "update the relevant services" or "adjust the data
layer" is not acceptable — name them. If something genuinely can't be
determined from docs + repo, write it as an explicit open point (e.g.
"Open: confirm whether X lives in ServiceA or ServiceB") rather than omitting
it. On a board whose story type has a dedicated **Technical Requirements**
field (e.g. `Custom.TechnicalRequirements` in the KBA Global process
template), it goes there as well as into the story body — and in Scrum Master
mode `plan-<feature>.md` says to paste it there.

## Story IDs and tags

Stories generated by this skill live **inside the feature file**, not in Azure
DevOps. IDs and tags are therefore markdown fields, written as part of each
story block (see the format below).

| Field | Value | Purpose |
|---|---|---|
| **Story ID** | `<FEATURE_ID>-US-<n>`, e.g. `FR-W3-US-1`, `NFR-1-US-2` (`sec8-US-1` for `§`-style IDs). Local to the feature, globally traceable because it is prefixed with the feature ID. | Referenced by dependencies and by the `work-feature` skill when it loops over the stories. |
| **Feature** | The originating feature's ID, taken from the feature file (e.g. `FR-1`). **Mandatory — every story carries exactly one.** | The traceability tie-back. This is how `work-feature` (and anyone browsing) knows which feature a story came from. Never omit it, and never let one story claim two features. |
| **Phase** | The kind-of-work phase from `phase-classification.md` (e.g. `Backend`). | Staffing and sequencing. |
| **Component** | The subsystem name when the docs/feature distinguish distinct components (e.g. `Analytics Portal`). Omit if the system is a single undifferentiated one. | Lets the backlog be filtered by subsystem. |
| **QAble** | `QAble` or `Not QAble` (see the classification section above). **Written by `plan-features`** during Phase 3, grounded in the feature's stated scope; `work-feature` may correct it in Phase 4.2 once the real implementation is known, flagging the change. | Tells QA whether there is anything for them to verify; carried as an ADO tag. |
| **Verification Method** | `[API]` / `[DB Query]` / `[UI]`. Not a story-level field — it's a tag on each individual criterion inside that story's own Acceptance Criteria block, written by `plan-features` (Phase 3) and refined by `work-feature` (Phase 4.2) against the real implementation. See the "Verification Method" subsection above. | Decides whether a Postman collection or an embedded DB-query step is generated for that criterion. |
| **Points** | `1`, `2` or `3`; `5` only in rare cases, with a `Why 5:` line; never `8` or more — split instead (SKILL.md Phase 3, "Points"). | Keeps a Feature (at most 8 stories) inside one sprint, as the delivery process asks. |
| **Depends on** | Other story IDs (same-feature or cross-feature) this story is *blocked* by, or `None`. | Sequencing; becomes a predecessor link in ADO. |
| **Relates to** | Other story IDs whose context/history this story builds on without being blocked by them. Omit the line if none. | Lets the developer follow the full history of the work; becomes a related link in ADO. |

When the input was a feature file, the work items (created by this skill, or
by the Scrum Master from `plan-<feature>.md`) also carry tags `<STORY_ID>;
Feature:<FEATURE_ID>; <QAble | Not QAble>; <CC-#### | no-CC/SD>; <REPO_NAME>`
(stories) and `Feature:<FEATURE_ID>; <CC-#### | no-CC/SD>; <REPO_NAME>`
(features) — these are what the Scrum Master id look-up and work-feature's
fallback lookup query. Work items are always created **unassigned**.

## ADO write-back fields

Once the items exist — created by this skill (SKILL.md 6e), or by the Scrum
Master from `plan-<feature>.md` and then found read-only (SKILL.md 6S) — their ids are
written back into the feature file. These are what `work-feature` uses to
resolve work items without querying:

- Frontmatter gains `ado-feature: <Feature work-item id>`.
- Each story block gains `- **ADO:** #<User Story work-item id>` directly after
  its `- **Points:**` line (see the canonical block below).

If the plan hasn't been executed on the board yet (or an item couldn't be
resolved), these fields are simply absent — work-feature then falls back to
tag lookup, and errors out (telling the user to re-run plan-features once the
items exist) if nothing is found. It never creates work items itself.

## Dependencies

A dependency means "cannot be *started* productively until the predecessor is
*done*" — not "is thematically related to." Don't record a dependency just
because two stories touch the same table; only record it when the predecessor's
output is a real input the successor needs (a schema the successor's code
references, an API the successor's UI calls, a registered connection the
successor's ETL module resolves by name).

Keep the dependency list short and load-bearing. A story with 5+ listed
dependencies is a signal that it's scoped too broadly or that the dependency
list is being used as a relatedness tag instead of a true blocking relationship.

**Relatedness has its own field.** When a story builds on, extends, or needs
the context of a previous story *without being blocked by it* (e.g. it extends
a screen an earlier story introduced, or continues work on the same subsystem
where the earlier story's discussion holds the background), record that story's
ID under `- **Relates to:**` so the developer can follow the full history of
the work. Never put the same ID in both `Depends on` and `Relates to` —
blocking wins. In ADO, `Depends on` entries become predecessor links and
`Relates to` entries become related links — written by this skill (SKILL.md 6c),
or listed per story in `plan-<feature>.md` for the Scrum Master to add (SKILL.md 6S).

## The feature files this skill reads (Atlas convention)

The `features/*.md` files follow the Atlas-repo convention: YAML frontmatter
(`id`, `title`, `component`, `repo`, `phase`, `status`), then `## Requirement`,
`## Acceptance Criteria` (grouped under `**From ST-xxx — title:**` sub-blocks),
`## Related Stories` (entries like `- ST-026 — <title> (3 pts)`, sometimes with
an `_(also: FR-A6)_` cross-reference), `## Dependencies` (feature-level, may
point at features in other repos), `## Data Model / Touchpoints`,
`## Notes / Open Questions`, and a trailing `---` + `_Source of truth…_` footer.
Feature IDs look like `FR-W3`, `FR-A1`, `NFR-1`, `§8` (filename `sec8-…`) — when
an ID contains characters unsafe for story IDs (e.g. `§8`), use the
filename-derived form (`sec8`) in story IDs and note the mapping.

## Canonical story-block format (written into the feature file)

This is the exact structure `plan-features` inserts into each feature file
under a `## User Stories` heading — placed **before the trailing footer
line** — and the exact structure `work-feature` parses, then **adds to** as
it works each story. Keep it stable; both skills depend on it.

**Acceptance Criteria are written directly into each story's own block, not
a separate Feature-level section.** `plan-features` authors a `**Acceptance
Criteria**` list inside each `QAble` story's block (right after the story
body, before `**Technical Requirements**`) as it drafts that story in Phase
3. `work-feature` then refines that same block in place (Phase 4.2) as it
builds the real implementation, and a final cross-story pass (Phase 4.8)
checks all of a feature's stories together for duplicates and coverage gaps,
correcting individual stories' blocks as needed — nothing is ever merged
into one shared list.

The blocks below show the **final** shape, after both skills have run.
`Postman` is **not** present on a story block when `plan-features` first
writes the file — `work-feature` adds it once the collection actually exists
for that story (Phase 4.3); everything else shown (`QAble`, the Acceptance
Criteria block itself, its Verification Method tags) is written by
`plan-features` up front, then refined in place rather than added later.

```markdown
## Requirement

<the feature's own Requirement section, written by the feature's author>

## User Stories

> Generated by plan-features on YYYY-MM-DD. Each story below is independently
> testable and tagged with its originating feature. Acceptance Criteria are
> authored per story (Phase 3), refined against the real implementation by
> work-feature (Phase 4.2), and actually exercised against a dev environment
> by work-feature's Phase 7 QA Verification Gate before the PR is raised.

### FR-W3-US-1 — Apply Dynamic Data Masking to Gold PHI columns

- **Feature:** FR-W3
- **Phase:** Data Platform
- **Component:** Warehouse
- **QAble:** Not QAble
- **Points:** 3
- **ADO:** #45231
- **Depends on:** FR-W2-US-1 (Gold star schema DDL deployed)
- **Relates to:** FR-W1-US-3 (Gold schema security baseline)

Apply SQL Server Dynamic Data Masking to DimMember (ZipCode, DOB, SSNLast4) and
DimGLP1Patient (ZipCode) in the Gold schema. This exists so that PHI is
protected at the database layer independent of any application-level redaction.

**Technical Requirements**
- **Change type:** New feature (database security layer).
- **Files:** `db/gold/ddl/dim-member.sql`, `db/gold/ddl/dim-glp1-patient.sql`
  (add `MASKED WITH` clauses); new grant script
  `db/gold/security/unmask-grants.sql`.
- **Database:** `Gold.DimMember` columns `ZipCode`, `DOB`, `SSNLast4`;
  `Gold.DimGLP1Patient` column `ZipCode`. Masking functions: `partial()` for
  ZipCode/SSNLast4, `default()` for DOB.
- **Technology:** SQL Server Dynamic Data Masking (native, no library).
- **Verification (dev):** query both tables as a login without UNMASK — the
  listed columns return masked values; as a DBA login with UNMASK — real
  values; rebuild the warehouse from the DDL scripts — masking re-applies
  with no manual post-deploy step.
- **Notes:** Follow the existing DDL-idempotency pattern in
  `db/gold/ddl/README.md`; grants must exclude the `etl_service` login
  (it requires UNMASK — see FR-W1-US-3).

### FR-W3-US-2 — Reject enrollment API calls outside the plan year window

- **Feature:** FR-W3
- **Phase:** Backend
- **Component:** Warehouse
- **QAble:** QAble
- **Points:** 2
- **Postman:** postman/FR-W3.postman_collection.json → folder "FR-W3-US-2 — Reject enrollment API calls outside the plan year window"
- **Depends on:** None

<story body>

**Acceptance Criteria**
- `[API]` **AC1:** Given a member with no active enrollment for plan year
  2026, when an enrollment request is submitted with an effective date of
  2026-01-01, then the enrollment is accepted and the member's status
  becomes "Enrolled" for plan year 2026.
- `[API]` **AC2:** Given a member already enrolled in plan year 2026, when a
  second enrollment request is submitted for the same plan year, then the
  request is rejected with reason code `DUPLICATE_PLAN_YEAR_ENROLLMENT`.
- ...

**Technical Requirements**
- ...
- **DB verification query:** (none — this story's criteria are `[API]`; see
  the Postman collection instead)

### FR-W3-US-3 — <a DB-only story with no exposed endpoint>

- **Feature:** FR-W3
- **Phase:** Data Platform
- **QAble:** QAble
- **Points:** 1
- **Depends on:** None

<story body>

**Acceptance Criteria**
- `[DB Query]` **AC1:** Given a member's plan was updated on 2026-01-01, when
  querying the member's current plan record, then it reflects the new plan
  with an effective date of 2026-01-01.

**Technical Requirements**
- **DB verification query (AC1):** `SELECT PlanCode, EffectiveDate FROM
  Member.Enrollment WHERE MemberId = <id> ORDER BY EffectiveDate DESC;` —
  expect one row, `PlanCode` = the new plan, `EffectiveDate` = 2026-01-01.
- ...
```

Notes:
- There is no separate Feature-level `## Acceptance Criteria` section
  anymore — `## User Stories` is the only section this skill (and
  `work-feature`) owns besides the frontmatter/ADO write-back fields.
- One `### <Story ID> — <title>` heading per story under `## User Stories`.
  The bullet block (Feature/Phase/Component/QAble/Points/[Postman]/[ADO]/
  Depends on/[Relates to]) comes first, then the story body, then — **for a
  `QAble` story only** — a `**Acceptance Criteria**` block (each criterion
  tagged with its per-criterion `[API]`/`[UI]`/`[DB Query]` Verification
  Method and a bold `AC<N>` id, numbered from `AC1` within that story), then
  the `**Technical Requirements**` block. A `Not QAble` story omits the
  Acceptance Criteria block entirely, as `FR-W3-US-1` above does. Omit
  `Component` and `Relates to` if not applicable; `QAble` and `Technical
  Requirements` are never omitted. There is no `Sprint` field — every story
  is created directly in the product backlog, never assigned to a sprint
  iteration. `Postman` is added by `work-feature` once a collection actually
  exists for that story (Phase 4.3), present only once that story has at
  least one `[API]`-tagged criterion.
- `ADO` is written once the item exists (SKILL.md 6e; in Scrum Master mode after the user
  confirms the Scrum Master executed `plan-<feature>.md`), directly after `Points`;
  absent until then, or when an item couldn't be resolved on the board.
- Preserve the feature file's original content above this section — never
  overwrite the author's feature description or its own `## Acceptance
  Criteria` section if the source feature file has one (that section, when
  present, describes the feature author's own high-level intent and is
  distinct from — and never overwritten by — the per-story Acceptance
  Criteria this skill writes under `## User Stories`). Only `## User
  Stories` is owned by `plan-features`/`work-feature`; everything else in
  the file belongs to its original author.
