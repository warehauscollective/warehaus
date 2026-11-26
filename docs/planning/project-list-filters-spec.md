# Project list filters: spec

Milestone: **Add filters in the project list**. Task 01. Spec only, no code.

Status: **waiting on Peter's approval** (Grok Bot or the Portal). No build task starts before that.

## What this changes

The Projects tab list (`apps/portal/src/components/pages/ProjectsContent.tsx`) gets a filter menu and a sort control at the top of the list. The view a person sets is saved to their account and comes back on any device.

Today the list has four chips (All, Active, Shipped, Internal) and a fixed "Sorted by last updated" line.

## Ground rules

- Filters and sorts use only fields the list already loads on `PortalProject` / `ProjectRow`. No new project fields, no new project queries.
- Filtering and sorting run in the browser over the rows already loaded, as pure functions in `src/lib/data/projectList.ts`.
- A viewer never sees an option, a count or a row they could not see before. Clients still never see internal projects.

## 1. Filters

Every filter starts at "Any". A filter set to "Any" does nothing.

| Filter | Who | Type | Options | A row matches when |
|---|---|---|---|---|
| Status | Everyone | Pick many | The distinct `status` values on the rows the viewer can see. Known values first in this order: Inbox, Planned, In progress, Paused, Shipped, Done. Any other value after, A to Z. | Its status is one of the picked values (case ignored). |
| Client | Staff | Pick many | `page.clients`, A to Z by name. | Its `orgId` is one of the picked clients. |
| Publish state | Staff | Pick one | Any, Published, Not published | `publishToWarehaus` is true (Published) or false (Not published). Internal projects have no publish state and never match either. |
| Stack | Everyone | Pick many | The distinct `stack` values on the rows the viewer can see, A to Z. The filter is hidden when no row has a stack. | Its `stack` holds at least one picked value. |
| Start date | Everyone | Date range | From, To (either can be empty) | `startDate` is on or between the dates. |
| End date | Everyone | Date range | From, To (either can be empty) | `endDate` is on or between the dates. |
| Progress | Everyone | Pick many | Not started (0%), In progress (1 to 99%), Complete (100%), No progress yet (—) | The percent shown on the row falls in a picked band. Same number as the row: `projectProgress()`. |
| Tasks | Everyone | Pick one | Any, Has tasks, No tasks | The task count shown on the row (`projectTaskCount()`) is above zero, or is zero. |
| Last updated | Everyone | Pick one | Any time, Last 7 days, Last 30 days, Last 90 days | `lastSyncedAt` is inside the window. |

Rules that apply to all of them:

- A row with no value for a field (no start date, no `lastSyncedAt`) does not match once that filter is set.
- Option lists come from the viewer's rows only, so a client never sees a status, stack or client name from a project they cannot see.
- Internal is not repeated in the menu. It stays as the Internal quick filter chip (section 5).

## 2. Sort

One sort at a time, each with two directions. The first direction listed is the one picked when the field is chosen.

| Sort | Who | Directions |
|---|---|---|
| Last updated (`lastSyncedAt`) | Everyone | Newest first, Oldest first |
| Name | Everyone | A to Z, Z to A |
| Client (`clientName`) | Staff | A to Z, Z to A |
| Status | Everyone | A to Z, Z to A |
| Start date | Everyone | Earliest first, Latest first |
| End date | Everyone | Earliest first, Latest first |
| Progress | Everyone | Most first, Least first |
| Tasks | Everyone | Most first, Fewest first |

- **Default: Last updated, newest first** ("most recent"). This is what the list does today.
- Rows with no value for the sort field go last, in both directions.
- Ties break by name A to Z, then by id, so the order never jumps between renders.
- The "Sorted by last updated" line under the heading shows the current sort. Exact copy is set by the Figma frame (task 02).

## 3. How filters combine

- Different filters combine with **AND**. A row must pass every filter that is set, and the quick filter chip.
- Inside one pick-many filter the values combine with **OR** (Status: Planned or In progress).
- Sort never hides a row.

## 4. Clients versus staff

