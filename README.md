# claude-code-harness

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.0.0-green.svg)](CHANGELOG.md)
[![Node](https://img.shields.io/badge/node-%E2%89%A520-brightgreen.svg)](https://nodejs.org)
[![Tests](https://img.shields.io/badge/tests-129%20passing-success.svg)](hooks/__tests__)

**Claude Code writes the code. This harness manages everything else — stories, plans, reviews, and the paper trail your team needs to trust it.**

16 skills, 14 agents, 5 cross-platform Node hooks, 5 path-scoped rules, tracker integration (ADO + GitHub). Install once, ship faster.

See [CHANGELOG.md](CHANGELOG.md) for what's in v1.0.0.

![Harness flow — understand, plan, execute, evaluate, PR](docs/diagrams/harness-flow.png)

---

## Why this exists

AI coding tools are powerful — but unstructured. You start a task, the model edits 12 files, and you're not sure what happened or why. There's no plan to review, no evaluation to catch mistakes, and no way to know if the change actually matches what was asked for.

**This harness adds the structure.** Every feature runs through human gates — understand, plan, execute, evaluate, PR — and nothing advances without your explicit "go". Not an autonomous agent. A supervised one.

**If you're on a team**, it goes further. Context switching costs you 20 minutes every session re-reading the story, the architecture doc, and the last PR. Code review bots leave 15 threads and you fix them one at a time, push, wait, repeat. Sprint status lives in your head. And management doesn't trust AI-generated code because nobody can prove a human approved the plan before code was written. The harness handles all of that — tracker integration, PR review loops, sprint files, and the audit trail your team needs.

---

## What it does

### Solo developers
```
/implement #42                    ← reads issue, plans, builds, evaluates, PRs
/implement "add dark mode"        ← no issue needed, just a description
/implement #42 --discuss          ← 3 clarifying questions before planning
/implement #42 --research         ← scan codebase for reusable utilities first
/implement #42 --full             ← --discuss + --research (max understanding)
/implement #42 --full --quick     ← max understanding, skip post-build evaluation
/plan                             ← prioritize your open issues
```

**`/implement` flags** (composable):
- `--discuss` — pre-plan Q&A (intent, acceptance bar, constraints, free-form notes)
- `--research` — codebase scan produces a reuse inventory before the plan
- `--quick` — skip Phase 3 (evaluation + acceptance testing)
- `--full` — sugar for `--discuss --research`; orthogonal to `--quick`

### Enterprise teams
```
/story 9950                 ← 5-phase story lifecycle with human gates
/sprint-plan 8              ← reads tracker, creates sprint file, surfaces gaps
/babysit-pr 163             ← loops PR reviews until zero threads remain
```

### Both get
```
/evaluate                   ← adversarial quality check before PR
/debug                      ← root cause diagnosis after 3 failed attempts
/troubleshoot               ← deep behavioral bug investigation
/local-test                 ← stack-agnostic build + test runner at 3 levels
```

---

## Quick start

```bash
git clone https://github.com/anudeeps28/claude-code-harness
node claude-code-harness/install/install.js        # Windows, macOS, Linux
# or, on Unix if you prefer Bash:
bash claude-code-harness/install/install.sh
```

The installer asks:
1. **Solo or Enterprise?** — Simpler issues workflow or full sprint ceremony
2. **Global or project?** — `~/.claude/` (all projects) or `.claude/` (one repo)
3. **Tracker** — GitHub (solo default) or ADO + GitHub (enterprise)
4. **Your details** — Name, org, project paths. Fills in all placeholders automatically.

Then:
- **Solo:** `/implement #42` or `/plan`
- **Enterprise:** `/story 9950` or `/sprint-plan 8`

---

## Prerequisites

- [Claude Code](https://claude.ai/code) installed
- **For ADO:** `az` CLI + `az extension add --name azure-devops`
- **For GitHub:** `gh` CLI + `gh auth login`

---

## Skills

Skills are invoked with `/skill-name` in Claude Code. Each skill is a folder under `skills/` with a `SKILL.md` file and optional supporting files (templates, scripts, reference docs).

### Solo workflow (2 skills)
| Skill | Usage | What it does |
|---|---|---|
| **implement** | `/implement #42` or `/implement "add dark mode"` | Build a feature from issue or description — plan, execute, evaluate, PR |
| **plan** | `/plan` | Read open issues, prioritize, create a simple work plan |

### Enterprise workflow (4 skills)
| Skill | Usage | What it does |
|---|---|---|
| **story** | `/story <ID>` | 5-phase story lifecycle: understand → plan → execute → evaluate → PR |
| **sprint-plan** | `/sprint-plan <N>` | Sprint planning — reads tracker, writes sprint file, surfaces gaps |
| **babysit-pr** | `/babysit-pr <PR>` | Drive a PR to zero review threads |
| **run-tasks** | `/run-tasks <ID>` | Resume story execution (Phase 3 only) |

### Shared skills (both packs)
| Skill | Usage | What it does |
|---|---|---|
| **evaluate** | `/evaluate` | Adversarial quality check before PR |
| **debug** | `/debug` | Root cause diagnosis when the 3-attempt rule triggers |
| **troubleshoot** | `/troubleshoot` | Deep behavioral bug investigation (up to 5 iterations) |
| **deploy** | `/deploy` | Deploy and verify (branch-test or post-merge modes) |
| **local-test** | `/local-test [1\|2\|3]` | Build, test, and Docker integration at 3 levels |
| **prd** | `/prd` | Generate a Product Requirements Document |
| **pa** | `/pa <question>` | Personal assistant — answers from task files, keeps them in sync |
| **sync-tasks** | `/sync-tasks` | Report drift across the 7 enterprise task files. Auto-suggested when `drift-check` hook hard-blocks |
| **retro** | `/retro [days]` | Self-improvement loop — finds recurring friction in recent sessions/evaluations and proposes harness edits. Never auto-applies |
| **grill-me** | `/grill-me <plan or design>` | Decision-tree interrogation of a plan, design, or proposal — serial questions with recommendations until shared understanding is reached |

---

## How `/implement` works (Solo)

```
Phase 1: UNDERSTAND + PLAN (combined)
  → Reads GitHub issue or takes plain text description
  → Finds relevant source files, reads project docs
  → Produces brief + XML task plan + test strategy in one pass
  → STOP 1: "Review the plan and test strategy. Say 'go' to start building."

Phase 2: EXECUTE (wave by wave)
  → Same executor agent and worktree isolation as /story
  → Every <verify> runs build + relevant tests — task only ✅ when tests pass
  → STOP 2: After each wave — "Continue?"
  → 3-attempt rule: 3 failures → auto-invokes /debug

Phase 2.5: LOCAL VERIFICATION
  → Runs /local-test to verify full build + tests pass (stack-agnostic)

Phase 3: EVALUATE + ACCEPT + PR (combined)
  → Evaluator + acceptance-test-agent run in parallel
  → Evaluator checks code quality, security, test coverage
  → Acceptance tester verifies feature works as intended
  → Drafts commit messages + PR description
  → STOP 3: "Review and commit. Say 'push' when ready."
```

**Key difference from `/story`:** 3 phases instead of 5. No separate understand phase, no sprint file dependency, no child task structure. Same executor, same evaluator, same quality.

---

## How `/story` works (Enterprise)

```
Phase 1: UNDERSTAND
  → Reads issue from tracker + codebase
  → Produces 8-point brief
  → Writes handoff contract: tasks/stories/<id>/brief.md
  → STOP 1: "Does this match your understanding?"

Phase 2: PLAN
  → Decomposes into XML task plan with parallel groups
  → Produces test strategy — acceptance criteria, integration scenarios, regression guardrails
  → Mandatory type="test" tasks in every plan
  → Writes handoff contracts: plan.md + test-strategy.md
  → STOP 2: "Approve the plan and test strategy?"

Phase 3: EXECUTE (wave by wave)
  → Groups tasks into waves by parallel_group
  → Launches each task in an isolated git worktree (auto-cleaned)
  → Every <verify> runs build + relevant tests — task only ✅ when tests pass
  → Updates handoff contract: tasks/stories/<id>/executor-state.md
  → STOP 3: After every wave — "Continue?"
  → 3-attempt rule: 3 failures → auto-invokes /debug

Phase 3.5: LOCAL VERIFICATION
  → Runs /local-test to verify full build + all tests pass (stack-agnostic, reads lessons.md)

Phase 3.6: EVALUATION + ACCEPTANCE TESTING (parallel)
  → Spawns evaluator-agent + acceptance-test-agent in parallel
  → Evaluator: build, tests, plan compliance, test coverage, security, code quality
  → Acceptance tester: verifies acceptance criteria, integration points, regression guardrails
  → Writes handoff contracts: evaluation.md + acceptance.md
  → STOP 3.6: Review findings from both — "fix" or "skip" each

Phase 4: COMMIT + PR
  → Drafts atomic commit messages
  → Writes PR description
  → STOP 4: You run the git commands
```

---

## Agents

| Agent | Model | Used by | Role |
|---|---|---|---|
| `implement-planner-agent` | opus | `/implement` Phase 1 | Combined understand+plan in one pass |
| `story-understand-agent` | opus | `/story` Phase 1 | Reads issue + docs, produces 8-point brief |
| `story-plan-agent` | opus | `/story` Phase 2 | Produces XML task plan |
| `story-executor-agent` | sonnet | `/story`, `/implement` | Writes code for one task |
| `story-pr-agent` | sonnet | `/story` Phase 4 | Commit messages + PR description |
| `evaluator-agent` | opus | `/evaluate`, `/story` 3.6 | Adversarial quality check + test coverage |
| `acceptance-test-agent` | opus | `/story` 3.6, `/implement` 3 | Verifies acceptance criteria, integration, regression |
| `babysit-pr-analyst` | sonnet | `/babysit-pr` | Categorizes threads as fix/reply |
| `babysit-pr-fixer` | sonnet | `/babysit-pr` | Applies code fixes |
| `sprint-plan-tracker-reader` | haiku | `/sprint-plan` | Calls tracker CLI |
| `sprint-plan-docs-reader` | haiku | `/sprint-plan` | Reads docs/ folder |
| `sprint-plan-gap-analyzer` | opus | `/sprint-plan` | Produces planning questions |
| `debug-agent` | opus | `/debug` | Root cause diagnosis |
| `troubleshoot-investigator` | opus | `/troubleshoot` | Behavioral bug investigation |

**Model routing:** Opus for thinking/judging, Sonnet for writing code, Haiku for simple data gathering.

---

## Hooks

All hooks run on Node.js (>= 20). One cross-platform implementation.

| Hook | Event | What it does |
|---|---|---|
| `safety-check.js` | PreToolUse (Bash\|Write) | Blocks destructive git/file/cloud operations + Write of hardcoded secrets |
| `catalog-trigger.js` | PostToolUse (Write/Edit) | Rebuilds SKILLS_CATALOG.md when skills change |
| `drift-check.js` | PostToolUse (Write/Edit) | Detects cross-file drift in the 7 enterprise task files — soft warnings + hard block that forces `/sync-tasks` |
| `pre-compact.js` | PreCompact | Saves in-progress state before context compression |
| `session-log.js` | SessionEnd | Appends session metadata to sessions.jsonl |

---

## Path-scoped rules

Rules in `rules/` activate only when Claude reads matching files:

| Rule | Applies to | Content |
|---|---|---|
| `code-style.md` | `src/**` | Code style — defers to `tasks/lessons.md` for stack-specific conventions |
| `testing.md` | `tests/**` | Unit, integration, and acceptance test rules |
| `test-philosophy.md` | `**/*` | Testing philosophy — 3 levels of testing, mandatory test strategy, verify commands must include tests |
| `security.md` | `**/*.{cs,ts,js,py}` | No hardcoded secrets, parameterized queries |
| `documentation.md` | `docs/**`, `*.md` | Don't modify architecture docs |

---

## Tracker adapters

Skills don't know if you use ADO or GitHub. The adapter layer abstracts it:

```
skill → trackers/active/get-issue.sh → ado/get-issue.sh  (or)  github/get-issue.sh
```

Both adapters implement the same 6-script interface:
- `get-issue.sh <ID>` — Returns work item details
- `get-issue-children.sh <ID>` — Returns child tasks
- `get-pr-review-threads.sh <PR_ID>` — Returns review threads
- `reply-pr-thread.sh <PR_ID> <THREAD_ID> "<text>"` — Posts a reply
- `resolve-pr-thread.sh <PR_ID> <THREAD_ID>` — Resolves a thread
- `get-sprint-issues.sh <SPRINT_NUM>` — Returns all sprint issues

To add a new tracker (Linear, Jira): implement these 6 scripts and drop them in `trackers/your-tracker/`.

---

## Handoff contracts

Each story gets structured state files that pass between phases:

```
tasks/stories/<story-id>/
├── brief.md           ← Phase 1 output (8-point understanding)
├── plan.md            ← Phase 2 output (XML task plan + rationale)
├── test-strategy.md   ← Phase 2 output (acceptance criteria + integration scenarios + regression guardrails)
├── executor-state.md  ← Phase 3 output (per-task results, updated per wave)
├── evaluation.md      ← Phase 3.6 output (evaluator findings + verdict)
└── acceptance.md      ← Phase 3.6 output (acceptance criteria PASS/FAIL + verdict)
```

This prevents goal drift, makes debugging easier, and lets the evaluator check work against the original plan.

---

## Task files

The installer creates different task files based on your workflow pack:

### Solo pack (3 files)
| File | What it holds |
|---|---|
| `plan.md` | Current priorities, in-progress work, backlog |
| `notes.md` | Code conventions, git rules, decisions, known fixes, blockers |
| `sessions.jsonl` | Append-only session log *(auto-generated)* |

### Enterprise pack (7+ files)
| File | What it holds |
|---|---|
| `lessons.md` | Git rules, code conventions, known fixes, Code Rabbit patterns |
| `todo.md` | XML task plans for active stories + session notes |
| `pr-queue.md` | All branches, PR numbers, merge status |
| `flags-and-notes.md` | Blockers, decisions, open questions |
| `tracker-config.md` | Tracker type, environment URLs, cloud resource names |
| `people.md` | Team member roles + waiting-on *(optional)* |
| `sprint<N>.md` | Sprint master status table *(one per sprint)* |
| `sessions.jsonl` | Append-only session log *(auto-generated)* |

---

## Customization

### Works out of the box
`/implement`, `/plan`, `/story`, `/babysit-pr`, `/sprint-plan`, `/run-tasks`, `/debug`, `/troubleshoot`, `/evaluate`, `/prd`, `/pa`

### Needs configuration
- **`/deploy`** — Fill in cloud resource names in `tasks/tracker-config.md` (enterprise) or `tasks/notes.md` (solo).
- **`/local-test`** — Fill in the "Test Commands" section of `tasks/lessons.md` with your stack's build/test/integration commands. The skill is stack-agnostic and reads commands from there.
- **Task files** — Add your project's code conventions, known fixes, and build commands.

### Stack-agnostic
The harness works with any tech stack. Agents read conventions from `tasks/lessons.md` — customize that file for your language (.NET, Node, Python, Go, etc.). The example `lessons.md` ships with .NET/C# conventions as a starting point.

---

## Repository structure

```
claude-code-harness/
├── skills/           ← 16 skills
├── agents/           ← 14 sub-agents
├── hooks/            ← 6 automated hooks
├── rules/            ← 5 path-scoped rules
├── trackers/         ← ADO + GitHub adapters (6 scripts each)
├── templates/tasks/  ← blank task files for new projects
├── examples/         ← filled-in examples (GitHub + .NET)
├── install/          ← interactive installer
├── LICENSE           ← MIT
├── VERSION           ← current version number
├── CHANGELOG.md      ← release history
├── README.md         ← this file
├── CONFIGURE.md      ← manual configuration reference
└── CONTRIBUTING.md   ← how to add skills, agents, or trackers
```

---

## Key design decisions

- **Human gates everywhere** — Nothing advances without your explicit "go". Not an autonomous agent — a supervised one.
- **3-attempt rule** — If something fails 3 times, stops retrying and invokes `/debug` for root-cause diagnosis. Prevents infinite loops.
- **Early-exit on high confidence** — Troubleshoot investigations can stop before 5 iterations when root cause is confirmed (>95% confidence, stress-tested).
- **File-based state** — `tasks/` files are the source of truth. No database, no external service. Git-friendly, diff-friendly, human-readable.
- **Adversarial evaluation** — The evaluator agent has a different prompt than the executor. It tries to break things, not defend them. Prevents self-evaluation bias.
- **Model routing** — Opus for thinking, Sonnet for typing, Haiku for data gathering. Saves cost without sacrificing quality.
- **Tracker abstraction** — Same 6-script interface for ADO and GitHub. Adding a new tracker = implementing 6 shell scripts.

---

## License

MIT — see [LICENSE](LICENSE).

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to add skills, agents, hooks, or tracker adapters.

---

## Contact

Questions, feedback, or just want to chat about the harness? Find me on X: [@anudeep_2806](https://x.com/anudeep_2806).
