# Figma protocol: atomic components, few screens

How Warehaus Studio is laid out and how designs change in it. Settled with Peter on 2026-11-25 (ADR-0006). Tracked in the Portal milestone "Figma atomic protocol".

The file is [Warehaus Studio](https://www.figma.com/design/TS3DcaCgrIdYf0jhvnMy3k/Warehaus-Studio) (file key `TS3DcaCgrIdYf0jhvnMy3k`). The page table is in `AGENTS.md`, "Design source". This doc is the source of truth. The rules frame on the Component Library page (`713:2396`) is a short mirror of it; when they differ, this doc wins and the frame is fixed.

## The idea

Components carry the states. Screens stay few.

A screen shows one view in its normal, populated state. Every other look (hover, loading, empty, error, a menu open, a status) is a variant of a component. To check a state on a screen, swap the variant on the instance. Nobody draws a screen per state.

## Atomic tiers

| Tier | What it is | Where it lives | Examples |
|---|---|---|---|
| Tokens | Colour, type, spacing, radius. Figma variables and text styles, not frames. | Variables panel; documented in `00 Foundations` | `portal/bg`, `portal/fg`, `Live/Portal/*` |
| Atoms | One element that cannot be split further. | Library, `Atoms` section | Button, Icon, Chip, Avatar, Input |
| Molecules | A few atoms that work as one unit. | Library, `Molecules` section | Field (label, input, helper), Menu item, Row link |
| Organisms | A self-contained region of a screen. | Library `Organisms` section, or a page's `Local components` | Milestone panel, Task card, Runner status modal, Header |
| Screens | One view of a route, built only from instances. | The tab's page, one section per screen | Projects / Milestone page |

There is no Templates tier. With one canonical screen per view, the screen does that job.

Atoms and molecules always live in the library. An organism used by one tab only lives in that page's `Local components` section. The second time another tab needs it, it moves to the library (move, never copy).

## Page layout

### Component Library page (`151:5387`)

Top to bottom:

1. `00 Foundations`: the rules frame (`713:2396`), token swatches and type ramp.
2. `Atoms`
3. `Molecules`
4. `Organisms`

Nothing sits loose on the page. Every node is inside a section.

### Tab pages (Dashboard, Projects, Resources, Activity, Account)

Top to bottom:

1. One section per screen, named `<ID> · <Screen>` (see Naming).
2. `Local components`: organisms only this tab uses.
3. `Exploration`: temporary options and proposals. Empty when nothing is open.

Each screen section has two rows:

- **SCREEN**: the screen's 4 frames (see Screen budget).
- **OVERLAYS**: modals, sheets and menus that open from this screen. An overlay frame holds only the overlay: no page behind it, no scrim. Prototype links use Open overlay and Swap overlay.

Notes go in the section's description, or one Note frame at the end of the SCREEN row. There is no STATES row; states are variants.

## Screen budget

Every screen is Dark and Light at 1440 and 390, but only two frames are built by hand:

| Frame | How it is made |
|---|---|
| 1440 Dark | Hand built, then made a component. |
| 390 Dark | Hand built, then made a component. Layout differs from 1440, so it is its own frame. |
| 1440 Light | An instance of the 1440 Dark component, with the variable mode set to Light. |
| 390 Light | An instance of the 390 Dark component, with the variable mode set to Light. |

Edit only the Dark components. The Light instances follow. Never detach a Light instance.

Turn an existing frame into a component in place (Create component on the frame). That keeps its node ID, so links in tasks and ADRs still work.

### What earns its own screen

- One screen per route or view, in its default populated state.
- A page-level state (an empty project list, first run, a whole-page error) gets its own screen only when the layout changes structurally. If the same layout holds, it is a variant of the content region.
- A component state never gets a screen. Hover, focus, loading, error, an open menu, a status: these are variants.

Example: the milestone page used to have about 112 screens, one per state × Dark/Light × 1440/390. Under this protocol it is one screen (4 frames). Planning generating, drafted, empty and failed, and Building in progress and blocked, are `State` values on `Organism/Milestone panel`.

## Component sets

- A component with more than one look is a component set.
- Properties, in this order: `Variant`, `Size`, `State`, then booleans and instance-swap properties for slots.
- Property names and values are Title Case: `State=Loading`, not `state=loading`.
- `State` covers Default, Hover, Focus and Disabled, plus Loading, Empty and Error where they apply.
- Lay the set out as a grid with a label row and column, so every combination is visible at a glance.
- No Theme or Mode property. Dark and Light come from variable modes.
- Names and property names match the React component and its props or `cva` variants in `apps/portal`. Code Connect mapping is a later milestone.
- A set is never a whole screen. A screen-sized overlay belongs in the page's OVERLAYS row, built from organisms.
- Every component has a short description: when to use it, and the code component it maps to.
- One Icon set for the whole file. No domain icon families (such as `Links/Icon` or `Invites/Icon`).

## Screens use instances

Canonical screens are built from library and local instances. No raw frame stands in for a component, and no instance is detached. If a screen needs something the library does not have, add it to the right tier first, then use it.

Archived frames are left as they are.

## Iterating

- Change the canonical screen or the component in place. Never copy a screen to make "v2".
- After each iteration, save a named Figma version: `<Milestone> - iter <N>`, for example `Runner on production - iter 2`. Version history is where old iterations live.
- Side-by-side options are allowed only in the page's `Exploration` section. Once Peter picks one, it is applied to the canonical screen or component and the Exploration frames are moved to Archive.
- A proposal waiting on Peter sits in `Exploration`, not next to the current screens.

## Archive

- Move, never copy. Hide or archive, never delete.
- Retired sections, replaced frames and anything named "(was …)", "v1", "retired" or "· viewport" go to an Archive page.
- Nobody builds from Archive.
- Every move is recorded in `docs/design/figma-id-map.md`.

## Naming

| Thing | Pattern | Example |
|---|---|---|
| Screen section | `<page letter><2 digits> · <Screen>` | `P07 · Milestone page` |
| Screen frame | `<Tab> / <View> - <1440 or 390> <Dark or Light>` | `Projects / Milestone page - 390 Light` |
| Overlay frame | `<Tab> / <View> / <Overlay> - <width> <mode>` | `Projects / Project page / Runner status - 1440 Dark` |
| Component | `<Tier>/<Name>` | `Atom/Button`, `Organism/Runner status chip` |

- Page letters: D Dashboard, P Projects, R Resources, V Activity, A Account. Numbered from 01 on each page.
- While a section is being renumbered, its old ID goes in the section description for one milestone, then is dropped.
- No em-dashes, no "v2", "final", "new", dates or "(proposal)" in names. Status lives in the section description or the Portal, not the name.
- No hand-drawn label text that repeats a frame name. The frame name is the label.

## Approval

A design task's approval request links to:

1. the component set or sets that changed, in their library or Local components section, and
2. the one canonical screen that uses them (the 1440 Dark frame; the others follow).

Peter never gets a deck of state screens. For a cleanup or restructure task, the request also carries before and after screenshots of the page. Peter approves in Grok Bot or the Portal, as the Milestone Build Protocol in `AGENTS.md` says.

## Agents working in the file

- Read this doc and the page's sections before editing.
- Product Design Lead checks the build against the canonical screen, swapping variants for the states the task touches.
- Do not start a new page or a new file, do not publish the library, and do not detach instances.
- Update `docs/design/figma-id-map.md` in the same pull request as any move or renumber.
