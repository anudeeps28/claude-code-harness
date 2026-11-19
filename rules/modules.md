# Modules — Harness Rule

This file is the **single source of truth** for what a module is in this harness, what its interface
is, and what makes a boundary between two modules good.

**Location:** `rules/modules.md` (installed alongside `.claude/skills/`; the `.claude/` copy is a
symlink to this file).

---

## What a module is

A module does a lot of work behind a small surface. Code outside it uses only that surface and never
reaches inside. In this harness the modules are:

| Kind | Modules | Its interface (the only part others may use) |
|---|---|---|
| Code module | `hooks`, `trackers`, `code-platform`, `install`, `scripts` | What it exports, plus the arguments and output of each script that other modules call |
| Skill | each `skills/<name>/` | Its frontmatter and usage line, plus the files it reads and writes under `tasks/` |
| Agent | each `agents/<name>.md` | Its frontmatter, what its brief must contain, and its report (the `STATUS:` line and what follows) |

Two folders are not modules:

- **`rules/`** holds the contracts *between* modules (for example `rules/phase-markers.md`,
  `rules/agent-handoff.md`). A module may depend on any rule.
- **`templates/`** is data that the installer ships.

Anything in a module that its interface does not name is private: other modules must not call it,
import it, or point at it. That includes a skill's `bin/` scripts and the section headings inside a
`SKILL.md`, unless the module lists them as part of its interface.

---

## Every module has the same shape

```
skills/<name>/
  SKILL.md        frontmatter, then ## Interface, then the body
  bin/            scripts (optional)
  reference/      extra docs the skill loads (optional)
  templates/      files the skill copies or fills in (optional)
  __tests__/      (optional)

agents/<name>.md  frontmatter (with owner:), then ## Interface, then the body

<code module>/
  README.md       the interface
  lib/            private
  __tests__/
```

A code module may also hold a top-level script or folder (an adapter folder, say) that its README
`## Interface` block names. Nothing else sits at the top of a module's folder. The boundary check enforces this shape.
**Known exception:** `skills/frontend-design/` is a bundle of sub-skills, not one skill, and is
exempt until it is reshaped.

---

## Where an interface is written

Each module's interface is written in **one** place, and other modules read that instead of the
module's insides:

- **Skills and agents** — an `## Interface` block at the top of the module's own file (`SKILL.md`, or
  the agent's `.md`), right after the frontmatter. It lists:
  - **Inputs** — arguments, and the files it reads;
  - **Outputs** — the files it writes, and its report format;
  - **Callable parts** — anything others may call directly (for example a `bin/` script);
  - **Never breaks** — the promises the module always keeps (for example "never pushes to main").
- **Code modules** — the module's `README.md`, with the same four parts.

A **Never breaks** promise that came from a decision cites its ADR, for example "one commit per story
(ADR-0005)", so the reason is one step away before anyone changes it. Every ADR in `docs/adr/` carries
a `Modules:` line naming the modules it affects.

This block *is* the module's doc. Its purpose is the frontmatter `description:` (or the README's
first line), and its dependencies are in the architecture map; no separate per-module doc is kept.

Everything below the `## Interface` block is private. Other files may point at the block, never at a
heading below it. When the interface changes, the block changes in the same commit.

---

## Tests check the interface

A module's tests check its interface, so its insides can be rewritten freely and a test fails only
when something other modules rely on breaks.

- **A test belongs to one module.** It may read that module's own files, other modules' `## Interface`
  blocks, and `rules/`. It may also read files that belong to no module: the root docs (`README.md`,
  `CHANGELOG.md`, `CONTRIBUTING.md`, ...), `CONTEXT.md`, `docs/`, `templates/` and `examples/`. Nothing else.
- **Code modules** are tested through their exports and their scripts' arguments and output.
- **Checks on an agent's own text** live in `agents/__tests__/`, so they break only when that agent is
  edited.
