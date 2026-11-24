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
