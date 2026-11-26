# Milestone tasks as a board: design handoff

Milestone: Milestone tasks as a board. Task 01, design. Status: waiting on Peter's approval. No build until his go.

Figma file: [Warehaus Studio](https://www.figma.com/design/TS3DcaCgrIdYf0jhvnMy3k/Warehaus-Studio?node-id=689-31057), page Portal - Projects (`689:31057`), section P07 · Milestone page (`689:54516`).

## Frames

The four existing Tasks kanban frames were changed in place. The states are new rows at the bottom of the same section.

| State | 1440 Dark | 1440 Light | 390 Dark | 390 Light |
|---|---|---|---|---|
| Staff, default | `689:54736` | `689:54793` | `689:54850` | `769:12829` |
| Staff, Building (To Do order locked) | `1109:41309` | `1109:41639` | `1109:41969` | `1109:42281` |
| Staff, Shipped (read-only) | `1109:42594` | `1109:42913` | `1109:43232` | `1109:43533` |
| Client (read-only) | `1109:43835` | `1109:44152` | `1109:44469` | `1109:44768` |
| Move sheet, 390 viewport | | | `1109:45077` | `1109:45162` |

Link pattern: `https://www.figma.com/design/TS3DcaCgrIdYf0jhvnMy3k/Warehaus-Studio?node-id=<id with - for :>`.

## Component library additions

Both are on Portal - Component Library (`151:5387`), beside Card / Task. The library was not published.

- `Card / Milestone task` (`1106:8680`). Variants: Status = To Do, In Progress, Blocked, Done. Properties: Title, Run, Origin, Show origin, Children, Show children, PR, Show PR, Show meta, Waiting on, Show waiting.
- `PortalModal / Body / Move to (milestone board)` (`1109:45067`). The body of the phone move sheet.

Everything else is an existing component: Chip / Filter (Archived), NewTaskButton (Add task), PortalModal bottom sheet, Overlay / Scrim.

## What the design shows

- Four columns in this order: To Do, In Progress, Blocked, Done. No Inbox column. No Stage mode and no group toggle.
- Card face: run number (To Do only, `01`, `02`, …), task name, origin badge (Brief, Planner, Manual, Review N), child count (done/total, only when the task has children), PR chip (only when a pull request is linked). A Blocked card adds the waiting reason in the danger colour. A Done card's name is muted.
- `Add task` sits at the bottom of To Do. Staff only, and not on a Shipped milestone.
- The Archived chip sits above the board, with its count. Staff only.
- Building: the To Do header reads `Order locked` with a lock. Cards still move between columns.
- Shipped: every card is in Done, empty columns read `No tasks`, no Add task, nothing moves.
- Client: no origin badge, no PR chip, no waiting reason, no Add task, no Archived chip, no intro panel. An empty column would read `Nothing here yet.`
- 390: columns are 220 wide and scroll sideways. Press and hold a card to open the move sheet. The sheet lists the four columns and marks the card's column `· Current`.

## Copy

| Where | Copy |
|---|---|
| Intro panel, staff, 1440 | Tasks come from the brief, review feedback, or a manual add. Review happens on the milestone, never on a task. |
| Context card body, staff, 390 | From the brief, review feedback, or a manual add. |
| Context card body, client, 390 | Open a task to see its details. |
| Footer, staff, 1440 | To Do runs top first. Drag a card to another column to change its status, or within To Do to change the run order. |
| Footer, staff, 390 | To Do runs top first. Press and hold a card to move it. |
| Footer, staff, Building | The milestone is Building, so the To Do order is locked. Cards can still move between columns. |
| Footer, staff, Shipped | This milestone has shipped. Its task list is closed. |
| To Do header, Building | Order locked |
| Empty column, staff | No tasks |
| Empty column, client | Nothing here yet. |
| Move sheet title | Move to |
| Move sheet rows | To Do · Current, In Progress, Blocked, Done |

## Not drawn, and open for Peter

- The Blocked prompt ("what is it waiting on") and the leaving-Done Undo toast are not drawn here. The existing NeedsDialog copy is about a pull request link, so the Blocked prompt needs its own copy before build. The Undo toast reuses PortalToast `kind=moved`.
- Task 05 built the Blocked prompt with this copy, which no frame shows yet. Title and button: `Move to Blocked`. Body: `What is “<task>” waiting on? It is saved as the task’s next action.` Field: `Waiting on`, placeholder `Who or what it is waiting on`. Empty answer: `Say what it is waiting on.` It needs Peter's OK and a frame.
- The page shell in these frames is the older one (Tasks title, Milestone overview button). Only the board and its copy changed.
- `Milestone page · Tasks · row overflow menu` (`1037:31403`, `1037:31460`) still shows the old five-column board with Inbox. It was left alone. It should be redrawn or retired once this design is approved.
- Whether a client should see run numbers, and whether Add task stays available while the milestone is Building, are both shown as yes. Say if either should be no.
