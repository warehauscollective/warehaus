# Portal multi-tenant subdomains

One Next.js app (`apps/portal`) serves Warehaus team and per-client portals via the **Host** header. **Convex** is the system of record; Host is routing / branding, authorization is session + `orgId`.

## Host matrix

| Surface | Preview / Vercel | Custom domain (later) | Who |
| --- | --- | --- | --- |
| Team | `portal.warehaus.vercel.app` | `portal.warehaus.co` | Warehaus operators |
| Client | `{slug}.warehaus.vercel.app` | `{slug}.warehaus.co` | That client only |

Examples:

- Team: `portal.warehaus.vercel.app`
- Demo client: `client-portal.warehaus.vercel.app` (slug `client-portal`)

Apex / bare `localhost` also resolve as **team**.

## Local DX

Modern browsers resolve `*.localhost` without `/etc/hosts`:

| URL | Tenant |
| --- | --- |
| `http://localhost:3100` | Team |
| `http://portal.localhost:3100` | Team |
| `http://client-portal.localhost:3100` | Client North Bay / `client-portal` |

## Client ACL (strict)

Authorization is Better Auth session → Contact → `orgId`, plus `assertHostMatchesOrg` on client hosts.

| Surface | Rule |
| --- | --- |
| Clients | Session org only (`clientQuery`); staff directory via `adminQuery` |
| Projects / Tasks | `orgId` index + Publish gates |
| Activity | Client: project types only (no shipment). Staff: also sync/exception |
| Resources | Published Shared Resources for org + Convex-native uploads |
| Sync | Convex cron / webhook / `sync/pull:pullAll` — never client-initiated |

Legacy `/api/data` memory path and Postgres dualStore are **removed**. `/api/sync` returns **410**.

## Env

```bash
ROOT_DOMAINS=warehaus.vercel.app,warehaus.co,localhost
TEAM_SUBDOMAIN=portal
NEXT_PUBLIC_CONVEX_URL=…
NEXT_PUBLIC_CONVEX_SITE_URL=…
```

Swapping `vercel.app` → custom domain only requires updating DNS + `ROOT_DOMAINS` (and Vercel domains). Middleware host rules stay the same.

## Data model

Notion **Clients** (synced into Convex `clients`):

| Field | Role |
| --- | --- |
| External ID | Stable key (`wh_cli_*`) |
| Slug | Public subdomain (`client-portal`), unique kebab-case |
| Portal access | `Enabled` / `Disabled` — disabled orgs cannot join |

## Request flow

1. `middleware.ts` parses Host → `x-warehaus-tenant-mode` + `x-warehaus-slug`
2. AuthGate requires login; Contact join binds user → org
3. `usePortalData` → `portalData.getSnapshot` (Convex), scoped by session org + host match
4. Staff Account → Clients uses `clients.listDirectory` (cross-org counts)

## Vercel domains

On the `warehaus-portal` project (root `apps/portal`):

1. Add `portal.warehaus.vercel.app`
2. Add wildcard `*.warehaus.vercel.app`
3. Later: add `portal.warehaus.co` + `*.warehaus.co` and append `warehaus.co` to `ROOT_DOMAINS` (already defaulted)

## Auth

Better Auth on Convex. Host tenancy must match session org on client subdomains; staff use team host.
