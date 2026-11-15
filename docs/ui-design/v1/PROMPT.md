# Prompt for Claude Code

Paste everything below the line into Claude Code, from the harness repo root.

---

I want to build a front end for this harness. The design is finished and lives in `docs/ui-design/`:

- `DESIGN.md`: the spec for every screen and interaction. Follow it closely, including the copy.
- `tokens.css`: use these tokens for every color, font and animation. No hard-coded hex values in components.
- `DATA.md`: which harness files feed which part of the UI, and what the harness doesn't record yet.
- `prototype/Prototype.dc.html`: a clickable prototype in a canvas template format. Use it as the reference for layout, states and behavior, not as code to copy.

Read all four first. Then, before writing any code:

1. Check `DATA.md` against the real repo (feature-state.js, progress.js, phase-markers.md, the implement skill) and tell me anything that's wrong or missing.
2. Propose the architecture. Keep the harness runtime zero-dependency, so the UI goes in its own folder (`ui/`) with a local Node server that reads and watches `tasks/` and serves JSON + SSE, plus a React + Vite + TypeScript front end. Push back if you see a better option.
3. For each NEW item in `DATA.md` (slots/queue scheduler, cross-feature dependencies, per-step log, chat with the orchestrator, questions file, PR watcher, pause/park), give me options with trade-offs and a recommendation. Don't decide for me.
4. Break the build into Features and stories in this harness's own format (`/plan-features`), in this order:
   1. Read-only: shell, project rail, Board, feature run screen (Session, Changes, Plan tabs), from real `tasks/` files.
   2. Live updates over SSE (dots, story bars, cards moving between columns, event feed).
   3. Dig deeper drawer (needs the per-step log).
   4. Acting from the UI: answer questions, plan gate (comments, approve), pause/resume/park, chat with the orchestrator.
   5. Slots and queue scheduler, PR watcher, Completed.
   6. ⌘K command bar, Focus view, Vision & roadmap, New feature.

Stop after step 4 and wait for my go.

Rules for the build:
- Both themes and both tones from `tokens.css` must work. Default: dark, modern.
- Only the orchestrator can be messaged. Sub-agents are view-only.
- No "Open in VS Code" or any editor dependency.
- Motion only where `DESIGN.md` says. Respect `prefers-reduced-motion`.
- Accessibility floor in `DESIGN.md` §6.
- The server binds to 127.0.0.1 only and never sends repo contents anywhere.
