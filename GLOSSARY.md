# Warehaus

One glossary for the Warehaus portal, the website and the shared packages. The portal mirrors the Warehaus Notion workspace and writes some changes back to it.

## Notion

**Notion client**:
The single path between Warehaus and Notion. Every read from Notion and every write to it goes through the Notion client.
_Avoid_: Notion API, Notion service, Notion wrapper

**Write-back**:
A change made in the portal that is written to the matching Notion page, such as a task's stage or a new project.
_Avoid_: push, sync-up, outbox write

**Write kind**:
The category a Notion write belongs to, which decides the rule it must pass. The kinds are write-back, auth mirror and resource URL.
_Avoid_: write type, write mode

**Write policy**:
The rule that decides, for each write kind, whether a write to Notion is allowed on the current deployment. A write the policy refuses is skipped, not failed.
_Avoid_: write gate, write flag, feature flag

**Auth mirror**:
The write kind that copies a contact's Auth User ID and External ID onto their Notion contact page after sign-in.
_Avoid_: auth sync, auth write-back

**Resource URL**:
The write kind that records a Shared Resource's durable file link on its Notion page.
_Avoid_: blob write-back, URL sync

## Milestones

**Milestone task set**:
The tasks a milestone is judged by: the same rows its roadmap shows, which are the tasks linked to the milestone plus the subtasks under them. Archived tasks are not in it. Whether a milestone is done, can ship, or has work for a runner is always asked of its task set.
_Avoid_: milestone tasks, linked tasks, close set

**Status change**:
A milestone moving from one Status to another. Every status change passes the same gate, writes one activity row, and runs what that status asks for on the way in and out, such as Peter's approval note on entering Ready to Ship. The cause says why it moved: set by a person or the staff API, play, Mark complete, a merge, or a review asking for changes.
_Avoid_: status write, transition, status update

## Tasks

**Task change**:
An edit to one or more fields of one task by staff, the staff API, a merged pull request, or closeout. A task change is saved in the portal at once and holds against any older Notion edit. When the task has a Notion page and write-back is allowed, it is also written back; otherwise it stays in the portal and says so. A task change is checked whole: every field is saved, or none.
_Avoid_: task update, field save, task write, move

**Pending stage**:
A task's stage that a task change moved and Notion has not confirmed yet. It stays pending until Notion confirms it, a newer Notion edit replaces it, or a move back onto the stage Notion has settles it. Only a stage can be pending; other fields are protected by their stamp.
_Avoid_: unsynced stage, stage draft

## Clients

**Concealed client**:
A client row that sync has trashed, archived or quarantined. Nobody reads a concealed client's projects, tasks or other rows: not the client, and not staff in the portal or the staff API. A client with portal access Disabled is not concealed; staff still see it.
_Avoid_: hidden client, disabled client, deleted client

**Client visibility**:
Whether a client can see a project, a task, or an item on a project (a doc or a shared resource). A client sees it only when their org has portal access and is not concealed, the row is published, not archived and not hidden by sync, and its project is one the client may see. Warehaus Studio and Internal projects are never visible to clients. An item with no project needs only the org check. Archived tasks still show in history; the board leaves them out.
_Avoid_: published, client-safe, public

## Runner

**Runner**:
The program on a staff Mac that takes milestone work from the Portal and hands it to an agent. A registered runner serves every project that names a repository it can reach, and works only in its own copy of that repository. A project gets no runner work until it names its repository.
_Avoid_: bot, worker, agent

**Runner registration**:
A runner that staff set up for one deployment from the Portal by confirming its pairing code. It has an id and a secret that only its own machine holds, never shown to anyone. A runner is allowed only while it is registered; revoking it stops it at once.
_Avoid_: runner token, runner allowlist

**Planning run**:
A read-only run that reads a milestone and its repository and drafts 3 to 10 tasks for staff to review. It never changes code and always uses Claude Code.
_Avoid_: planner job, auto-plan

**Build agent**:
The tool a project builds its milestones with: Claude Code or a Cursor cloud agent. Staff choose it per project; planning does not use it.
_Avoid_: driver, agent choice, tool

## Platforms

**Mac app**:
The Warehaus app on a staff Mac. It shows the Portal in its own window and runs the runner from the menu bar, showing Ready, Working, Paused or Needs attention. Staff download it from the Portal.
_Avoid_: runner app, desktop app

**Native bridge**:
The typed set of messages between the web Portal and a native shell such as the Mac app. The page uses it to report the attention feed, and the shell uses it to open a page. It is the only way the two talk.
_Avoid_: JS bridge, postMessage API

**Attention feed**:
What needs the signed-in person right now: the open Asks waiting on them and new alerts, already filtered by their notification preferences and leaving out their own actions. Every client shows the same feed.
_Avoid_: notification list, inbox

**Ask**:
A note that waits on one named staff member to answer it: an approval request or a blocked task. It stays open until that person answers. The Portal shows it as Needs you.
_Avoid_: needs Peter, needs attention

## Design

**Canonical screen**:
The one Figma screen for a view of a route, in its default populated state. Its 1440 Dark and 390 Dark frames are hand built; its Light frames are instances of them. Rules: `docs/design/figma-protocol.md`.
_Avoid_: screen version, final screen, v2

**Component set**:
A Figma component with all its looks as variants, such as every `State` of a Button. A component state lives here, never as its own screen.
_Avoid_: states frame, state screens

**Local component**:
An organism that only one Portal tab uses, kept in that tab page's Local components section. It moves to the library the second time another tab needs it.
_Avoid_: page component, one-off component

**Exploration**:
The section on a tab page for side-by-side options and proposals waiting on Peter. It is empty when nothing is open; the chosen option is applied to the canonical screen and the rest go to Archive.
_Avoid_: proposal section, iteration copy, sandbox