| | Clients | Staff |
|---|---|---|
| Quick filter chips | All, Active, Shipped | All, Active, Shipped, Internal |
| Menu filters | Status, Stack, Start date, End date, Progress, Tasks, Last updated | The same, plus Client and Publish state |
| Sorts | All except Client | All |
| Rows | Published projects for their own client only (unchanged) | Every project, internal included (unchanged) |

The server strips Client and Publish state from a client's saved view, so a staff-only value can never be stored or returned for a client contact.

## 5. Chips and the sidebar

- The four chips **stay** as quick filters, in the same place and with the same meaning as today (`projectMatchesFilter`): Active and Shipped leave out internal projects, Internal shows only internal projects.
- The chip is one more AND condition next to the menu filters.
- Chip counts follow the menu filters: each chip shows how many rows it would list with the current menu filters applied.
- Sidebar sync stays two-way, as today: picking the All, Active or Shipped chip sets the Projects sidebar section (`setSectionFor('projects', key)`), and picking a sidebar section sets the chip. Internal has no sidebar section, so it leaves the sidebar where it was.
- Picking "All projects" in the sidebar sets the chip to All. It does not clear the menu filters. Only "Clear filters" does that.
- The saved chip is restored on load and sets the sidebar section to match.

## 6. KPI cards

KPI cards (Active, Awaiting go, Shipped) **stay unfiltered**. They always show the viewer's totals from `projectListKpis`, whatever the chip, the menu filters or the sort say. They are the summary of everything; the list below is the filtered view.

## 7. Saved view

- Saved **per signed-in contact**, in Convex. It follows the person across devices and browsers. It is not in `localStorage` and not in the URL.
- **No expiry.** It stays until the person changes it or presses Clear filters.
- What is saved: the quick filter chip, every menu filter, and the sort with its direction.
- Storage: a new table `projectListPrefs` with one row per contact and a `by_contactId` index, read and written the way `notificationPrefs` is (`getMine` / `saveMine` on the signed-in contact only). One indexed `unique()` read. No scans.
- Staff have one view. It is the same on every client host they open.
- Writes are kept low: a change is saved after a short pause, a save that matches what is stored is skipped, and a view equal to the default is stored as no row.
- On load the list waits for the saved view inside the existing loading state, so the default list never flashes before the saved one.
- A saved value that no longer exists (a client that was removed, a status no project has now) is ignored and not shown as selected. It does not hide every row.
- If a save fails, the view still applies for the session. Nothing blocks the list.
- Fixture previews do not read or write the saved view.

### Clear filters

- A "Clear filters" control shows whenever the chip is not All or any menu filter is set.
- It sets the chip to All and every menu filter to Any, and saves that.
- It keeps the sort. Sort is not a filter.
- The filtered-empty state ("No projects match these filters.") offers the same Clear filters action.

## 8. Design (task 02)

Drawn in Warehaus Studio (`TS3DcaCgrIdYf0jhvnMy3k`), page Portal - Projects, section P01 · Projects list (`689:49854`). Status: **frames exist, waiting on Peter's approval of the frames** (Grok Bot or the Portal). The library is not published.

### Frames

Every state is a Dark component with a Light instance beside it, at 1440 and 390. Names start with `Projects / Projects list`.

| State | 1440 Dark | 1440 Light | 390 Dark | 390 Light |
|---|---|---|---|---|
| Closed (existing frames, changed in place) | `1166:12530` | `1166:12531` | `1166:12730` | `1166:12731` |
| Filters open | `1265:14952` | `1265:16514` | `1265:20204` | `1265:22921` |
| One filter | `1265:15355` | `1265:16902` | `1265:20580` | `1265:23273` |
| Several filters | `1265:15653` | `1265:17140` | `1265:20864` | `1265:23467` |
| Sort open | `1265:15949` | `1265:17378` | `1265:21146` | `1265:23661` |
| No matches | `1265:16237` | `1265:17716` | `1265:21417` | `1265:23963` |
| Client, closed | `1265:17935` | `1265:19244` | `1265:21680` | `1265:24138` |
| Client, Filters open | `1265:18199` | `1265:19447` | `1265:21922` | `1265:24292` |
| Client, Several filters | `1265:18612` | `1265:19729` | `1265:22323` | `1265:24533` |
| Client, Sort open | `1265:18898` | `1265:19954` | `1265:22587` | `1265:24709` |

