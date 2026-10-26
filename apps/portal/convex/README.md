# Portal Convex backend

Separate Convex deployment for the Warehaus **client/admin portal**. Do not share
this deployment with Motoko / agent memory.

## First-time setup

Two Convex environments only: production `unique-turtle-383`, and one shared dev deployment for Peter's Mac and cloud agents. Do not create a second dev deployment.

The one-time Mac setup (Convex login, the shared dev deployment, read-only Notion token, first pull, staff login) and the deploy policy are in `LOCAL_DEV.md` at the repo root.

`npm run dev:convex` runs the preflight, then `convex dev`, which pushes functions to the shared dev deployment already named in `.env.local`. Cloud agents do not run it unless the PR changes `convex/`. When they do, the PR says so.

Set `SITE_URL` and `BETTER_AUTH_SECRET` on that shared dev deployment with `npx convex env set` from `apps/portal`. Do not commit the values. Names are in `../.env.example`.

## Auth model

- Better Auth via `@convex-dev/better-auth` (email/password to start).
- Tenancy join: `contacts.authUserId` → Better Auth subject.
- Authorization: `clientQuery` / `clientMutation` / `adminQuery` / `adminMutation`
  in `_lib/wrappers.ts` — no public function should call raw `ctx.db` for tenant data.
- Host slug must match session org for client roles (`assertHostMatchesOrg`).

Organization plugin (Better Auth local install) is a follow-up once this project
is provisioned; Contact.orgId is already the portal ACL source of truth.

## Login + Contact join

1. On a Mac, start Convex: `npm run dev:convex` (pushes to the shared dev deployment; cloud agents skip this unless the PR changes `convex/` functions)
2. Seed demo tenants (internal — CLI only, not the browser): `npx convex run seed:seedDemoTenants`
3. Open **`/login`** (portal UI is gated — unauthenticated users cannot enter)
4. **Create password** for an enabled client contact such as `demo@northbay.test`.
   Staff emails cannot self-register. After the account is verified, `contacts.linkSession`
   binds the Better Auth user → Contact.
5. `contacts.linkSession` schedules a Notion `Auth User ID` write when `NOTION_WAREHAUS_TOKEN` is set
6. Sign out from Account → Profile (returns to `/login`)

Email verification is required before a session can link a contact. Verification mail uses the
same Resend env as password reset (`RESEND_API_KEY`, optional `EMAIL_FROM` / `EMAIL_REPLY_TO`).
`SITE_URL` must be the portal origin so links point at this app.

### Staff links (not self-serve)

`linkSession` will not claim a Warehaus Staff contact, and there is no HTTP header that can.
Create the verified user and link it with one internal action (not callable from the browser):

```bash
npx convex run staffProvision:provisionStaffUser \
  '{"email":"peter@warehaus.co","name":"Peter","password":"<password>"}'
```

Run that from a private shell. The password is a function argument. Do not pass
`BETTER_AUTH_SECRET`. The password must be at least 12 characters with mixed case and a
number or symbol. The action sets `emailVerified: true` and links the staff contact. If that email already
has a Better Auth user, it deletes that user's sessions before resetting the password.

Review contacts linked to unverified users without unlinking them:

```bash
npx convex run contacts:listLinkedUnverifiedContacts
```

Seed and demo rows (read-only):

```bash
npx convex run seed:listSeededRecords
```

## Tests (no deployment required)

```bash
npm run test:portal-convex
```
