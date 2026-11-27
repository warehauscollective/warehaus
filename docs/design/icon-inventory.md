# Icon inventory

Milestone "Iconsax icons across the Portal", task 02. Taken 2026-11-26 from branch `milestone/iconsax-icons-across-the-portal` and from the Figma file Warehaus Studio (`TS3DcaCgrIdYf0jhvnMy3k`). Nothing was changed in code or in Figma.

This lists what exists today. It does not decide which Iconsax icon replaces which. That mapping is in the milestone notes, and the 40 mapped names are in `docs/design/iconsax-package-and-license.md`.

## Summary

Scope is `apps/portal`, the shared packages it uses, and the Portal pages of the Figma file.

| Source | Icons | Places used |
|---|---|---|
| `lucide-react` | 26 imported, 21 rendered | 50 |
| Files in `apps/portal/public/icons/` | 41 files, 38 used | 99 |
| SVG drawn inline in a component | 29 drawings in 19 files | 29 |
| Text characters used as icons | 7 characters | 10 |
| Figma `Atom/Icon` | 38 variants (33 Linear, 5 Bold) | see below |
| Figma `Atom/Links/Icon/*` | 16 components | see below |
| Figma `Atom/Invites/Icon/*` | 9 components | see below |

What stands out:

- Code has four icon sources and no Icon wrapper. Nothing in code comes from Iconsax yet.
- Figma already has one `Atom/Icon` set with Iconsax names, and every tab page uses it. Two older families remain beside it: `Atom/Links/Icon` and `Atom/Invites/Icon`.
- The same drawing exists several times in code. Chevron right is 3 files, 1 Lucide icon and 1 inline SVG. The warning triangle is 1 file, 1 Lucide icon and 5 inline SVGs. The bare tick is 1 file, 1 Lucide icon and 4 inline SVGs. The padlock is 2 files and 1 Lucide icon.
- Most files have a fixed colour baked in (`#A4A4A4`, `#FDFDFE`, `#636363`, `#585858`), so they do not follow the Light theme tokens on their own.
- Tests name icon files. Those assertions will need to change with the icons (listed per file below).

## Code

Paths are under `apps/portal/src/components/` unless they start with `lib/`. Numbers are line numbers.

### 1. Lucide (`lucide-react` ^0.563.0)

Size is the `size` prop in pixels. "CSS" means the size comes from a class (`portal-row-chevron`).

| Icon | Draws | Size | Where |
|---|---|---|---|
| `Activity` | Pulse line | - | Imported in `lib/data/tabIcons.tsx` only. That file has no importer, so it never renders. |
| `AlertCircle` | Circle with exclamation | 14 | `projects/NewProjectControl.tsx`:769. |
| `AlertTriangle` | Warning triangle | 20 | `auth/AcceptInvite.tsx`:486, 607, 618, 665, 800. |
| `Building2` | Office building | 16 | `projects/NewProjectControl.tsx`:625, 661. |
| `Check` | Check (bare tick) | 14, 16, 18, 28 | `auth/AcceptInvite.tsx`:791; `pages/DashboardHome.tsx`:566; `pages/TeamInvites.tsx`:620; `projects/NewProjectControl.tsx`:753. |
| `ChevronDown` | Chevron down | 16 | `projects/DoneGroup.tsx`:58; `projects/NewProjectControl.tsx`:668. |
| `ChevronRight` | Chevron right | 16, CSS | `activity/ActivityFeedRow.tsx`:95; `pages/DashboardHome.tsx`:379, 439, 481, 538; `projects/DoneGroup.tsx`:58. |
| `Circle` | Empty circle | 16 | `auth/AcceptInvite.tsx`:791. |
| `CircleCheck` | Circle with tick | 16, 20 | `auth/AcceptInvite.tsx`:596; `pages/DashboardHome.tsx`:723. |
| `Clock` | Clock | 14, 16, 20 | `auth/AcceptInvite.tsx`:579, 888; `pages/TeamInvites.tsx`:572, 667. |
| `ExternalLink` | Box with arrow out | 14 | `tasks/TaskSources.tsx`:57. |
| `Eye` | Eye | 16 | `ui/PasswordInput.tsx`:47. |
| `EyeOff` | Eye with slash | 16 | `ui/PasswordInput.tsx`:47. |
| `FolderKanban` | Folder with board | - | Imported in `lib/data/tabIcons.tsx` only. That file has no importer, so it never renders. |
| `LayoutDashboard` | Dashboard grid | - | Imported in `lib/data/tabIcons.tsx` only. That file has no importer, so it never renders. |
| `Library` | Books | - | Imported in `lib/data/tabIcons.tsx` only. That file has no importer, so it never renders. |
| `Lock` | Padlock | 14, 16, 18 | `activity/ActivityFeedRow.tsx`:59; `auth/AcceptInvite.tsx`:764; `clients/ClientScreens.tsx`:1204; `clients/NewClientControl.tsx`:360; `pages/TeamInvites.tsx`:690; `projects/NewProjectControl.tsx`:628, 631. |
| `LogOut` | Door with arrow out | 20 | `auth/AcceptInvite.tsx`:627. |
| `Mail` | Envelope | 16, 20 | `auth/AcceptInvite.tsx`:651; `pages/TeamInvites.tsx`:638. |
| `MoreHorizontal` | Three dots | 16 | `pages/TeamInvites.tsx`:372. |
| `Plus` | Plus | 16 | `projects/NewProjectControl.tsx`:548, 745. |
| `Search` | Magnifier | 16 | `projects/NewProjectControl.tsx`:502, 687. |
| `Shield` | Shield | 14 | `pages/DashboardHome.tsx`:738. |
| `ShieldCheck` | Shield with tick | 16, 20 | `auth/AcceptInvite.tsx`:642; `pages/TeamInvites.tsx`:678. |
| `UserRound` | Person | - | Imported in `lib/data/tabIcons.tsx` only. That file has no importer, so it never renders. |
| `X` | X (bare cross) | 16 | `pages/TeamInvites.tsx`:633; `projects/NeedMilestoneBanner.tsx`:80. |

