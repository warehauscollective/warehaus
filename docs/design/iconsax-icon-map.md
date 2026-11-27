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

The two domain families already use Iconsax drawings. They move to the one set by name. Task 04 swapped the instances and archived the old components (see "Task 04" below).

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

## Task 04: screens swapped to the set

Done 2026-11-26 in Figma. Nothing was published and no instance was detached. Docs only in the repo.

### Old families

Every instance of `Atom/Links/Icon/*` and `Atom/Invites/Icon/*` outside the Archive pages now points at `Atom/Icon`, by the table above. 76 instances were swapped in place:

| Where | Components or frames | Icons |
|---|---|---|
| Library, Atoms | `Atom/Links/Visibility tag` (`522:6306`), `Atom/Links/Staff only tag` (`516:4880`), `Atom/Invites/Status` (`540:6883`) | Monitor, Lock, Clock, at 12px |
| Library, Molecules | `Molecule/Links/Item` (`516:4919`), `Molecule/Need a milestone` (`1023:6081`), `Molecule/Invites/Password rule` (`540:6986`) | Global, ExportSquare, X, TickCircle, RecordCircle |
| Library, Organisms | `Organism/AuthCard` (`750:4163`), `Organism/InviteForm` (`753:7021`), `Organism/InviteEmail` (`753:2807`) | Lock, X, Sms, Clock, Warning2, TickCircle, Profile2User, ShieldTick |
| Account, Local components | `Organism/Client team` (`1172:9411`) | Lock |
| Dashboard, D02 · Joined as staff | 1440 Dark (`1195:3117`), 390 Dark (`1195:3360`) | TickCircle, ShieldTick at 14px |

- Each instance kept its size. A 12, 14 or 20px icon is the 16px variant scaled, so its stroke scales with it (0.75, 0.875, 1.25), the same as before the swap.
- Every swapped instance used the default `portal/muted`, so no colour override was needed.
- Instances nested inside other components (the tags inside `Molecule/Links/Item` and `Organism/MilestoneListCard`, the status tag in the member row and card, the password rules in `Organism/AuthCard`) follow their component.
- Light frames are instances of the Dark components, so they follow. Checked on D02 390 Light and Project page 390 Light.
- The 25 old components moved to Archive — Portal, section "Library icon families replaced by Atom/Icon" (`1299:32760`). Rows are in `docs/design/figma-id-map.md`. Frames on the Archive pages still point at them and were left as they are.

### Drawings that were not components

A scan of the library and the six Portal pages for small loose vectors and single icon characters found these. Each is now an `Atom/Icon` instance in the same place, size and colour. The old drawing is kept in the layer, hidden and renamed `_old/…`, as the older `Atom/Icon` variants do.

| Component or frame | Was | Now | Count |
|---|---|---|---|
| `Organism/MilestoneListCard` (`770:11999`), Link / Local preview | `Icon / monitor-play`, loose vectors | Monitor, 16px | 22 |
| `Organism/MilestoneListCard` (`770:11999`), Link / Figma | `Icon / frame`, four corners | Figma, 16px | 20 |
| `Organism/MilestoneStatusControl` (`1254:8530`), advance button | `icon/play`, filled triangle, 10px | Play Linear, 10px, `portal/fg` | 8 |
| `Molecule/ValueButton`, hover (`748:10931`) | `Icon · pencil (local)` | Edit2, 16px, `portal/fg` | 1 |
| Account / Your team - 390 Dark (`1182:8862`), Invite button | text `+` | Add, 16px, `portal/accent-fg` | 1 |

The hover state of the two link buttons keeps `portal/fg` (4 instances).

### Changelog lines

Atoms (`1245:8203`), Molecules (`1245:8208`), Organisms (`1245:8213`), Dashboard D02 (`1195:3527`), Account A03 (`1182:8939`), Account Local components (`1183:9944`).

### Left as they are

- `Corner bracket` vectors on cards and section headers. They are decoration, not icons.
- Dots, rings and task circles (`Task · open`, `Read`, `Unread`, published dot). They are state marks, as in "Not icons" above.
- Runner app and Mac app frames on Portal - Projects (P07, P08): window controls and the checklist `Mark / done`. Those are the Mac app, which uses SF Symbols and is outside this milestone.
- Icon characters inside a longer text layer, such as `‹ Projects` on the 390 back link. The scan only matched a text layer that is one character. Code maps `‹` to ArrowLeft2 in task 05 or 06; the frame should be brought in line then or in the task 07 visual check.

### Flags after the swap

- **Play (flag 3).** Linear `Play` at 10px on the advance button reads clearly in Dark and Light, but it is lighter than the filled triangle it replaced. It follows the approved mapping. A Bold `Play` would be a sixth Bold icon and still needs Peter's yes.
- **Grip (flag 2).** Archived with its family. No variant was added.
- **Figma link mark (flag 6).** The tile now shows the Iconsax `Figma` logo in place of the four corners, so the frame already differs from code until the build tasks land.
