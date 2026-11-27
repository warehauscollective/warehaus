# ADR-0006: Figma is organised atomically, with few screens

Status: Accepted, Peter, 2026-11-25. Peter answered "Yes to all" to two grilling rounds (Q1 to Q21) in a Claude Code session. The work is tracked in the Portal milestone "Figma atomic protocol", renamed from "Figma library cleanup". The full rules are in `docs/design/figma-protocol.md`.

## Context

Warehaus Studio had grown to more than 500 frames at 1440 and 390 on the Projects page alone. The project page section held 143 screens and the milestone page section 112. Most of that came from drawing one full screen per state, in Dark and Light at 1440 and 390, so each new state cost 4 frames. Old copies ("(was …)", "v1", retired sections) and dated proposals sat beside current screens. Only about 7 to 25 percent of the layers in screen frames were instances, so swapping a variant to check a state was not possible.

The library held about 700 components in about 60 sets, grouped by feature (Forms, Auth, Cards & rows) rather than by size. Property names were mixed case (`state` and `State`), some sets were whole screens, and some icon families duplicated the shared Icon set.

The in-file rules (frame `713:2396`) already said "each screen exists once" and "screens use instances only", but they asked for a STATES row per screen, which in practice became more screens.

## Decision

1. **Atomic tiers.** Tokens (variables), then Atoms, Molecules and Organisms. No Templates tier.
2. **Components carry the states.** A component state is a variant in its component set and never gets its own screen. A page-level state gets a screen only when the layout changes structurally.
3. **Two hand-built frames per screen.** 1440 Dark and 390 Dark are made components. 1440 Light and 390 Light are instances of them with the Light variable mode. Peter still sees Dark and Light at 1440 and 390.
4. **Page layout.** Library: Foundations, Atoms, Molecules, Organisms. Tab pages: one section per screen (SCREEN and OVERLAYS rows), then Local components, then Exploration. The STATES row is dropped.
5. **Local before shared.** An organism used by one tab lives in that page's Local components. It moves to the library when a second tab needs it.
6. **Iterate in place.** Edit the canonical screen, add a Changelog line, and keep options only in Exploration. (Amended 2026-11-26: no named Figma version is saved per iteration. See Amendments.)
7. **Archive, never delete.** Old frames move to Archive. Moves and renumbers are recorded in `docs/design/figma-id-map.md`.
8. **Approval.** Peter approves a design from the changed component sets plus the one canonical screen, not from a deck of state screens.

## Considered options

- **Keep the STATES row and draw states as frames.** Rejected: it is how the file reached 112 screens for one page, and each state still cost 4 frames.
- **Four hand-built frames per screen.** Rejected: Dark and Light already run on `portal/*` variable modes, so a Light instance stays in sync for free. Hand-built Light frames drift.
- **Every organism in the library.** Rejected: the library fills with one-off regions. Promotion on second use keeps it to what is shared.
- **Feature grouping in the library (as now).** Rejected: it hides reuse. A Chip inside "Review & approve" is not found by the next screen that needs a chip.
- **A Templates tier.** Rejected: with one canonical screen per view, a template would duplicate the screen.

## Consequences

- The existing rules frame `713:2396` is rewritten as a short mirror of `docs/design/figma-protocol.md`. The repo doc is the source of truth. The frame's existing overlay prototype settings, changelog and lock line, and A1 modal rules carry over into the doc unchanged.
- `AGENTS.md`, `CLAUDE.md` and `.cursor/rules/milestone-build-protocol.mdc` keep "Dark and Light at 1440 and 390" and add that two of the four frames are Light instances.
- AGENTS.md's "add a state beside the frame it belongs to" is replaced: a state is added as a variant on the component.
- Migration runs page by page in the milestone: library first, then Projects, Account, and Dashboard, Activity and Resources. Peter approves each page from before and after screenshots.
- Canonical screens are rebuilt from instances as each page is migrated. Archived frames are left as they are.
- Section IDs become page letter plus 2 digits (D, P, R, V, A). Clients moves from "13" to A04.
- Code Connect mapping of variant properties to React props is a later milestone.

## Amendments

- 2026-11-26, Peter, in a Claude Code session: drop saving a named Figma version (`<Milestone> - iter <N>`) when a design is approved. The Changelog, the Archive section and Figma's automatic version history are enough.