`lib/data/tabIcons.tsx` exports `PORTAL_TAB_ICONS`, and nothing imports it. Its five icons never reach the screen.

### 2. Files in `apps/portal/public/icons/`

Loaded by path (`/icons/name.svg`). Size is the file's own width and height. Colour is what is written in the file.

| File | Draws | Size | Colour | Where |
|---|---|---|---|---|
| `activity-person.svg` | Person (head and shoulders) | 16×16 | #FDFDFE | `activity/ActivityFeedRow.tsx`:14. |
| `activity-published-dot.svg` | Filled dot, 8px | 8×8 | #FDFDFE | `tasks/itemStates.tsx`:417. |
| `activity-row.svg` | Clock | 16×16 | #FDFDFE | `activity/ActivityFeedRow.tsx`:16; `pages/ActivityContent.tsx`:275; `pages/DashboardHome.tsx`:515. |
| `client-chev.svg` | Chevron right | 12×13.665 | #A4A4A4 | `clients/ClientScreens.tsx`:247; `nav/ClientLink.tsx`:68; `pages/ProjectsContent.tsx`:588, 616; `pages/ResourcesContent.tsx`:581. Named in tests: `clients/ClientScreens.test.ts`. |
| `dock-account.svg` | Two people | 16×16 | #A4A4A4 | `layout/PortalDock.tsx`:15. |
| `dock-activity.svg` | Eye | 16×16 | #A4A4A4 | `layout/PortalDock.tsx`:14; `search/PortalSearch.tsx`:110. |
| `dock-menu.svg` | Three-line menu | 20×20 | #FDFDFE | Not used by any component. |
| `dock-projects.svg` | Stacked layers | 16×16 | #A4A4A4 | `layout/PortalDock.tsx`:12. |
| `dock-resources.svg` | Database cylinder | 16×16 | #A4A4A4 | `layout/PortalDock.tsx`:13; `search/PortalSearch.tsx`:109. |
| `docs-alert.svg` | Warning triangle | 16×16 | #A4A4A4 | `projects/milestoneDetailsEdit.tsx`:1075; `sync/SyncChip.tsx`:59; `ui/PortalToast.tsx`:190. |
| `docs-check.svg` | Check (bare tick) | 16×16 | #A4A4A4 | `closeout/CloseoutConfirm.tsx`:177; `projects/milestoneDetailsEdit.tsx`:1047, 1192, 1792; `search/PortalSearch.tsx`:75; `sync/SyncChip.tsx`:55; `ui/PortalToast.tsx`:190. Named in tests: `closeout/closeout.test.ts`, `projects/milestoneDetailsEdit.test.ts`. |
| `docs-chev.svg` | Chevron right | 16×16 | #A4A4A4 | `docs/DocsBlock.tsx`:113; `layout/PortalSidebar.tsx`:49; `search/PortalSearch.tsx`:804; `tasks/AttachedResourceRow.tsx`:125. |
| `docs-doc.svg` | Document with text lines | 16×16 | #A4A4A4 | `docs/DocsBlock.tsx`:105. |
| `docs-dot-off.svg` | Ring, 8px | 8×8 | #636363 | `docs/DocsBlock.tsx`:133; `pages/ResourcesContent.tsx`:631; `search/PortalSearch.tsx`:149; `tasks/AttachedResourceRow.tsx`:52. |
| `docs-dot-on.svg` | Filled dot, 8px | 8×8 | #FDFDFE | `docs/DocsBlock.tsx`:127, 128; `pages/ResourcesContent.tsx`:625, 626; `search/PortalSearch.tsx`:143, 144; `tasks/AttachedResourceRow.tsx`:46, 47. |
| `item-chev.svg` | Chevron right | 16×16 | currentcolor | Not used by any component. Named in tests: `tasks/itemStates.test.ts`. |
| `item-empty.svg` | Bulleted list | 28×28 | currentcolor | Not used by any component. Named in tests: `tasks/itemStates.test.ts`. |
| `item-stage.svg` | Stage ring, quarter filled | 12×12 | currentcolor | `projects/MilestoneStatusControl.tsx`:30. Named in tests: `lib/data/milestoneRoadmap.test.ts`, `tasks/itemStates.test.ts`. |
| `links-lock.svg` | Padlock | 16×16 | #A4A4A4 | `projects/milestoneTile.tsx`:236, 237. |
| `menu-arrow.svg` | Arrow right | 16×16 | #A4A4A4 | `layout/MobileMenu.tsx`:516. |
| `milestone-play.svg` | Play triangle | 10×10 | #FDFDFE | `projects/MilestoneStatusControl.tsx`:155. |
| `nav-back.svg` | Chevron left | 16×16 | #FDFDFE | `nav/NavBreadcrumb.tsx`:83. |
| `resource-doc.svg` | Document with text lines | 16×16 | #A4A4A4 | `activity/ActivityFeedRow.tsx`:13; `search/PortalSearch.tsx`:78; `tasks/AttachedResourceRow.tsx`:18. |
| `resource-link.svg` | Chain link | 16×16 | #A4A4A4 | `search/PortalSearch.tsx`:77; `tasks/AttachedResourceRow.tsx`:17. |
| `resource-mic.svg` | Microphone | 16×16 | #A4A4A4 | `search/PortalSearch.tsx`:76; `tasks/AttachedResourceRow.tsx`:16. |
| `resource-search.svg` | Magnifier | 16×16 | #A4A4A4 | `layout/MobileMenu.tsx`:393; `layout/PortalDock.tsx`:97; `search/PortalSearch.tsx`:437, 542; `tasks/TaskDetailModal.tsx`:1205. |
| `sidebar-menu.svg` | Three-line menu | 16×16 | #A4A4A4 | `layout/PortalSidebar.tsx`:38; `tasks/TaskBoard.tsx`:1067. Named in tests: `tasks/TaskCardFace.test.ts`. |
| `task-building.svg` | Office building | 16×16 | #A4A4A4, white | `tasks/TaskDetailModal.tsx`:594. |
| `task-calendar.svg` | Calendar | 16×16 | #A4A4A4 | `tasks/TaskBoard.tsx`:1127; `tasks/TaskDetailModal.tsx`:534, 553. |
| `task-check-open.svg` | Empty circle (task not done) | 20×20 | #585858 | `pages/DashboardHome.tsx`:421; `tasks/TaskDetailModal.tsx`:415. |
| `task-check.svg` | Filled circle with tick (task done) | 20×20 | #585858, #FCFCFC | `tasks/TaskDetailModal.tsx`:415. |
| `task-chev-down.svg` | Chevron down | 16×16 | #A4A4A4 | `projects/MilestoneStatusControl.tsx`:242; `projects/milestoneDetailsEdit.tsx`:1058; `tasks/TaskDetailModal.tsx`:1014, 1089. Named in tests: `lib/data/milestoneRoadmap.test.ts`. |
| `task-layers.svg` | Stacked layers | 16×16 | #A4A4A4 | `clients/ClientScreens.tsx`:1019, 1535; `projects/ProjectListStates.tsx`:69; `search/PortalSearch.tsx`:74, 107; `tasks/TaskDetailModal.tsx`:566, 590. |
| `task-link.svg` | Chain link | 16×16 | #A4A4A4 | `tasks/TaskBoard.tsx`:1138. |
| `task-list.svg` | Bulleted list | 16×16 | #A4A4A4 | `activity/ActivityFeedRow.tsx`:15; `tasks/TaskBoard.tsx`:1132. |
| `task-lock.svg` | Padlock, 7px | 7×8.2 | #636363 | `projects/milestoneDetailsEdit.tsx`:1054, 1191. Named in tests: `tasks/taskStageHint.test.ts`. |
| `task-stage-shipped.svg` | Stage ring, full | 12×12 | #FDFDFE | `projects/MilestoneStatusControl.tsx`:29. Named in tests: `lib/data/milestoneRoadmap.test.ts`. |
| `task-stage.svg` | Stage ring, three quarters filled | 12×12 | #FDFDFE | `clients/ClientScreens.tsx`:394; `pages/DashboardHome.tsx`:640; `projects/MilestoneStatusControl.tsx`:31; `projects/milestoneChrome.tsx`:59; `search/PortalSearch.tsx`:736; `tasks/TaskBoard.tsx`:1086. Named in tests: `lib/data/milestoneRoadmap.test.ts`. |
| `team-empty.svg` | Two people | 28×28 | #636363 | `account/teamStates.tsx`:163. Named in tests: `account/teamStates.test.ts`. |
| `wordmark-ink.png` | Warehaus wordmark, dark ink (logo, not an icon) | - | raster | `auth/AcceptInvite.tsx`:688. |
| `wordmark.svg` | Warehaus wordmark (logo, not an icon) | 91.6264×12.4073 | #FDFDFE | `auth/AcceptInvite.tsx`:720; `layout/MobileMenu.tsx`:165, 340; `layout/PortalSidebar.tsx`:147. |

