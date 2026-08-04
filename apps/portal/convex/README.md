# Portal Convex backend

Separate Convex deployment for the Warehaus **client/admin portal**. Do not share
this deployment with Motoko / agent memory.

## First-time setup

From `apps/portal`:

```bash
npm run dev:convex
```

That creates/links a Convex project, writes `CONVEX_DEPLOYMENT` +
`NEXT_PUBLIC_CONVEX_URL` into `.env.local`, and generates `convex/_generated/`.

Then set Convex env vars:

```bash
npx convex env set SITE_URL http://localhost:3100
npx convex env set BETTER_AUTH_SECRET "$(openssl rand -base64 32)"
```

Copy the public Convex URLs into `.env.local` (see `../.env.example`).

## Auth model

- Better Auth via `@convex-dev/better-auth` (email/password to start).
- Tenancy join: `contacts.authUserId` → Better Auth subject.
- Authorization: `clientQuery` / `clientMutation` / `adminQuery` / `adminMutation`
  in `_lib/wrappers.ts` — no public function should call raw `ctx.db` for tenant data.
- Host slug must match session org for client roles (`assertHostMatchesOrg`).

Organization plugin (Better Auth local install) is a follow-up once this project
is provisioned; Contact.orgId is already the portal ACL source of truth.

## Login + Contact join

1. Start Convex: `npm run dev:convex`
2. Seed demo tenants: `npx convex run seed:seedDemoTenants`
3. Open **`/login`** (portal UI is gated — unauthenticated users cannot enter)
4. **Create password** / sign in for `demo@northbay.test` (or `team@warehaus.co` for staff)
5. `contacts.linkSession` binds Better Auth user → Contact and schedules Notion
   `Auth User ID` write when `NOTION_WAREHAUS_TOKEN` is set on the Convex deployment
6. Sign out from Account → Profile (returns to `/login`)

## Tests (no deployment required)

```bash
npm run test:portal-convex
```
