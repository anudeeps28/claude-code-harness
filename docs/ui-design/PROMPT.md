# Prompt for Claude Code

Paste everything below the line into Claude Code, from the harness repo root.

---

The design for the harness app has a second round. It's in `docs/ui-design/` (version 2, 2026-11-13):

- `DESIGN.md`: the spec for every screen and interaction. Follow it closely, including the copy. §9 lists what changed since version 1.
- `tokens.css`: every color, font and animation comes from here. No hard-coded hex values in components.
- `DATA.md`: which harness files feed each part of the UI, and what the harness and the Electron app need to add (§3 is new).
- `prototype/Prototype.dc.html`: a clickable prototype in a canvas template format. Its script simulates the behaviour exactly. Use it as the reference for layout, states and behaviour, not as code to copy.

The app is Electron, on Mac and Windows. Read all four files first. Then, before writing any code:

1. Check `DATA.md` against the real repo and against what we decided in our planning session on 2026-11-13. Tell me anything that's wrong, missing, or decided differently.
2. Update the architecture for version 2: the Electron main process (scheduler, watchers, PR watcher, updater, Claude sessions for runs, planning and side chat) and the renderer. Push back if you see a better option.
3. For each NEW item in `DATA.md` §2–§3, give me options with trade-offs and a recommendation. Don't decide for me.
4. Re-plan the build as Features and stories in this harness's own format (`/plan-features`), keeping what's already built. Suggested order:
   1. Shell, project rail (Mac/PC wording), Board, Focus, feature run (Session, Changes, Plan), reading real `tasks/` files.
   2. Live updates (dots, bars, cards moving, events); Pause / Stop now / Park; merge-based queue.
   3. Answer detail panel and questions everywhere; plan gate with Accept all recommended.
   4. Messages to the run with read receipts; side chat.
   5. New feature planning view (grilling, map, proposal, Create these).
   6. Dig deeper with review size, re-checks, saved-to-GitHub marks and proof.
   7. New project, house rules, branding offer, update notice, Settings.
   8. ⌘K / Ctrl K, Vision & roadmap with maps, Completed with proof records and follow-ups.

Stop after step 4 and wait for my go.

Rules for the build:
- Both themes and both tones from `tokens.css` must work. Default: dark, modern.
- Only the orchestrator takes instructions. Sub-agents are view-only. Side chat is read-only and only drafts instructions for me to send.
- No modals except the ⌘K bar and the Dig deeper drawer. The planning view and New project are full pages.
- No "Open in VS Code" or any editor dependency.
- Motion only where `DESIGN.md` §7 says, and respect `prefers-reduced-motion`.
- Accessibility floor in `DESIGN.md` §8.
- Nothing is created in the tracker or `tasks/features/` before **Create these**, and nothing is built before **Approve and build**.
- The app never sends repo contents anywhere except the Claude sessions it starts.