Not used by any component: `dock-menu.svg`, `item-chev.svg`, `item-empty.svg`. The last two have inline copies in `tasks/itemStates.tsx`, and `tasks/itemStates.test.ts` reads the files to check the copies match.

Same picture under more than one name: `docs-doc.svg` and `resource-doc.svg`; `task-link.svg` and `resource-link.svg`; `task-layers.svg` and `dock-projects.svg`; `docs-dot-on.svg` and `activity-published-dot.svg`; `sidebar-menu.svg` and `dock-menu.svg`; `client-chev.svg`, `docs-chev.svg` and `item-chev.svg`; `dock-account.svg` and `team-empty.svg`; `task-list.svg` and `item-empty.svg`.

### 3. SVG drawn inline in a component

| Component (function) | Draws | Size | Where |
|---|---|---|---|
| `HeaderGlyph` | Bare tick, or circle with exclamation | 20 | `ui/PortalModal.tsx`:391 |
| `StatusBadge` | Chevron down | 10 | `ui/primitives.tsx`:44 |
| `ItemEmptyIcon` | Bulleted list | 28 | `tasks/itemStates.tsx`:561 |
| `ItemChevronIcon` | Chevron right | 16 | `tasks/itemStates.tsx`:571 |
| `ItemStageIcon` | Stage ring, quarter filled | 12 | `tasks/itemStates.tsx`:581 |
| `WarningTriangle` | Warning triangle | 20 | `tasks/TaskDetailModal.tsx`:1053 |
| `DashboardGlyph` | Four-square grid | 16 | `layout/PortalDock.tsx`:24 |
| Menu sheet, notices row | Bell | 16 | `layout/MobileMenu.tsx`:487 |
| `NoticeBell` | Bell | 16 | `notices/NoticeBell.tsx`:115 |
| `WarningMark` | Warning triangle, filled | 16 | `projects/NeedMilestoneBanner.tsx`:8 |
| `TileLinkIcon` (preview) | Screen with play mark | 12 | `projects/MilestoneListCard.tsx`:133 |
| `TileLinkIcon` (figma) | Four frame corners | 16 | `projects/MilestoneListCard.tsx`:133 |
| `ClearAlertIcon` | Warning triangle | 20 | `projects/ProjectRepoSetting.tsx`:69 |
| `StateGlyph` | Task state: ring, dashed ring, or filled circle | 14 | `projects/MilestoneChecklist.tsx`:61 |
| Approved line | Bare tick | 14 | `projects/ApprovalsPreview.tsx`:772 |
| `CheckIcon` | Bare tick | 12 (or `size`) | `projects/MilestoneReview.tsx`:143 |
| `ClockIcon` | Clock | 12 | `projects/MilestoneReview.tsx`:171 |
| `AlertIcon` | Warning triangle | 14 | `projects/MilestoneReview.tsx`:180 |
| `StyledCheckbox` | Bare tick inside the checkbox | 10 | `projects/MilestoneReview.tsx`:226 |
| `ExternalLinkIcon` | Box with arrow out | 16 | `projects/MilestoneReview.tsx`:260 |
| `StatusDot` | Filled dot | 8 | `projects/MilestoneReview.tsx`:326 |
| `RunnerDotGlyph` | Runner status: ring with or without a core | 12 | `projects/RunnerStatus.tsx`:83 |
| `Dots` | Three dots | 14 | `closeout/OverflowMenu.tsx`:44 |
| `WarningTriangle` | Warning triangle | 20 | `closeout/CloseoutConfirm.tsx`:75 |
| `GridGlyph` | Four-square grid | 16 | `search/PortalSearch.tsx`:87 |
| `CloseGlyph` | Bare cross | 16 | `search/PortalSearch.tsx`:98 |
| Scope select | Chevron down | 16 | `account/ApiTokensPanel.tsx`:162 |
| `ThemeIcon` (dark) | Moon | 14 | `account/ThemeControl.tsx`:31 |
| `ThemeIcon` (light) | Sun | 14 | `account/ThemeControl.tsx`:42 |