- **A promise between modules** (for example "every review agent's report starts with a `STATUS:`
  line") is checked against the Interface blocks, because that is where the promise is written.

**The carve-out.** A check that spans many modules lives in the boundary family and may read module
bodies: `scripts/__tests__/boundaries-*.test.js`, with `scripts/lib/*` and `scripts/__tests__/helpers.js`.
That includes the checks of the whole repo (`boundaries-repo`, `boundaries-lock-agents` and
`boundaries-models`) and the frozen data files they use (`probe-promises*.js`). The rules above govern
every other test.

---

## Who owns an agent

Claude Code needs every agent in one flat `agents/` folder, so an agent's file cannot sit inside the
skill it belongs to. Ownership is written down instead:

- Each agent's frontmatter carries `owner:` — the skill it belongs to (`owner: implement`), or
  `owner: shared` when more than one skill uses it, or `owner: person` when no skill uses it and a
  person launches it directly (`claude --agent <name>`).
- A skill may use its own agents and shared agents. It never uses another skill's private agent; if it
  needs one, that agent becomes `shared` first.
- The architecture map lists each skill with the agents it owns.

---

## The architecture map

`CONTEXT.md` at the repo root opens with `## Architecture map`: one table row per skill, shared agent
and code module, with its kind, what it owns, its private agents, what it depends on, and a link to
its Interface. Private agents are listed under their skill, not as rows of their own. An agent reads
the map before working on any module.

The boundary check works out the real dependencies from imports and file pointers, and fails when
the map's **Depends on** column does not match them.

---

## The plan names the modules

Before any code is written, every story in a plan carries four lines, written after reading the
architecture map and the Interface blocks of the modules involved:

```
**Modules touched:** <modules>
**Interface changes:** <module — what changes>   or "none"
**New dependencies:** <module → module; new packages>   or "none"
**Never-breaks at risk:** <promise (ADR) — why it must change>   or "none"
```

"none" is written out; a blank line is rejected. Anything other than "none" is shown at the plan gate
as its own item. A build that touches a module the plan does not list is flagged.

## Interface first

When **Interface changes** is not "none":

1. The plan shows the exact before → after of that module's `## Interface` block — the contract text
   itself, not a summary — and the person approves it at the plan gate. There is no second gate.
2. An interface change is always something to ask, so the plan gate never approves itself over one,
   `--autonomous` included.
3. The approved Interface edit is written first in the story, before its tests and code, and the code
   must match it. A builder that finds the approved interface cannot work stops and asks; it never
   changes the contract on its own (a **scope change** pause, `rules/autonomous-mode.md`).

## What a builder is given

Every build agent already starts fresh for each job. Its brief also carries:

1. the path of `CONTEXT.md` (the architecture map);
2. the `## Interface` block of every module the story touches, and of every module those depend on or
   are used by.

It reads and edits the insides of the touched modules only, and uses every other module through its
Interface. When it needs another module's insides, it says so in its report
(`STATUS: DONE_WITH_CONCERNS`, naming the module and what was missing): that Interface is incomplete.
A story that touches more than three modules is flagged at the plan gate as one that probably should be
split.

---

## Docs stay current

Before the PR opens, the pre-PR step checks whether the change left the architecture map or an
Interface block out of date — a new module with no row, a job that moved between modules, an output
nobody listed, a builder's report that it needed another module's insides — and fixes it in the same
PR (or registers a tracker item when the fix is out of scope, `rules/deferrals.md`). The review's
"what did this change make false?" check searches Interface blocks as well. The **Depends on** column
is kept right by the boundary check.

---

## The locality test

> An agent can change one module safely by reading only that module plus the interfaces of the
> modules it uses and the modules that use it.

This is the definition of a good boundary. If a safe change needs a search of the whole repo, the
boundary is the problem, not the agent. A review of a harness change asks: **does this change still
pass the locality test?**

A rule written in a doc does not stop a boundary from being crossed. Where the harness can check a
boundary automatically, it does.

---

## The boundary check

`scripts/__tests__/boundaries-*.test.js` runs inside `npm test`, so CI fails a PR that crosses a boundary. It checks:

1. **Code imports** — a JS file imports from another module only what that module's Interface lists (a code module's README, a skill's `SKILL.md`).
2. **File pointers** — a skill, agent or rule names another module's main file (`SKILL.md`, the agent's
   `.md`, the `README.md`); a deeper file only when that module's Interface lists it.
3. **Agent owners** — a skill uses only its own agents and `shared` ones.
4. **Interface blocks and shape** — every skill and agent has an Interface block, and every module has
   the standard shape.
5. **Tests** — a test file reads only what *Tests check the interface* allows.
6. **The map** — the `CONTEXT.md` architecture map's **Depends on** column matches the real
   dependencies.
7. **Decisions** — every ADR cited in an Interface block exists and is not superseded, and every ADR
   has a `Modules:` line.

A pointer to a heading written as a path followed by a quoted heading must name `"Interface"`. Free
wording can slip past the check; the architect reviewer remains the backstop for what it cannot see.

### What runs today

Every item above is enforced: `npm test` runs all seven. Their limits are listed after this paragraph. It checks agent owners, and that a skill launching an agent owns it or it is shared (item 3); every skill's
and agent's Interface block with its four parts; file pointers (item 2): a skill file another module points
at is listed in its Callable parts, a path into a code module or an agent is a main file or one its
Interface lists, and a path to a main file followed by a quoted or bold heading names `"Interface"`;
each code module's `README.md`; every non-test `.js` file's relative imports into another module,
against that module's Interface (a code module's `README.md`, a skill's `SKILL.md`) (item 1); the ADR `Modules:`
lines and the ADRs cited in Interface blocks (item 7); and the architecture map's rows, kinds, private
agents and links; the standard folder shape (item 4): every skill, agent and code module holds only
the entries its shape allows; and the map's **Depends on** column (item 6) against imports, pointers, agent
use and skill invocation; and test locality (item 5): every test reads only its own module, `rules/`, files of no module
and other modules' Interface blocks (`interfaceOf`); only the boundary family's own files (the carve-out above) read module bodies. The plan lines, the builder's brief and
the pre-PR docs check are carried out by the build skills (F3, #6j2mgjwMgrvf3fwR), not by `npm test`.

What the checks do not see, one sentence each:

- Check 6 reads only JS requires and Markdown file pointers: not shell or PowerShell scripts, not a folder
  linked by a literal path (`dogfood-links.js`), and not a code module's Markdown.
- Check 5 does not see a read made by a child process.
- The pointer scan skips Markdown files over 2 MB.

The boundary check lives in `scripts/__tests__/boundaries-*.test.js` (one file per check family), which
`npm test` runs.

---

## One-line pattern for skills

> Use another module only through its interface (`rules/modules.md`); never import, call or point at
> anything inside it that its interface does not name.
