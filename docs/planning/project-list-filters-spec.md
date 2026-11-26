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
- Storage: a new table `projectListViews` with one row per contact and a `by_contactId` index, read and written the way `notificationPrefs` is (`getMine` / `saveMine` on the signed-in contact only). One indexed `unique()` read. No scans.
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