All use `currentColor` or a token (`var(--danger)`, `var(--warning)`), so they follow the theme.

State marks, not pictures: `StateGlyph`, `StatusDot`, `RunnerDotGlyph`, `ItemStageIcon`, the stage ring files (`item-stage`, `task-stage`, `task-stage-shipped`), the dot files (`docs-dot-on`, `docs-dot-off`, `activity-published-dot`) and the task circles (`task-check`, `task-check-open`). Figma keeps marks like these as their own atoms (`Atom/Badge/Stage`, `Atom/Indicator/Published`, `Atom/Checkbox`), not as `Atom/Icon` variants.

### 4. Text characters used as icons

| Character | Meaning | Where |
|---|---|---|
| `✕` | Close | `tasks/TaskDetailModal.tsx`:386 |
| `×` | Close | `tasks/TaskDetailModal.tsx`:1193 |
| `‹` | Back, previous month | `projects/ProjectRoadmap.tsx`:451; `projects/MilestoneDetailView.tsx`:367; `projects/milestoneDetailsEdit.tsx`:1858 |
| `›` | Next month, breadcrumb separator | `projects/milestoneDetailsEdit.tsx`:1860; `clients/NewClientControl.tsx`:285 |
| `↑` | Move task up | `projects/MilestoneChecklist.tsx`:479 |
| `↓` | Move task down | `projects/MilestoneChecklist.tsx`:486 |
| `↑↓` | Keyboard hint | `search/PortalSearch.tsx`:689 |

