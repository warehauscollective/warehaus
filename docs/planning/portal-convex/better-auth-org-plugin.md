# Better Auth organization plugin (local install)

**Status:** Contact.`orgId` remains the portal authorization SoT today.
The Better Auth `organization` plugin needs a **local install** of the
`@convex-dev/better-auth` component (schema generation) and a **named cloud
Convex project** — not supported on the stock npm component schema alone.

## Why deferred until cloud claim

1. Local install replaces the Better Auth Convex component with a generated
   schema that includes organization tables.
2. That requires regenerating component code and re-deploying — safest after
   `npx convex login` + a stable project (not anonymous agent mode).
3. Portal tenancy already works via Contacts → `orgId` + `clientQuery` wrappers.

## Runbook (when ready)

Follow: https://labs.convex.dev/better-auth/features/local-install

1. Claim/link portal Convex cloud project.
2. Local-install the Better Auth component into `apps/portal/convex/betterAuth/`
   (or the path the docs prescribe).
3. Add `organization()` to `createAuth` plugins and `organizationClient()` to
   `apps/portal/src/lib/auth-client.ts`.
4. Run Better Auth CLI generate for the component schema.
5. Map BA organizations ↔ portal `clients` (slug / External ID) — do **not**
   replace Contact join; keep Contact.`orgId` as the ACL key until mapping is
   proven in CI (`test:portal-convex` foreign-org tests).
6. Deploy and smoke-test login + host mismatch + staff directory.

## Until then

- Keep `plugins: [convex({ authConfig })]` only in [`apps/portal/convex/auth.ts`](../../../apps/portal/convex/auth.ts).
- Tenancy = Contact role + orgId + `assertHostMatchesOrg`.
