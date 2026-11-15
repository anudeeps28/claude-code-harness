# Harness UI — handoff for Claude Code (version 2, 2026-11-13)

Everything needed to build the harness app, as designed in the "Harness UI — Directions" canvas (prototype E, round 2).

| File | What it is |
|---|---|
| `DESIGN.md` | The spec: principles, status language, every screen and interaction, the answer detail panel, behaviour rules, motion, accessibility. §9 lists what changed since version 1 |
| `tokens.css` | Colors (dark/light × modern/soft, unchanged), type, and motion. Round 2 adds motion only: the planning view, side chat, map, proof player, sticky detail column |
| `DATA.md` | Which harness files feed each part of the UI, and what the harness and the Electron app need to add (§3 is new in version 2) |
| `prototype/Prototype.dc.html` | Source of the clickable prototype. Its script simulates runs, slots, the queue, planning, side chat and updates. Read it for layout, copy, states and behaviour. It's a canvas template format: don't copy it as code |
| `PROMPT.md` | The prompt to paste into Claude Code |

## How to use

1. Replace the previous `docs/ui-design/` with this folder.
2. Open Claude Code in the repo.
3. Paste the prompt from `PROMPT.md`.

Keep the canvas open next to the terminal. It's the living reference.