`→` in `projects/milestoneDetailsEdit.tsx`:1507 is copy ("FROM → TO"), not an icon.

### 5. Not icons, listed so they are not missed

- Spinners are CSS borders, not drawings: `ButtonSpinner` in `ui/primitives.tsx`:95, `Spinner` in `projects/MilestoneReview.tsx`:149, one in `projects/milestoneChrome.tsx`:593, and `portal-modal-spin` in `styles/global.css`:738. Figma has `Atom/Icon/Spinner`.
- Logo: `wordmark.svg`, `wordmark-ink.png`, and `WarehausLogo.tsx` and `Bevel.tsx` in `packages/ui`.
- No CSS file draws an icon (no `mask-image`, no icon in `content`).

### 6. Outside the Portal app

- `apps/web` (the marketing site) has its own `lucide-react` dependency and uses it in 13 files. It is not part of this milestone's goals.
- `apps/mac` (the runner menu app) uses three SF Symbols in `Sources/RunnerMenu/SetupViews.swift`: `checkmark.circle.fill`, `exclamationmark.circle.fill`, `info.circle`.
- `packages/*` has no icons apart from the logo.

## Figma

All icon components are in Portal - Component Library (`151:5387`), section Atoms. No tab page has a local icon component.

"Library" lists the components that hold an instance. "Screens" is the number of instances on each tab page, counting instances nested inside other components and all four frames of a screen, plus anything in that page's Exploration section. Read the counts as "used a lot" or "used a little".

