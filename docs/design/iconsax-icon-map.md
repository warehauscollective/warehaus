# Iconsax icon map

Milestone "Iconsax icons across the Portal", task 03. Done 2026-11-26 in the Figma file Warehaus Studio (`TS3DcaCgrIdYf0jhvnMy3k`), page Portal - Component Library, section Atoms.

This is the map from every icon in `docs/design/icon-inventory.md` to its name in the one Icon set. Tasks 04 (Figma swaps) and 05 to 06 (code) work from it.

## Style

- **Linear** everywhere. One stroke style, no fills.
- **Bold** only for the active nav tab: Element3, Kanban, BookSaved, Activity, Profile.
- Drawn on a 16 box with a 1px stroke and round caps. That is the Iconsax 24 grid with its 1.5 stroke, scaled by two thirds.
- Colour is bound to `portal/muted` (Portal/Semantic), so every icon follows Dark and Light from its parent frame. No mode is locked on the set.
- Names are the `iconsax-reactjs` export names, so Figma `Name=TickCircle` is `<TickCircle />` in code.

## The set

`Atom/Icon` ([`281:7631`](https://www.figma.com/design/TS3DcaCgrIdYf0jhvnMy3k/Warehaus-Studio?node-id=281-7631)), properties `Name` and `Style`. It now holds 62 variants: 57 Linear and 5 Bold.

Changed in this task:

- 24 Linear variants added (table below). The 38 existing variants were not touched, so no instance changed on any screen.
- The set description names the style rules and points here.
- One line added to the Atoms Changelog (`1245:8203`).
- Nothing was moved, archived or published, so `docs/design/figma-id-map.md` has no new rows.

The 24 new variants are drawn from the Linear paths in `iconsax-reactjs` 0.0.8, the package the code will use, so Figma and code show the same drawing. All are in the free set. No icon file was added to the repo.

| Name | Variant | Why it is in the set |
|---|---|---|
| Buildings2 | `1297:9231` | Lucide `Building2` |
| CloseCircle | `1297:9234` | In the approved 40 names |
| InfoCircle | `1297:9238` | Lucide `AlertCircle`, modal header glyph |
| Logout | `1297:9241` | Lucide `LogOut` |
| RecordCircle | `1297:9245` | Lucide `Circle`, `Atom/Invites/Icon/circle` |
| Shield | `1297:9248` | Lucide `Shield` |
| ShieldTick | `1297:9252` | Lucide `ShieldCheck`, `Atom/Invites/Icon/shield` |
| Sms | `1297:9256` | Lucide `Mail`, `Atom/Invites/Icon/mail` |
| TickCircle | `1297:9260` | Lucide `CircleCheck`, `Atom/Invites/Icon/checkCircle` |
| Global | `1297:9265` | `Atom/Links/Icon/globe` |
| Cloud | `1297:9269` | `Atom/Links/Icon/staging` |
| Monitor | `1297:9272` | `Atom/Links/Icon/preview`, the preview link mark on the milestone tile |
| Brush2 | `1297:9276` | `Atom/Links/Icon/design` |
| Code | `1297:9280` | `Atom/Links/Icon/repo` |
| Setting2 | `1297:9284` | `Atom/Links/Icon/admin` |
| Category | `1297:9287` | `Atom/Links/Icon/other` |
| Edit2 | `1297:9291` | `Atom/Links/Icon/edit` |
| UserAdd | `1297:9295` | `Atom/Invites/Icon/userPlus` |
| Profile2User | `1297:9298` | `Atom/Invites/Icon/switchUser` |
| Sun1 | `1297:9302` | Light theme mark in `account/ThemeControl.tsx` |
| Moon | `1297:9305` | Dark theme mark in `account/ThemeControl.tsx` |
| Play | `1297:9308` | `milestone-play.svg` |
| ArrowUp2 | `1297:9311` | Move task up (`↑`) |
| Figma | `1297:9314` | The Figma link mark on the milestone tile |

Already in the set before this task (Linear): Profile, ArrowRight2, Add, SearchNormal, ExportSquare, Lock, DocumentText, Notification, Check, Warning2, Refresh, Filter, HamburgerMenu, Kanban, Task, Element3, Layer, Gps, Data, Eye, People, Building, Clock, Link, Microphone, EyeSlash, Calendar, More, X, ArrowDown2, ArrowLeft2, BookSaved, Activity.

All 40 names in the approved mapping are now in the set.

## Figma: old icon families to `Atom/Icon`

The two domain families already use Iconsax drawings. They move to the one set by name. Task 04 swaps the instances and archives the old components.

| Old component | `Atom/Icon` Name |
|---|---|
| `Atom/Links/Icon/globe` | Global |
| `Atom/Links/Icon/staging` | Cloud |
| `Atom/Links/Icon/preview` | Monitor |
| `Atom/Links/Icon/design` | Brush2 |
| `Atom/Links/Icon/repo` | Code |
| `Atom/Links/Icon/docs` | DocumentText |
| `Atom/Links/Icon/admin` | Setting2 |
| `Atom/Links/Icon/other` | Category |
| `Atom/Links/Icon/open` | ExportSquare |
| `Atom/Links/Icon/lock` | Lock |
| `Atom/Links/Icon/plus` | Add |
| `Atom/Links/Icon/grip` | No match, see Flags |
| `Atom/Links/Icon/edit` | Edit2 |
| `Atom/Links/Icon/close` | X (Lucide fallback) |
| `Atom/Links/Icon/chevron` | ArrowDown2 |
| `Atom/Links/Icon/check` | Check (Lucide fallback) |
| `Atom/Invites/Icon/mail` | Sms |
| `Atom/Invites/Icon/clock` | Clock |
| `Atom/Invites/Icon/alert` | Warning2 |
| `Atom/Invites/Icon/checkCircle` | TickCircle |
| `Atom/Invites/Icon/userPlus` | UserAdd |
| `Atom/Invites/Icon/resend` | Refresh |
| `Atom/Invites/Icon/switchUser` | Profile2User |
| `Atom/Invites/Icon/circle` | RecordCircle |
| `Atom/Invites/Icon/shield` | ShieldTick |

`Atom/Icon/Spinner` (`788:5280`) stays its own atom. It is a loading mark drawn with a CSS border in code, not a picture from an icon set.

## Code: current icons to `Atom/Icon`

Lucide:

| Lucide | Name |
|---|---|
| `LayoutDashboard` | Element3 (nav) |
| `FolderKanban` | Kanban (nav) |
| `Library` | BookSaved (nav) |
| `Activity` | Activity (nav) |
| `UserRound` | Profile (nav) |
| `ChevronRight` | ArrowRight2 |
| `ChevronDown` | ArrowDown2 |
| `Lock` | Lock |
| `AlertTriangle` | Warning2 |
| `AlertCircle` | InfoCircle |
| `Check` | Check (stays Lucide) |
| `X` | X (stays Lucide) |
| `CircleCheck` | TickCircle |
| `Circle` | RecordCircle |
| `Clock` | Clock |
| `LogOut` | Logout |
| `Mail` | Sms |
| `ShieldCheck` | ShieldTick |
| `Shield` | Shield |
| `MoreHorizontal` | More |
| `Plus` | Add |
| `Search` | SearchNormal |
| `Building2` | Buildings2 |
| `ExternalLink` | ExportSquare |
| `Eye` | Eye |
| `EyeOff` | EyeSlash |

Files in `apps/portal/public/icons/`:

| File | Name |
|---|---|
| `activity-person.svg` | Profile |
| `activity-row.svg` | Clock |
| `client-chev.svg`, `docs-chev.svg`, `item-chev.svg` | ArrowRight2 |
| `dock-projects.svg` | Kanban (nav) |
| `dock-resources.svg` | BookSaved (nav) |
| `dock-activity.svg` | Activity (nav) |
| `dock-account.svg` | Profile (nav) |
| `dock-menu.svg`, `sidebar-menu.svg` | HamburgerMenu |
| `docs-alert.svg` | Warning2 |
| `docs-check.svg` | Check (Lucide) |
| `docs-doc.svg`, `resource-doc.svg` | DocumentText |
| `links-lock.svg`, `task-lock.svg` | Lock |
| `menu-arrow.svg` | ArrowRight2 |
| `milestone-play.svg` | Play, see Flags |
| `nav-back.svg` | ArrowLeft2 |
| `resource-link.svg`, `task-link.svg` | Link |
| `resource-mic.svg` | Microphone |
| `resource-search.svg` | SearchNormal |
| `task-building.svg` | Building |
| `task-calendar.svg` | Calendar |
| `task-chev-down.svg` | ArrowDown2 |
| `task-layers.svg` | Layer |
| `task-list.svg`, `item-empty.svg` | Task |
| `team-empty.svg` | People |

Search results in `search/PortalSearch.tsx` reuse the dock files for a resource (`dock-resources.svg`) and an activity row (`dock-activity.svg`). Those two places take BookSaved and Activity with the dock.

Inline SVG:

| Component | Name |
|---|---|
| `HeaderGlyph` (`ui/PortalModal.tsx`) | Check (Lucide), InfoCircle |
| `StatusBadge`, scope select chevron | ArrowDown2 |
| `ItemEmptyIcon` | Task |
| `ItemChevronIcon` | ArrowRight2 |
| `WarningTriangle` (two files), `WarningMark`, `ClearAlertIcon`, `AlertIcon` | Warning2 |
| `DashboardGlyph`, `GridGlyph` | Element3 |
| Bell in `MobileMenu.tsx`, `NoticeBell` | Notification |
| `TileLinkIcon` preview | Monitor |
| `TileLinkIcon` figma | Figma |
| Approved line tick, `CheckIcon`, `StyledCheckbox` tick | Check (Lucide) |
| `ClockIcon` | Clock |
| `ExternalLinkIcon` | ExportSquare |
| `Dots` | More |
| `CloseGlyph` | X (Lucide) |
| `ThemeIcon` dark | Moon |
| `ThemeIcon` light | Sun1 |

Text characters:

| Character | Name |
|---|---|
| `✕`, `×` | X (Lucide) |
| `‹` | ArrowLeft2 |
| `›` | ArrowRight2 |
| `↑` | ArrowUp2 |
| `↓` | ArrowDown2 |
| `↑↓` keyboard hint | Stays text. It is copy in a hint, not a control. |

Not icons, so not in the set: the state marks listed in the inventory (`StateGlyph`, `StatusDot`, `RunnerDotGlyph`, `ItemStageIcon`, the stage ring files, the dot files, the task circles). Figma keeps them as `Atom/Badge/Stage`, `Atom/Indicator/Published` and `Atom/Checkbox`. The spinners and the logo stay as they are.

## Flags

Icons with no good Iconsax match, or where a choice needs a second look.

1. **Bare tick and bare X.** Iconsax has neither. Lucide `Check` and `X` stay, as Peter decided on 2026-11-25. They are the only two non-Iconsax variants in the set.
2. **Grip (`Atom/Links/Icon/grip`, six dots).** No Iconsax match. Iconsax `Menu` is four circles and reads as an app grid. The grip has no instance in the library or on a screen, and code has no grip. Proposed: archive it in task 04 and do not add a variant. If a drag handle is needed later, take it from Lucide (`GripVertical`).
3. **Play.** Linear `Play` is an outlined rounded triangle. Today the play button uses a filled 10px triangle. An outline at 10px may read weakly. Check it on the milestone status control in task 04. If it does, the fix is a `Play` Bold variant, which would be a sixth Bold icon and so needs Peter's yes.
4. **RecordCircle for an unmet password rule.** It is a ring with a second ring inside, not an empty circle. Figma already draws it this way (`Atom/Invites/Icon/circle`); code today shows Lucide's empty `Circle`. The approved mapping is RecordCircle, so the build follows Figma.
5. **Switch account.** Figma (`Atom/Invites/Icon/switchUser`) shows two people, Profile2User. Code (`auth/AcceptInvite.tsx`) shows Lucide `LogOut`, mapped to Logout. Both names are in the set. Figma and code differ here today; the build should follow the frame unless Peter says otherwise.
6. **Figma link mark.** Code draws four frame corners. The set uses the Iconsax `Figma` logo, the only brand mark in the set.
7. **Drawing source for the 33 older Linear variants.** They were placed before this task. On a contact sheet they match the new package-drawn variants in weight and style in Dark and Light, but they were not compared path by path with `iconsax-reactjs` (open point 1 in `docs/design/iconsax-package-and-license.md`). Visual QA in task 07 will show any that differ.
8. **Unused variants.** `Gps` is on no screen and `Data` is on one. They stay in the set because they are in the approved 40 names.

## Checked

- Every variant is 16×16 with one visible `_iconsax` frame inside. The older variants also keep their hidden `_old` layers from before the Iconsax redraw.
- Every visible stroke and fill in all 62 variants is bound to `portal/muted`.
- All 62 variants were rendered on `portal/bg` in the Dark mode and the Light mode and read correctly in both.
