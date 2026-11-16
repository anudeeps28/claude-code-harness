# CONTEXT.md

Architecture map, domain glossary and codebase conventions for the claude-code-harness repository.
Read by Claude Code agents before grilling, architecture proposals, or refactor sessions, so they anchor suggestions in the team's shared vocabulary.

**How to maintain:** Update as understanding evolves. Add terms when they stabilize. ADRs record *why* decisions were made; this file records *what* is true now. The map's **Depends on** column is filled by hand from each module's Interface and body; an automated check of it is planned (`rules/modules.md`, "The boundary check", item 6) and is not yet in place. `scripts/__tests__/boundaries-context.test.js` checks the rows, the Kind, the Private agents and the Interface links.

---

## Architecture map

One row per skill, shared or person agent, and code module. An agent a skill owns is listed in that skill's **Private agents** cell and has no row of its own. A module is used only through its **Interface**.

| Module | Kind | Owns | Private agents | Depends on | Interface |
|---|---|---|---|---|---|
| `/architect` | skill | Designs system architecture from a PRD or grill summary into ARCHITECTURE.md. | — | — | [skills/architect/SKILL.md#interface](skills/architect/SKILL.md#interface) |
| `/architect-critique` | skill | Critiques an ARCHITECTURE.md on five axes and reports severity-tagged findings. | — | — | [skills/architect-critique/SKILL.md#interface](skills/architect-critique/SKILL.md#interface) |
| `/babysit-pr` | skill | Drives a PR to zero review threads: fetch, categorize, fix, reply, repeat. | `babysit-pr-analyst`, `babysit-pr-fixer` | /debug, code-platform | [skills/babysit-pr/SKILL.md#interface](skills/babysit-pr/SKILL.md#interface) |
| `/calibrate` | skill | Learning-effectiveness dashboard; promotes high-scoring learnings and archives weak ones. | — | — | [skills/calibrate/SKILL.md#interface](skills/calibrate/SKILL.md#interface) |
| `/coverage-audit` | skill | The closing check that maps every source requirement line to Built, Partly or Missing. | — | /implement, `coverage-auditor-agent`, trackers | [skills/coverage-audit/SKILL.md#interface](skills/coverage-audit/SKILL.md#interface) |
| `/debug` | skill | Root-cause diagnosis when the 3-attempt rule fires; builds a feedback loop and tests ranked hypotheses. | — | `debug-agent` | [skills/debug/SKILL.md#interface](skills/debug/SKILL.md#interface) |
| `/decision-brief` | skill | Pre-PRD assumption pass producing a Decision Brief with ranked evidence. | — | — | [skills/decision-brief/SKILL.md#interface](skills/decision-brief/SKILL.md#interface) |
| `/deploy` | skill | Deploys to the cloud and verifies a branch or production deployment. | — | — | [skills/deploy/SKILL.md#interface](skills/deploy/SKILL.md#interface) |
| `/design-artifacts` | skill | Generates the project spec stack (schema, API, sequence, data flow) from ARCHITECTURE.md and the PRD. | — | — | [skills/design-artifacts/SKILL.md#interface](skills/design-artifacts/SKILL.md#interface) |
| `/evaluate` | skill | Adversarial evaluation of a change: build, tests, plan compliance and security review. | — | `evaluator-agent` | [skills/evaluate/SKILL.md#interface](skills/evaluate/SKILL.md#interface) |
| `/explain-in-parts` | skill | Explains a topic one piece at a time, checking understanding after each piece. | — | — | [skills/explain-in-parts/SKILL.md#interface](skills/explain-in-parts/SKILL.md#interface) |
| `/frontend-design` | skill | Optional bundle of design sub-skills: brand, UI styling, slides, design systems and canvas design. | — | — | [skills/frontend-design/README.md](skills/frontend-design/README.md) |
| `/grill-me` | skill | Decision-tree interrogation of a plan or design until shared understanding is reached. | — | — | [skills/grill-me/SKILL.md#interface](skills/grill-me/SKILL.md#interface) |
| `/grill-with-docs` | skill | Stress-tests a plan against CONTEXT.md and the ADRs. | — | install | [skills/grill-with-docs/SKILL.md#interface](skills/grill-with-docs/SKILL.md#interface) |
| `/hackathon` | skill | Ships a queue of small changes one at a time, each checked by launching the real app. | — | /local-test | [skills/hackathon/SKILL.md#interface](skills/hackathon/SKILL.md#interface) |
| `/implement` | skill | The build skill: a Feature, a story or a bug from plan gate through review, e2e gate and PR. | `acceptance-test-agent`, `architect-reviewer-agent`, `implement-planner-agent`, `loosened-reviewer-agent`, `prover`, `security-reviewer-agent`, `story-builder`, `story-pr-agent`, `story-reviewer`, `story-understand-agent`, `suite-runner`, `tracker-helper` | /babysit-pr, /coverage-audit, /debug, /local-test, `evaluator-agent`, trackers, code-platform | [skills/implement/SKILL.md#interface](skills/implement/SKILL.md#interface) |
| `/improve-codebase-architecture` | skill | Finds shallow modules and proposes deepening refactors from CONTEXT.md and the ADRs. | — | — | [skills/improve-codebase-architecture/SKILL.md#interface](skills/improve-codebase-architecture/SKILL.md#interface) |
| `/improve-harness` | skill | Self-improvement loop: reads sessions and lessons, proposes harness changes. | — | /implement, `debug-agent`, `evaluator-agent`, trackers | [skills/improve-harness/SKILL.md#interface](skills/improve-harness/SKILL.md#interface) |
| `/local-test` | skill | Runs the local build, tests and the feature e2e goal gate from tasks/lessons.md commands. | — | — | [skills/local-test/SKILL.md#interface](skills/local-test/SKILL.md#interface) |
| `/pa` | skill | Answers questions about sprint status, blockers, PRs and todos from the task files. | — | trackers | [skills/pa/SKILL.md#interface](skills/pa/SKILL.md#interface) |
| `/plan` | skill | Reads open issues, prioritizes them and writes a simple plan. | — | trackers | [skills/plan/SKILL.md#interface](skills/plan/SKILL.md#interface) |
| `/plan-features` | skill | Turns any plan into Features and stories on the board. | — | /implement, trackers | [skills/plan-features/SKILL.md#interface](skills/plan-features/SKILL.md#interface) |
| `/prd-critique` | skill | Runs six critique checks on a PRD and reports severity-tagged findings. | — | — | [skills/prd-critique/SKILL.md#interface](skills/prd-critique/SKILL.md#interface) |
| `/prototype` | skill | Throwaway prototyping of one to three candidate approaches with a decision.md. | — | — | [skills/prototype/SKILL.md#interface](skills/prototype/SKILL.md#interface) |
| `/ralph-prd` | skill | Generates a Product Requirements Document with stories sized to one context window. | — | trackers | [skills/ralph-prd/SKILL.md#interface](skills/ralph-prd/SKILL.md#interface) |
| `/research` | skill | Researches an external API or library and caches provenance-tagged findings in research.md. | — | — | [skills/research/SKILL.md#interface](skills/research/SKILL.md#interface) |
| `/sprint-plan` | skill | Sprint planning: reads tracker issues and the codebase, writes the sprint file and surfaces gaps. | `sprint-plan-docs-reader`, `sprint-plan-gap-analyzer`, `sprint-plan-tracker-reader` | trackers | [skills/sprint-plan/SKILL.md#interface](skills/sprint-plan/SKILL.md#interface) |
| `/sync-tasks` | skill | Detects and resolves drift across the task files and project artifacts. | — | /pa, hooks, trackers | [skills/sync-tasks/SKILL.md#interface](skills/sync-tasks/SKILL.md#interface) |
| `/sync-tracker` | skill | Reconciles merged PRs and completed work against open tracker items. | — | /coverage-audit, hooks, trackers | [skills/sync-tracker/SKILL.md#interface](skills/sync-tracker/SKILL.md#interface) |
| `/tdd` | skill | Strict RED-GREEN-REFACTOR enforcement, one vertical slice at a time. | — | /implement | [skills/tdd/SKILL.md#interface](skills/tdd/SKILL.md#interface) |
| `/triage` | skill | Routes incoming issues through a five-state triage workflow. | — | trackers | [skills/triage/SKILL.md#interface](skills/triage/SKILL.md#interface) |
| `/update-harness` | skill | Checks for and applies updates to a harness installation. | — | install, trackers | [skills/update-harness/SKILL.md#interface](skills/update-harness/SKILL.md#interface) |
| `/wayfinder` | skill | Plans an effort too big for one session as a map of decision tickets on the tracker. | — | /grill-me, /prototype, /research, trackers | [skills/wayfinder/SKILL.md#interface](skills/wayfinder/SKILL.md#interface) |
| `/zoom-out` | skill | High-level map of unfamiliar code and how a piece fits in. | — | — | [skills/zoom-out/SKILL.md#interface](skills/zoom-out/SKILL.md#interface) |
| `coverage-auditor-agent` | agent (shared) | Reads a source document and the code and marks every requirement line Built, Partly or Missing. | — | — | [agents/coverage-auditor-agent.md#interface](agents/coverage-auditor-agent.md#interface) |
| `debug-agent` | agent (shared) | Root-cause analysis of a build or test failure with ranked, falsifiable hypotheses; fixes nothing. | — | — | [agents/debug-agent.md#interface](agents/debug-agent.md#interface) |
| `evaluator-agent` | agent (shared) | Adversarial quality evaluation of a change with tiered findings; fixes nothing. | — | — | [agents/evaluator-agent.md#interface](agents/evaluator-agent.md#interface) |
| `build-session` | agent (person) | The single build session for one work item, from understanding to the PR body. | — | /implement | [agents/build-session.md#interface](agents/build-session.md#interface) |
| `chief-operator` | agent (person) | Main-session project operator that researches, decides and delegates; never implements. | — | install, trackers | [agents/chief-operator.md#interface](agents/chief-operator.md#interface) |
| `review-session` | agent (person) | Fresh adversarial report-only review of a finished change before the review gate. | — | /evaluate | [agents/review-session.md#interface](agents/review-session.md#interface) |
| `hooks` | code module | Node scripts that run on Claude Code tool events: safety checks, session state, drift and tracker sync. | — | trackers | [hooks/README.md#interface](hooks/README.md#interface) |
| `trackers` | code module | Tracker adapter layer: the standard scripts skills call, with github, ado, todoist and local adapters. | — | code-platform, install | [trackers/README.md#interface](trackers/README.md#interface) |
| `code-platform` | code module | Code-platform adapter layer for PR review-thread operations (github, azure-repos, none). | — | install, trackers | [code-platform/README.md#interface](code-platform/README.md#interface) |
| `install` | code module | The installer: copies the harness into a project or ~/.claude, wires hooks, checks, updates and switches an install. | — | /coverage-audit, /implement, /sprint-plan, `coverage-auditor-agent`, `debug-agent`, `evaluator-agent`, hooks, trackers, code-platform | [install/README.md#interface](install/README.md#interface) |
| `scripts` | code module | Maintainer tooling: the dogfood links and the boundary checks that npm test runs. | — | hooks, trackers, code-platform | [scripts/README.md#interface](scripts/README.md#interface) |

A module depends on another when it spawns that agent, invokes that skill, runs that code module's scripts, requires its files, or points at a file inside it (a path such as `skills/pa/SKILL.md` or `hooks/drift-check.js`); it does not depend on a module it only names in prose ("run /x", "see /x"), on a `tasks/` file another module writes, on a require or a pointer that only a test file (`__tests__/`) or a code comment makes, or on a module that calls it. An agent a skill owns counts as part of that skill, and a name in a list of removed files is not a pointer.

---

## Domain glossary

| Term | Definition |
|---|---|
| Module | A skill, agent or code module that does a lot of work behind a small Interface block (`rules/modules.md`). |
| Interface | The one place a module's contract is written: an `## Interface` block or a README. Everything below it is private. |
| Feature | A group of stories built one after another on one branch in one worktree, with one review panel and one PR. |
| Story | One unit of work with acceptance criteria, built and committed on its own. |
| Plan gate | The single point where a person approves the plan, after which an `/implement` run is autonomous. |
| Tracker adapter | A script set under `trackers/` that hides which issue tracker (github, ado, todoist, local) is in use. |

---

## Codebase conventions

- Skills, agents and rules are Markdown; hooks, installer and scripts are dependency-free Node.js.
- Every skill and agent carries an `## Interface` block right after its frontmatter; every code module has a `README.md` with the same four parts.
- Each agent's frontmatter names its `owner:` (a skill, `shared` or `person`); a skill uses only its own and shared agents.
- Every agent an orchestrator starts reports back with a `STATUS:` line; a person agent (`owner: person`) reports none (`rules/agent-handoff.md`).

---

## See also

- `docs/adr/` — Architectural Decision Records (why decisions were made)
- `rules/modules.md` — what a module is and how the boundary check works