### `Atom/Icon` (`281:7631`)

One component set, 16×16, properties `Name` and `Style`.

| Name | Style | Library | Screens |
|---|---|---|---|
| Profile | Linear | Organism/Dock/Portal, Organism/Floating Sidebar, Organism/MobileMenu | Dashboard 4, Projects 64, Resources 10, Activity 8 |
| ArrowRight2 | Linear | Organism/Floating Sidebar, Organism/MobileMenu, Organism/TaskDetailModal, Organism/Done group, Organism/FilterMenu, Molecule/Meta/Client link, Molecule/Row/Item, Molecule/Row/Project, Molecule/Row/Client, Molecule/Row/Resource, Molecule/Search row, Molecule/Filter/Section, 00 Index & foundations | Dashboard 90, Projects 202, Resources 97, Activity 32, Account 68 |
| Add | Linear | Organism/NewProjectForm, Organism/TaskDetailModal, Atom/NewTaskButton | Projects 72, Resources 20 |
| SearchNormal | Linear | Organism/Dock/Portal, Organism/MobileMenu, Organism/ProjectMenu, Organism/NewProjectForm | Dashboard 19, Projects 40, Resources 4, Activity 4, Account 14 |
| ExportSquare | Linear | Organism/ReviewCard | Projects 8, Resources 6 |
| Lock | Linear | Organism/PortalModal/Body (Stage, Owner, Stage ready), Organism/OwnerMenu, Organism/DueDateMenu, Organism/NewClientForm, Organism/NewProjectForm, Organism/TaskDetailModal, Organism/MilestoneStatusControl, Molecule/Stage control | Projects 10, Activity 4, Account 8 |
| DocumentText | Linear | Organism/Floating Sidebar, Molecule/Search row | Dashboard 17, Projects 8, Resources 36, Activity 8 |
| Notification | Linear | Organism/Floating Sidebar, Organism/MobileMenu | Dashboard 2 |
| Check | Linear | Organism/Floating Sidebar, Organism/PortalModal/Body (Stage, Owner, Visibility, Move to, Stage ready), Organism/OwnerMenu, Organism/DueDateMenu, Organism/ProjectMenu, Organism/NewProjectForm, Organism/ReviewCard, Organism/ConfirmFrame, Organism/ConfirmFrame/Body, Organism/RequestChangesForm, Organism/MilestoneStatusControl, Organism/FilterMenu, Molecule/ValueButton, Molecule/Toast/Kanban, Molecule/PortalToast, Molecule/Search row, Molecule/Filter/Option, Atom/Checkbox | Dashboard 19, Projects 46, Resources 25, Account 6 |
| Warning2 | Linear | Organism/PortalModal, Organism/Card/Task, Organism/NewClientForm, Organism/ReviewCard, Organism/ConfirmFrame, Organism/ConfirmFrame/Body, Organism/RequestChangesForm, Molecule/ValueButton, Molecule/Toast/Kanban, Molecule/PortalToast, Molecule/Need a milestone | Projects 30, Resources 1 |
| Refresh | Linear | Organism/Floating Sidebar, Organism/Card/Task | Dashboard 6, Activity 12 |
| Filter | Linear | Molecule/Filter/Trigger | Projects 58 |
| HamburgerMenu | Linear | Organism/Floating Sidebar, Organism/Card/Task | Dashboard 4, Projects 32, Resources 6, Activity 10, Account 24 |
| Kanban | Linear | Organism/Dock/Portal, Organism/Floating Sidebar | Dashboard 4, Resources 8, Activity 8, Account 26 |
| Task | Linear | Organism/Floating Sidebar, Organism/Card/Task, Organism/Card/Milestone task | Projects 48, Resources 16 |
| Element3 | Linear | Organism/Dock/Portal, Organism/MobileMenu | Dashboard 1, Projects 60, Resources 10, Activity 8, Account 26 |
| Layer | Linear | Organism/ProjectMenu, Organism/ConfirmFrame, Organism/ConfirmFrame/Body, Organism/TaskDetailModal | Dashboard 15, Projects 19, Activity 8, Account 2 |
| Gps | Linear | Organism/Floating Sidebar | None |
| Data | Linear | None | Dashboard 1 |
| Eye | Linear | Organism/PortalModal/Body/Visibility, Organism/ConfirmFrame, Organism/ConfirmFrame/Body, Organism/AuthCard, Organism/AuthPageShell | Onboarding 16, Dashboard 1, Projects 6 |
| People | Linear | Organism/Floating Sidebar | Account 3 |
| Building | Linear | Organism/Floating Sidebar, Organism/NewProjectForm, Organism/TaskDetailModal | Projects 14, Account 5 |
| Clock | Linear | Organism/Floating Sidebar, Organism/ReviewCard, Molecule/Row/Event | Activity 10 |
| Link | Linear | Organism/Floating Sidebar, Organism/Card/Task, Organism/Card/Milestone task, Organism/TaskDetailModal | Dashboard 7, Projects 61, Resources 16 |
| Microphone | Linear | Organism/Floating Sidebar, Organism/TaskDetailModal, Molecule/Row/Resource | Dashboard 9, Projects 16, Resources 38 |
| EyeSlash | Linear | Organism/PortalModal/Body/Visibility, Organism/NewProjectForm, Organism/ConfirmFrame, Organism/ConfirmFrame/Body, Organism/TaskDetailModal | Projects 32 |
| Calendar | Linear | Organism/Card/Task, Organism/TaskDetailModal, Organism/FilterMenu, Molecule/Filter/Date range | Projects 29, Resources 16 |
| More | Linear | Organism/OverflowMenu, Organism/TaskDetailModal, Molecule/Row/Person, Atom/Trigger/More | Projects 23, Account 28 |
| X | Linear | Molecule/Filter/Value chip | Projects 48 |
| ArrowDown2 | Linear | Organism/OwnerMenu, Organism/DueDateMenu, Organism/ProjectMenu, Organism/NewProjectForm, Organism/TaskDetailModal, Organism/MilestoneListCard, Organism/Done group, Organism/MilestoneStatusControl, Organism/FilterMenu, Molecule/ValueButton, Molecule/Sort/Trigger, Molecule/Filter/Section, 00 Index & foundations | Projects 241, Resources 12, Account 10 |
| ArrowLeft2 | Linear | Organism/TaskDetailModal, Molecule/Nav/Breadcrumb | Projects 4, Resources 6, Account 12 |
| BookSaved | Linear | Organism/Dock/Portal, Organism/MobileMenu | Dashboard 4, Projects 60, Resources 2, Activity 8, Account 26 |
| Activity | Linear | Organism/Dock/Portal, Organism/MobileMenu | Dashboard 4, Projects 60, Resources 10, Account 26 |
| Element3 | Bold | Organism/Dock/Portal | Dashboard 4 |
| Kanban | Bold | Organism/Dock/Portal, Organism/MobileMenu | Projects 60, Resources 2 |
| BookSaved | Bold | Organism/Dock/Portal | Resources 8 |
| Activity | Bold | Organism/Dock/Portal | Activity 8 |
| Profile | Bold | Organism/Dock/Portal | Account 26 |

