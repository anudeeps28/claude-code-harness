# Harness UI — handoff for Claude Code

Everything needed to build the harness's front end, as designed in the "Harness UI — Directions" canvas (prototype E).

| File | What it is |
|---|---|
| `DESIGN.md` | The spec: principles, status language, every screen, interactions, behavior rules |
| `tokens.css` | Colors (dark/light × modern/soft), type, motion, animations. Use as-is |
| `DATA.md` | Which harness files feed which part of the UI, and what the harness needs to add |
| `prototype/Prototype.dc.html` | Source of the clickable prototype. Read it for layout, copy, states and behavior (the simulation in its script shows exactly how runs, slots and the queue behave). It's in a canvas template format: don't copy it as code |
| `PROMPT.md` | A prompt to paste into Claude Code to start the build |

## How to use

1. Copy this folder into the harness repo, e.g. `claude-code-harness/docs/ui-design/`.
2. Open Claude Code in the repo.
3. Paste the prompt from `PROMPT.md`.

Tip: keep the canvas open next to the terminal. It's the living reference, and you can click through it.
