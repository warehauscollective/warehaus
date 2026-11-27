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

## Task 05: the package and the Icon wrapper

Done 2026-11-26 in code. No screen changed: nothing imports the wrapper yet. Task 06 swaps the icons over.

- `iconsax-reactjs` 0.0.8 is a dependency of `apps/portal`, pinned to the exact version.
- The wrapper is `apps/portal/src/components/ui/Icon.tsx`. It is the only file that imports `iconsax-reactjs`, and a test fails if a second file does. It carries the Iconsax notice.
- `<Icon name="Lock" />`. `name` is the `Atom/Icon` `Name`. The wrapper holds the same 57 names as the set: 55 from Iconsax, plus `Check` and `X` from Lucide, drawn with a 1.5 stroke to match.
- `variant="Bold"` is accepted only for Activity, BookSaved, Element3, Kanban and Profile. Everything else is Linear.
- `size` is a token, not a number. New tokens in `@warehaus/tokens` (`tokens.icon`, `--icon-*` in CSS):

  | `size` | px | Used for |
  |---|---|---|
  | `2xs` | 10 | The play mark on the advance button |
  | `xs` | 12 | Tags and status chips |
  | `sm` | 14 | Small rows |
  | `md` | 16 | The default. The box `Atom/Icon` is drawn on. |
  | `lg` | 20 | Modal header, invite states |
  | `xl` | 28 | Empty states |

  The drawing is the Iconsax 24 grid scaled to the box, so the stroke scales with it, as in Figma.