- `Gps` is used only in Organism/Floating Sidebar and on no screen. `Data` is used once, on Dashboard, and by no library component.
- `Check` and `X` are not Iconsax names. They are the Lucide fallback Peter agreed on 2026-11-25.
- Bold exists only for the five tab icons (the active tab).
- Of the 40 mapped Iconsax names, 31 are in the set. Not in it yet: Buildings2, CloseCircle, InfoCircle, Logout, RecordCircle, Shield, ShieldTick, Sms, TickCircle.

### `Atom/Icon/Spinner` (`788:5280`)

20×20. Used in Organism/ConfirmFrame.

### `Atom/Links/Icon/*` (`516:4799` to `516:4863`)

16 single components, 16×16. The Figma protocol says this family should not exist ("No domain icon families").

| Component | Library | Screens |
|---|---|---|
| `Atom/Links/Icon/globe` | Molecule/Links/Item | None |
| `Atom/Links/Icon/staging` | None | None |
| `Atom/Links/Icon/preview` | Molecule/Links/Item, Atom/Links/Visibility tag | None |
| `Atom/Links/Icon/design` | None | None |
| `Atom/Links/Icon/repo` | None | None |
| `Atom/Links/Icon/docs` | None | None |
| `Atom/Links/Icon/admin` | None | None |
| `Atom/Links/Icon/other` | None | None |
| `Atom/Links/Icon/open` | Molecule/Links/Item | None |
| `Atom/Links/Icon/lock` | Organism/AuthCard, Organism/InviteForm, Organism/MilestoneListCard, Atom/Links/Staff only tag, Atom/Links/Visibility tag | Projects 14, Account 6 |
| `Atom/Links/Icon/plus` | None | None |
| `Atom/Links/Icon/grip` | None | None |
| `Atom/Links/Icon/edit` | None | None |
| `Atom/Links/Icon/close` | Organism/InviteForm, Molecule/Need a milestone | Projects 12, Account 4 |
| `Atom/Links/Icon/chevron` | None | None |
| `Atom/Links/Icon/check` | None | None |

