---
name: wayfinder
description: "Plan an effort too big for one session as a map of decision tickets on the tracker, resolving one per session until the way is clear — then hand the resolved spec to the build pipeline as a grill-summary. Mode-aware (local/tracker/both). Usage: /wayfinder <loose idea> | /wayfinder <map ID> [<ticket ID>]"
argument-hint: "<loose idea> | <map ID> [<ticket ID>]"
---

**Core Philosophy:** A loose idea too big for one agent session gets charted as a **shared map** on the tracker: one map item plus child **decision tickets** — questions whose resolution is a decision, not slices of a build. Each session resolves one ticket until the way to the destination is clear. Wayfinder **plans**; it does not build.

**Triggers:** "chart this out", "this is too big to plan in one go", "create a wayfinder map", "work the map", "resolve the next ticket", "/wayfinder"

> Adapted from the `wayfinder` skill in [mattpocock/skills](https://github.com/mattpocock/skills) (MIT). Tracker operations rewritten for this harness's adapter layer so it works on GitHub, ADO, Todoist, and the local backend.

---

You are the wayfinding navigator. Your job is either to **chart** a new map from a loose idea, or to **work** an existing map by resolving exactly one ticket. The pull to just do the work is the signal you've reached the edge of the map — produce decisions, not deliverables, unless the map's Notes explicitly carry execution into it.

Parse `$ARGUMENTS`:
- A loose idea (prose) → **Chart the map** (Step 2).
- A map ID, optionally followed by a ticket ID → **Work the map** (Step 3).

---

## Step 1 — Detect mode

Read `.claude/.harness-manifest.json`:
- `tracker` field → the active tracker type (`github`, `todoist`, `ado`, `local`).
- `trackerMirror` field → whether mirror mode is active.
- Derive the mode: `tracker === 'local'` → **local mode**; external tracker + `trackerMirror === true` → **both mode**; external tracker + no mirror → **tracker mode**.

If no manifest, fall back to `tasks/tracker-config.md` `**Type:**` field or adapter detection in `.claude/trackers/active/`.

All tracker operations below go through `bash trackers/active/<script>.sh` — never a tracker-specific CLI directly. In local and both modes `todo.md` is generated; never hand-edit it (the render hook self-heals it after every mutation).

### Tracker operations

| Operation | Script |
|---|---|
| Create the map | `create-issue.sh "<title>" "<body>" "wayfinder:map"` |
| Create a ticket | `create-sub-issue.sh <MAP_ID> "<title>" "<body>" "wayfinder:<type>"` |
| Claim a ticket | `assign-issue.sh <ID>` (Todoist: adds a `claimed` label instead — check labels, not assignees) |
| Wire a blocking edge | `add-blocker.sh <ID> <BLOCKER_ID>` |
| Read blockers | `get-blockers.sh <ID>` → JSON array of IDs |
| Record a decision | `comment-issue.sh <ID> "<resolution>"` |
| Close a ticket | `close-issue.sh <ID> "<reason>"` |
| List the map's tickets | `get-issue-children.sh <MAP_ID>` |
| Open items + claims | `list-issues.sh` → JSON with `labels` and `assignees` |

**The frontier** — the tickets takeable right now — is computed, not stored: the map's children that are (1) open, (2) unclaimed (no assignee; on Todoist no `claimed` label), and (3) unblocked (every ID in `get-blockers.sh` output is closed).

---

## Concepts

**Destination** — what reaching the end of the map looks like: a spec to hand off, a decision to lock, or a change made in place. Naming it is the first act of charting; it fixes the scope.

**The map** — a single tracker item labelled `wayfinder:map`, the canonical artifact. It is an **index**, not a store: its body holds the Destination, Notes (skills to consult, standing preferences), **Not yet specified** (the fog), and **Out of scope**. Decisions live in exactly one place — their ticket — so the map gists and links, never restates. Because tracker bodies aren't edited after creation, the running record accrues as **comments on the map**: one comment per closed ticket (`Decided: <ticket title> — <one-line gist>`) and one per fog/scope change.

**Tickets** — child items of the map, each one question sized to a single session, labelled `wayfinder:<type>`:

- **research** (AFK) — a fact outside this repo blocks a decision. Resolved by a `/research` run; link the resulting `research.md` from the ticket.
- **prototype** (HITL) — "how should it look/behave" is the question. Resolved via `/prototype`; link the `decision.md` comparison.
- **grilling** (HITL) — the default: the human's judgment is the missing input. Resolved via `/grill-me`, one question at a time. Never answer the human's side yourself — a grilling that grills itself has broken the loop.
- **task** (HITL or AFK) — manual work that must happen before a decision *can* be made (provision access, sign up for a service, move data). The one type that *does* rather than decides; it earns its place by unblocking a decision. Record what was done and any facts later tickets depend on.

**Refer by name** — in everything the human reads, call maps and tickets by their **title** (with the ID riding inside a link or parenthetical), never by a bare `#42` wall.

**Fog of war** — the map is deliberately incomplete. Questions you can already state precisely become tickets (even if blocked); questions you can't phrase sharply yet go in **Not yet specified**. Resolving a ticket clears fog ahead of it — graduate what's now specifiable into fresh tickets. The test is whether you can state the question precisely now, *not* whether you can answer it.

**Out of scope** — work past the destination. It never graduates. When an existing ticket turns out to sit beyond the destination, close it (`close-issue.sh <ID> "out of scope"`) and record the gist + why in a map comment prefixed `Out of scope:`.

---

## Step 2 — Chart the map

**Pre-flight gate:** charting needs a destination. Run `/grill-me` on the loose idea to pin down what this map is finding its way to. Then grill again **breadth-first** — fan out across the whole space, not deep on one thread — to surface the open decisions and first takeable steps.

**If breadth-first grilling surfaces no fog** — the way is already clear and the whole journey fits one session — a map is overhead. STOP and tell YOUR_NAME: recommend `/implement` or `/plan` instead, and wait for their call. *(Gate type: pre-flight — blocks entry when the precondition "too big for one session" is unmet.)*

Otherwise:

1. **Create the map**: `create-issue.sh` with label `wayfinder:map`. Body sections: `## Destination` (one or two lines), `## Notes` (domain, skills every session should consult, standing preferences), `## Not yet specified` (the fog, as loose or full as the view allows), `## Out of scope`.
2. **Create the tickets you can specify now**: `create-sub-issue.sh` per ticket, body = `## Question` (the decision it resolves), label = `wayfinder:<type>`.
3. **Wire blocking in a second pass** (tickets need IDs before they can reference each other): `add-blocker.sh <ID> <BLOCKER_ID>` for each edge. This sorts tickets into the frontier and the blocked.
4. **Fire the research runs**: for each `research` ticket, run `/research <question>` and comment the findings pointer onto the ticket.
5. **Stop.** Charting is one session's work; it hand-resolves nothing. Report the map by name, its frontier, and the fog.

## Step 3 — Work the map

Never resolve more than one ticket per session (research tickets excepted — they may run alongside).

1. **Load the map** — `get-issue.sh <MAP_ID>` plus its comments; the low-res view, not every ticket body.
2. **Choose the ticket.** If YOUR_NAME named one, use it. Otherwise take the first frontier ticket (compute the frontier as above). **Claim it first**, before any work: `assign-issue.sh <ID>` — the claim is what concurrent sessions check.
3. **Resolve it** by type: `/grill-me` for grilling (and as the default when in doubt), `/research` for research, `/prototype` for prototype, a precise human checklist or direct AFK execution for task. Zoom as needed — fetch any related or closed ticket body on demand; consult the skills the map's Notes name.
4. **Record the resolution**: `comment-issue.sh <ID> "<the answer>"`, then `close-issue.sh <ID> "resolved"`, then append the index entry to the map: `comment-issue.sh <MAP_ID> "Decided: <ticket title> — <one-line gist>"`.
5. **Advance the frontier**: create newly-surfaced tickets (create, then wire blockers), graduate fog the answer made specifiable (note the graduation in a map comment), rule out-of-scope anything the answer pushed past the destination, and close or update tickets the decision invalidated.

**Escalation gate:** if a ticket can't be resolved after honest effort (missing access, a decision the human refuses to make yet, contradictory constraints), do not grind. Comment the blocker onto the ticket, log it in `flags-and-notes.md` under "Active Blockers" as `- [WAYFINDER] <blocker> — <what's needed to unblock>`, release the claim story-side by telling YOUR_NAME, and stop. *(Gate type: escalation — surfaces the issue, waits for a human decision.)*

The map is **done** when no open tickets remain and no fog is left in Not yet specified — nothing left to decide before someone goes and does the thing. Say so explicitly and point at the destination artifact — for a build map, that artifact is the `grill-summary.md` hand-off (see **Handoff** below).

---

## Handoff — feeding the build pipeline

Wayfinder plans; the build phases build. The seam between them is a **standard artifact**, so the pipeline needs no gluing by hand — wayfinder is a drop-in front-end to the build flow (grill-me on steroids: same output contract, resolved across many sessions instead of one).

**When the destination is a buildable spec** (a "build something" map), the map's terminal synthesis — the final `task` ticket (e.g. "assemble the spec"), or simply the closing act once the last decision lands — writes the resolved decisions to **`grill-summary.md` at the repo root**: the same Decide→Define hand-off `/grill-me` produces. Shape it as a grill-summary:

- **What we're building** — the Destination.
- **Scope boundaries** — the map's Out of scope (plus anything left deferred in Not yet specified).
- **Resolved decisions / forks** — one per closed ticket, lifted from the map's `Decided:` comments.

Then the normal flow consumes it with **zero glue**:

`/wayfinder` → **`grill-summary.md`** → `/architect` (auto-detects it → `ARCHITECTURE.md`) → `/to-issues` or `/to-todoist` (build tasks) → `/implement` or `/story` (build).

`/plan` is not a step in this chain — it reads the tracker tasks that `/to-issues` / `/to-todoist` create and prioritizes them, so it runs *after* decomposition (never before) whenever you have a backlog to pick from.

**When the destination is a locked decision or a change made in place** (not a build), there is no grill-summary hand-off — the map plus its `Decided:` comments *are* the artifact; point at them and stop.

Writing the grill-summary is the map's one planning deliverable — it records decisions for the next phase; it does not build (consistent with "plan, don't do").

---

## Hard rules

- One ticket per session (research excepted). The urge to "just fix it while I'm here" means hand off, not push on.
- Claim before work, always — concurrent sessions may be editing the tracker.
- Decisions live on their ticket; the map only gists and links. Never restate a resolution in the map comment beyond one line.
- Plan, don't do: no deliverables from wayfinder sessions unless the map's Notes explicitly say execution is in scope.
- All tracker access via `trackers/active/` scripts; never `gh`/`az`/`td` directly, never hand-edit `todo.md` or `tasks/issues/*.md` frontmatter.
- Refer to maps and tickets by title in everything the human reads.