Design notes sit beside the frames: `Note · Project list filters` (`1266:22415`).

### Components

New in Portal - Component Library (`151:5387`):

| Component | Node |
|---|---|
| Atom/Checkbox | `1261:8165` |
| Atom/Radio | `1261:8169` |
| Molecule/Filter/Option | `1261:8195` |
| Molecule/Filter/Trigger | `1261:8228` |
| Molecule/Sort/Trigger | `1261:8245` |
| Molecule/Filter/Value chip | `1261:8255` |
| Molecule/Filter/Section | `1261:8272` |
| Molecule/Filter/Date range | `1261:8294` |
| Organism/FilterMenu | `1262:9026` |
| Organism/SortMenu | `1262:9241` |

Organism/Project list (`1165:12906`, Local components on Portal - Projects): the four default variants now carry the Filters and Sort controls, and it has new variants `State=filtered-one`, `filtered-several` and `filtered-empty`.

### What the frames settle

- **Placement.** At 1440, Filters and Sort sit at the right of the quick filter row. At 390 they sit on their own row under the chips.
- **Apply.** A filter applies as soon as a value is picked. There is no Apply button.
- **Count.** The number on Filters is how many filters are set, not how many values.
- **Set values.** Each value that is set shows as a chip under the toolbar (`Client: Northwind Foods ×`). The × removes that value only. Clear filters follows the chips.
- **Menu at 1440.** A popover under the control. One row per filter with its summary (`Any`, a value, or `Any time`); a row expands to its options. Pick-many uses checkboxes, pick-one uses radios, dates use FROM and TO fields.
- **Menu at 390.** A bottom sheet over the scrim, one sheet at a time, with Close and Done. Option rows are 49 tall. A sheet taller than the screen scrolls inside. Clear filters is in the sheet footer when a filter is set.
- **Sort.** One menu: the field list, then DIRECTION with the two directions for that field. At 390 the control shows the field only; the direction is in the sheet and the subtitle line.

### Copy

Build copy matches these, character for character.

- Controls: `Filters`, `Sort`, `Clear filters`, `Done`, `Close`.
- Filtered-empty: `No projects match these filters.` with a `Clear filters` button.
- Filter menu note: `Filters apply as you pick. Saved to your account.` Sheet hint: `Filters apply as you pick`.
- Sort menu: `Sort by`, `DIRECTION`, `Saved to your account.`
- Summaries: `Any`, `Any time`, `Any date`. Date fields: `FROM`, `TO`.
- Sort control value: `Last updated · Newest first` (field, a middle dot, direction). At 390: `Last updated`.
- Staff subtitle: `Sample data · sorted by last updated, newest first`. The words after `sorted by` follow the sort: field, then direction, lower case.

### Differences to resolve

- **Client quick filters.** Section 4 lists All, Active, Shipped for clients. The existing client frame draws Active and Shipped only, and task 02 did not change the quick filters. Peter to say which is right before the build task touches them.
- **Client subtitle.** The client card subtitle is `Brand is attached to each project` and has no "sorted by" line. In the client frames the Sort control alone shows the current sort.
- **Option counts.** The spec defines counts on the quick filter chips only, so menu options are drawn without counts.

## Out of scope

- Text search.
- More than one saved view, named views, or sharing a view.
- Fields the list does not load today (priority, type, archive).
- Filtering on the server.
- Filters on the client list, the dashboard, or inside a project.

## Open for Peter

1. **"Last updated" is the last sync time.** The only timestamp on a project row is `lastSyncedAt`, when the row last synced from Notion. It is not "last time someone worked on it". The default sort and the Last updated filter use it, as the list does today. A true last-activity date would need a new field and is a separate task.
2. **Clear filters keeps the sort.** Say so if it should also reset the sort to Last updated, newest first.
3. **Status options come from the data.** Project status is free text from Notion (today: Inbox, Planned, In progress), so the menu lists what exists instead of a fixed set.