Eleven of the sixteen have no instance anywhere in the library or on a tab page.

### `Atom/Invites/Icon/*` (`540:6837` to `540:6874`)

9 single components, 16×16. Same rule applies.

| Component | Library | Screens |
|---|---|---|
| `Atom/Invites/Icon/mail` | Organism/AuthCard, Organism/InviteForm | None |
| `Atom/Invites/Icon/clock` | Organism/AuthCard, Organism/InviteEmail, Organism/InviteForm, Organism/Invites/Member card, Molecule/Invites/Member row, Atom/Invites/Status | Account 8 |
| `Atom/Invites/Icon/alert` | Organism/AuthCard | None |
| `Atom/Invites/Icon/checkCircle` | Organism/AuthCard, Organism/InviteForm, Molecule/Invites/Password rule | Dashboard 4 |
| `Atom/Invites/Icon/userPlus` | None | None |
| `Atom/Invites/Icon/resend` | None | None |
| `Atom/Invites/Icon/switchUser` | Organism/AuthCard | None |
| `Atom/Invites/Icon/circle` | Organism/AuthCard, Molecule/Invites/Password rule | None |
| `Atom/Invites/Icon/shield` | Organism/AuthCard, Organism/InviteForm | Dashboard 4 |

`userPlus` and `resend` have no instance anywhere in the library or on a tab page.

## Code and Figma side by side

Where they already differ, before any Iconsax work:

- Dock tabs. Figma: Element3, Kanban, BookSaved, Activity, Profile. Code: an inline four-square grid, then `dock-projects` (layers), `dock-resources` (database), `dock-activity` (eye), `dock-account` (two people).
- Invite and sign-up screens. Figma uses `Atom/Invites/Icon/*`. Code uses Lucide in `auth/AcceptInvite.tsx` and `pages/TeamInvites.tsx`.
- Figma has Filter, Refresh, Gps, People, Notification and Data. Code has a bell (inline, twice) and no filter, refresh, gps or data icon.
- Code has a sun and a moon (`account/ThemeControl.tsx`), a play triangle (`milestone-play.svg`), a "preview" screen mark and a "figma" frame mark (`projects/MilestoneListCard.tsx`). None of these is in `Atom/Icon`.

## How this was gathered

- Code: searched `apps/portal/src` and `packages/` for `lucide-react` imports and their JSX tags, for every `.svg` and `.png` name in `public/icons/`, for `<svg`, for icon-like characters, and for `mask-image` in CSS. Test and story files are left out of "Where". The two generated tables (sections 1 and 2) come from a script over the source, so line numbers match this commit.
- Figma: read through the Figma connector with read-only scripts. Components were matched by name (`icon`, `glyph`, `chev`, `arrow`), and instances by their main component. A drawing made from loose vectors and not from a component would not show up here.
