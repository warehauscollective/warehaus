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
