# Blob + Convex storage retention

Portal uses two storage planes. Neither serves Notion S3 URLs to browsers.

| Plane | Use | Access |
| --- | --- | --- |
| **Vercel Blob** | Notion → portal Shared Resources / doc images | Public URLs with unguessable pathnames (`orgId` + hash) |
| **Convex `_storage`** | Client uploads | Short-lived URLs via authenticated queries only |

## Pathnames

Blob path helper: `@warehaus/portal-sync` `blobPathname`. Always include `orgId`
so leaks are scoped and GC can key by org.

## Retention rules (v1)

1. **Published Shared Resources** keep their Blob copy while `publishToWarehaus`
   and not archived.
2. **Unpublished / archived** Shared Resources: Blob GC cron deletes the Blob
   object (when `BLOB_READ_WRITE_TOKEN` is set) and clears Convex `blobUrl` /
   `blobPathname` fields.
3. **Rejected client uploads** delete `_storage` immediately on reject.
4. **Infected scan path** deletes `_storage` (when scan stub lands).
5. Rotate `BLOB_READ_WRITE_TOKEN` if exposed; old public URLs may linger until
   GC or Blob project wipe.

## Cost alarms (ops checklist)

Enable manually in dashboards (no code hooks yet):

- [ ] Vercel → Blob usage / bandwidth alert for the portal project
- [ ] Convex → deployment storage / bandwidth alert for the portal deployment
- [ ] Review orphan GC logs weekly after first production traffic

## Cron

`apps/portal/convex/crons.ts` → `sync/blobGc:gcUnpublishedSharedBlobs` (daily).
Skips cleanly when `BLOB_READ_WRITE_TOKEN` is unset (local anonymous).
