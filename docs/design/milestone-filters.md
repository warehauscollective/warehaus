# Milestone filters on the project page

Design record for the Portal milestone "Project Page Milestone Filters", tasks 01 and 02. Drawn in Warehaus Studio (file key `TS3DcaCgrIdYf0jhvnMy3k`), page Portal - Projects (`689:31057`), section P02 · Project page (`689:50377`), on 2026-11-28. Rules: `docs/design/figma-protocol.md`.

The filter row sits at the top of the Milestones tab, between the Need a milestone banner and the milestone groups. It follows the project list's filter pattern (`ProjectListFilterMenu.tsx`) and uses the same library molecules, so the two lists match.

## Where to look

| What | Node |
|---|---|
| Canonical screen, 1440 Dark | `1166:13111` (Light `1166:13112`) |
| Canonical screen, 390 Dark | `1166:13344` (Light `1166:13345`) |
| Menu overlay, 1440 Dark | `1344:24858` (Light `1344:24949`) |
| Menu overlay (bottom sheet), 390 Dark | `1344:25128` (Light `1344:25227`) |
| Client menu overlay, 1440 Dark | `1345:25360` (Light `1345:25522`) |
| Client menu overlay (bottom sheet), 390 Dark | `1345:25595` (Light `1345:25773`) |
| Note with the rules and copy | `1344:25432` |

The Light frames are instances of the Dark components on the Light variable mode. Nothing Light is hand built.

Screenshots, in `screenshots/`:

- Staff screen: `milestone-filters-1440-dark.png`, `milestone-filters-1440-light.png`, `milestone-filters-390-dark.png`, `milestone-filters-390-light.png`.
- Client menu: `milestone-filters-client-menu-1440-dark.png`, `milestone-filters-client-menu-1440-light.png`, `milestone-filters-client-menu-390-dark.png`, `milestone-filters-client-menu-390-light.png`.

## Component sets

New, in Projects / Local components:

- `Organism/MilestoneFilterBar` (`1342:26322`). `Size` 1440, 390. `Role` staff, client. `State` closed, open, applied. Boolean `Archived chip` (staff variants only).
- `Organism/MilestoneFilterMenu` (`1342:26171`). `Size` 1440 (popover, 320 wide), 390 (bottom sheet). `Role` staff, client. `State` empty, set.

Changed:

- `Organism/Milestones` (`1164:29813`). The filter row is in every variant. The list variants now show the group labels the built page already has. New `State` values: `filtered` (list and board, 1440 and 390) and `filtered-empty` (list, 1440 and 390). In `State=archived` the old loose `Filter · Archived` row is hidden and the Archived chip in the filter row is on.

Reused from the library, unchanged: `Molecule/Filter/Trigger` (`1261:8228`), `Molecule/Filter/Value chip` (`1261:8255`), `Molecule/Filter/Section` (`1261:8272`), `Molecule/Filter/Option` (`1261:8195`), `Atom/Chip/Filter` (`281:7653`), `Atom/Button`, `Atom/Icon`.

## Client view

Clients do not receive Approval, Needs you or archived milestones, so their row and menu have no control for them.

- Row: `Organism/MilestoneFilterBar` `Role=client`. The Filters trigger only, with no Archived chip. Applied chips are Status and Type values, then `Clear filters`. Variants: 1440 closed `1345:25232`, open `1345:25243`, applied `1345:25254`; 390 closed `1345:25296`, open `1345:25307`, applied `1345:25318`.
- Menu: `Organism/MilestoneFilterMenu` `Role=client`. Status and Type only. Shown in the client menu overlays above.
- The canonical screen is the staff view. To see the client row on it, set `Role=client` on the filter bar instance. There is no separate client screen.

## States

| State | How to see it |
|---|---|
| Closed | `Organism/MilestoneFilterBar` `State=closed`. This is the canonical screen. |
| Menu open | Bar `State=open`, with the Milestone filters overlay. |
| Filters applied | `Organism/Milestones` `State=filtered` (bar `State=applied`). |
| No matches | `Organism/Milestones` `State=filtered-empty`. |
| Board layout | `Organism/Milestones` `Layout=board`, `State=default` or `filtered`. |

## Copy

Character for character.

Row:

- Trigger: `Filters`, then the count of filters set when it is above zero (for example `2`).
- Chip: `Archived` and its count. Staff only, as today.
- Applied chips: `Status: Building`, `Status: Shipped`, `Type: Design and dev`, `Approval: Unreviewed`, `Needs you: Open Ask on you`. Each has a × that removes that value.
- After the chips: `Clear filters`.

Menu:

- Title: `Filters`. Top right, when a filter is set (1440): `Clear filters`.
- `Status`: `Idea`, `Planning`, `Awaiting Go`, `Building`, `Ready to Ship`, `Shipped`, `Parked`.
- `Type`: `Design`, `Dev`, `Design and dev`.
- `Approval` (staff only): `Unreviewed`, `Approved`, `Changes requested`.
- `Needs you` (staff only): `Open Ask on you`.
- Summary beside each filter: `Any`, the one value picked, or `2 selected`.
- Foot, 1440: `Filters apply as you pick.`
- Sheet, 390: title `Filters`, `Close`, hint `Filters apply as you pick`, buttons `Clear filters` (when a filter is set) and `Done`.

No matches:

- `No milestones match these filters.`
- Button: `Clear filters`.

Group labels (as built): `NEEDS YOUR REVIEW · 1`, `IN PROGRESS · 2`, `Done · 1`.

## Rules

- Every filter is pick-many. A pick applies at once.
- Values inside one filter are OR. Filters are AND.
- The count on the trigger is the number of filters set, not the number of values.
- Type: Design is a milestone with design tasks only, Dev is build tasks only, Design and dev has both.
- Needs you: milestones with an open Ask on the viewer.
- Clients see Status and Type only.
- Archived stays its own chip. It is not a filter value and is not counted.
- A group with no match is hidden. Each label counts matches only.
- The Done group stays collapsed. It opens by itself only when it is the only group with a match.
- Board layout: the same row above the columns, cards filtered, no group labels.
- 1440: popover under the trigger. 390: bottom sheet.

## Open points for the build tasks

- The menu foot does not say filters are saved. Whether the milestone filters persist per person, as the project list's do, is not drawn.
- The Status list for clients is drawn with all seven values. The build should offer only statuses a client can see.
- No prototype link from the trigger to the overlay was added.
- `Organism/Milestones` has no `Role` property. The client row is on the filter bar only; the milestone cards in the set are the staff cards.