- `color` is a token: `current` (the default, the parent's text colour), `fg`, `muted`, `accent-fg`, `warning`, `danger`, `success`. Each is a theme variable, so it follows Dark and Light.
- An icon is hidden from screen readers unless it gets a `label`.

For task 06:

- Two Lucide icons are drawn at 18 today (`Lock` in `activity/ActivityFeedRow.tsx`, `Check` in `pages/TeamInvites.tsx`). There is no 18 token, because Figma has no 18 icon. Each takes `md` or `lg`, whichever its frame shows.
- Figma's default colour for the set is `portal/muted`. The wrapper's default is `current`, because most icons in code sit inside a button or link and take its colour. Pass `color="muted"` where the frame shows a bare muted icon.
- When the last direct `lucide-react` import is gone, the same "only file" test can cover Lucide too.

## Task 06: icons swapped in code

Done 2026-11-26 in code. Every icon in `apps/portal` now comes from `<Icon>` (`src/components/ui/Icon.tsx`), by the tables in "Code: current icons to `Atom/Icon`" above.

- **Lucide.** No component imports `lucide-react` any more. The wrapper is the only importer, for `Check` and `X`, so the package stays installed (Peter, 2026-11-25). The "only file" test now covers both packages. `lib/data/tabIcons.tsx` had no importer and is deleted.
- **Files.** 31 icon files are deleted from `public/icons/`. What is left is the state marks and the logo: `task-stage`, `task-stage-shipped`, `item-stage`, `task-check`, `task-check-open`, `docs-dot-on`, `docs-dot-off`, `activity-published-dot`, `wordmark.svg`, `wordmark-ink.png`. A test fails if another file is added. `TaskGlyph` stays, for the stage rings and task circles only.
- **Inline SVG.** The hand-drawn icons are gone. The `<svg>` tags that remain are state marks: `StateGlyph`, `StatusDot`, `RunnerDotGlyph`, `ItemStageIcon`.
- **Text characters.** `✕`, `×`, `‹`, `›`, `↑`, `↓` are icons now. `↑↓` in the search hint stays text.
- **Dock.** Element3, Kanban, BookSaved, Activity, Profile. The active tab is Bold, the rest Linear. The search quick links use Element3, Layer, BookSaved and Activity.
- **Sizes and colours.** Every size is a token. The two 18px Lucide icons (`Lock` in the activity row, `Check` in the invite sent state) take `md`. An icon that had a fixed grey in its file now takes `color="muted"`; the others take the colour of their parent. CSS for the old files (`.nav-back-glyph`, `.dock-menu-glyph`, the painted `.dock-tab-icon` box) is removed.
- Spinners, the logo and the state marks are unchanged.

### Where the build follows the frame, not the old code

1. **Switch account** (flag 5). `auth/AcceptInvite.tsx` shows Profile2User, as `Organism/AuthCard` does. It was Lucide `LogOut`.
2. **Met password rule.** TickCircle, as `Molecule/Invites/Password rule` does. It was a heavy Lucide `Check`. An unmet rule is RecordCircle (flag 4).
3. **Preview link on the milestone tile.** Monitor at 16px, as `Organism/MilestoneListCard` does. It was 12px.
4. **Need a milestone banner.** Warning2 Linear in the warning colour. It was a filled triangle. The set has no Bold Warning2.
5. **Mobile back link.** `‹ Projects` is now ArrowLeft2 at 14px, then the label. The 390 frames still show `‹` inside the text layer (see "Left as they are" in task 04), so Figma needs the same change in the task 07 check.
6. **New client header.** `NEW PROJECT › CLIENT` now draws ArrowRight2 at 12px between the two words. The words are unchanged.

### Also swapped, not in the inventory

A bare `+` used as an icon in three places is now Add: the column add button in `tasks/TaskBoard.tsx`, the add row in `projects/MilestoneLoop.tsx`, and the add-task input in `projects/MilestoneChecklist.tsx`. The label `+ Add task` is copy and stays text.

### For task 07

- Play Linear at 10px on the advance button is lighter than the old filled triangle (flag 3). A Bold Play still needs Peter's yes.
- The older file icons were drawn smaller inside their box (the 12px chevron, the 7px lock). The Iconsax drawings fill the box, so chevrons and locks read slightly larger. Check rows and the status menu in Dark and Light at 1440 and 390.
- Tests that named an icon file now look for the icon by `data-icon`.

## Task 07: visual QA against Figma

Done 2026-11-26. Result: **pass, with one code fix made here and the follow-ups listed below.** None of the follow-ups is a wrong icon.

### How it was checked

- The build ran locally in fixture mode (`NEXT_PUBLIC_PORTAL_FIXTURES=1`, no Convex, no production). It is not the shared dev preview Peter approves from.
- 28 screens and states were captured in Dark and Light at 1440 and 390: 112 captures. On each one, every `<Icon>` on the page was read from the DOM: name, Linear or Bold, drawn size and drawn colour. 1,282 icons in all.
- In Figma, the same was read from 73 frames across Dashboard, Projects, Resources, Activity, Account and Onboarding: every `Atom/Icon` instance with its name, style, size and colour, plus any small loose vector or icon character that is not from the set.
- The two lists were compared, then the Project page (all four frames), Activity, the status menu, the invite card and the `Atom/Icon` set were compared by eye.
- Screenshots: `apps/portal/qa/iconsax-icons/`, 56 files named `<screen>-<dark|light>-<1440|390>.png`.

Not reached in fixture mode, so not checked on screen: the task modal, the create task and attach pickers, the milestone details editor, the confirm dialogs, the docs list, team and invites, API tokens. Their icons were checked in code against the map only.

### What matches

- **One set.** Every icon on every capture is an `<Icon>`. The only picture files left on screen are the logo and the state marks (`task-check-open`, `docs-dot-off`). Figma has no loose icon drawing left on the 73 frames; what the scan found is the logo and the `Corner bracket` decoration.
- **Style.** Linear everywhere. Bold only on the active dock tab, on the right tab on every screen where the dock shows, in both themes and both widths.
- **Names.** Every icon that appears in both a frame and its screen has the same name: the dock (Element3, Kanban, BookSaved, Activity, Profile), SearchNormal, HamburgerMenu, the banner (Warning2, X), the tile (Monitor, More, Lock in Staff only), the status control (ArrowDown2, Play), the status menu (Check, Lock), resource rows (Microphone, DocumentText, ArrowRight2), search (SearchNormal, Layer), the mobile menu (SearchNormal, Notification, ArrowRight2), and the invite card (Lock, Eye, RecordCircle, Profile2User, Clock, Sms).
- **Sizes.** Dock 16, search button 20, banner 16, tile link 16, status chevron 12, Play 10, Staff only lock 12, status menu lock 14 and tick 16: the same in the frame and the build. Invite state icons are 20 in the build; the card frames were compared by eye, not measured.
- **Dark and Light.** Icon colours are theme variables. Muted reads `#a4a4a4` in Dark and `#525252` in Light in both Figma and the build. No icon keeps a Dark colour in Light. The review card gallery (`/preview/approvals`) takes its own theme from the URL, so it was captured in Dark only.
- **Flag 7 (older drawings).** The 33 older Linear variants in `Atom/Icon` and the package drawings in the build look the same at 16px on the Project page and the dock. No variant needs a redraw.
- **Flag 3 (Play).** Play Linear at 10px reads clearly on the advance button in both themes at both widths, and matches the frame. No Bold Play is needed.
- **Chevrons and locks.** The Iconsax drawings fill their box, so they read slightly larger than the old files, as task 06 said. Rows and the status menu still line up. The frames show the same.

### Fixed in this task

- **Failed sync chip.** The alert mark was a grey file inside the red chip. After the swap it took the chip's red. It is `color="muted"` again (`sync/SyncChip.tsx`). This was the only place where the swap changed an icon's colour: the other old files were painted with the text colour of their parent, and still are.

### Follow-ups

Figma (Product Design Lead, same milestone):

1. **Back link at 390.** The frames still have `‹` inside the label (`‹ Projects`, `‹ Account`, `‹ Client experience launch`, `‹ VISIT App`). The build draws ArrowLeft2 at 14px, then the label.
2. **Close marks.** Search at 390 has a `✕` text layer and the task modal at 1440 has `✕  Close`. The build draws X.
3. **Active dock tab.** The Bold icon on the active tab is still `portal/muted` in the frames. The build draws it in the pill's ink colour, the same as the label, as it did before this milestone.
4. **`icon/moon` on the sidebar theme toggle** (Staff notices, Client invites review, Profile) is a loose vector. Swap it for Moon.

Where the frame and the build differed before this milestone, and still do. These are colour and size choices, not icon choices, so they were left for Peter to decide:

5. **Need a milestone banner.** The frame shows Warning2 in muted. The build shows it in the warning colour, as the old filled triangle was.
6. **Row lead icons on Activity and Dashboard.** Frames: 18px, muted. Build: 16px, in the text colour. There is no 18 size token.
7. **More button on the tile.** Frame: 16px. Build: 14px.
8. **Status menu tick, mobile menu icons, search quick links, back arrow, tile preview link.** Frame: muted. Build: the text colour of the row or button.
9. **Notice bell at 1440.** The build has it top right. The 1440 frames do not show it.

Also seen, outside icons: the Projects list frames have Filter and sort controls that the fixture build does not show, and the Activity frame has no dock. Neither is part of this milestone.

### Checks

Portal typecheck passes. Portal tests pass, 1439 of 1439.
