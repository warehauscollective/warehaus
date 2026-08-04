# Portal ops checklist (post Phase 1–5)

## Live Notion collection IDs — confirmed 2026-08-03

Parent: Warehaus Databases `3b1ffd60-316b-8099-a796-e5b47113fdc1`

| Key | Database page | Data source (collection) | Matches `portal-sync` |
| --- | --- | --- | --- |
| clients | `c59b8f00-…467794` | `5165ca6e-…76e61` | yes |
| projects | `da5371e2-…23adf9` | `39947c31-…c7e0e` | yes |
| tasks | `d02c4d14-…bd20a61` | `f418e8e8-…ae6d8a5` | yes |
| clientDocs | `eef3f956-…4b03136` | `50f364f7-…052fd19` | yes |
| sharedResources | `dbd7746a-…825a1cb0b` | `7215c759-…e5435fc` | yes |
| contacts | `87d7288c-…50851d50` | `b8e25824-…f03b3c8a` | yes |
| activity | `847a447c-…4aed318` | `d9e9c053-…b71538f` | yes |

Source of truth in code: `packages/portal-sync/src/collections.ts`.

No Shipments database under this parent (never existed live). Activity `Type`
select options are `project` · `team` · `sync` · `exception` only (`shipment`
removed 2026-08-04). Portal code still treats `shipment` as non-client if any
legacy rows appear.

## Contacts Auth User ID / External ID ownership

| Field | SoT | Mirror |
| --- | --- | --- |
| `contacts.authUserId` (Convex) | **Yes** — set on Contact join (`contacts.linkSession`) | — |
| `contacts.externalId` (Convex) | **Yes** — ensured on join (`wh_con_*`) | — |
| Notion Contacts `Auth User ID` | Mirror | Written by `notionAuth.pushContactAuthFields` on join |
| Notion Contacts `External ID` | Mirror (also may be authored in Notion) | Same action backfills if missing |

**Ops command (staff session required):** after deploy,
`npx convex run contacts:scheduleAuthBackfill` (or call from a staff-authenticated client).
Skips `seed-*` / `fixture-*` Notion page ids.

## Convex / Blob / Stripe env

Set on the **portal Convex deployment** (not only Next `.env.local`):

```bash
cd apps/portal
npx convex env set NOTION_WAREHAUS_TOKEN '…'          # Warehaus Portal integration
npx convex env set BLOB_READ_WRITE_TOKEN '…'         # Vercel Blob RW
npx convex env set STRIPE_WEBHOOK_SECRET 'whsec_…'   # when Stripe test mode ready
# optional until Checkout: STRIPE_SECRET_KEY
npx convex env set SITE_URL 'https://your-portal-host'
npx convex env set BETTER_AUTH_SECRET '…'
```

Webhook URLs:

- Notion → `${NEXT_PUBLIC_CONVEX_SITE_URL}/notion/webhook`
- Stripe → `${NEXT_PUBLIC_CONVEX_SITE_URL}/stripe/webhook`

### Cloud project claim

Local anonymous Convex (`CONVEX_AGENT_MODE=anonymous`) is fine for dev.
For production:

1. `npx convex login`
2. `npx convex dev` / link a named project under the Warehaus team
3. Re-set all env vars on that deployment
4. Then run Better Auth **local install** for the organization plugin
   (see [`better-auth-org-plugin.md`](./better-auth-org-plugin.md))

### Cost alarms

See [`storage-retention.md`](./storage-retention.md) checklist (Vercel Blob + Convex usage alerts).
