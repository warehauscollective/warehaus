# Expo auth path (Better Auth) — note only

**Status:** No `apps/native` scaffold yet. This note locks the intended path so
web and mobile share one auth + tenancy model.

## Today (web portal)

- Better Auth on the **portal Convex** deployment (`apps/portal/convex`).
- HTTP auth routes on `NEXT_PUBLIC_CONVEX_SITE_URL`.
- After sign-in: Contact join by email → `orgId` + role; Notion `Auth User ID`
  write when token is set.
- Client hosts: `assertHostMatchesOrg` — Host slug must match session org.

## Future (`apps/native`)

1. Use the **Better Auth Expo client** against the **same** Convex deployment
   (same `CONVEX_URL` / site URL auth routes as web).
2. Session → Contact join is unchanged (email match → `authUserId` on Contact).
3. **Host tenancy does not apply** on native — org comes only from the session
   Contact (`orgId`). Deep links may still carry a client slug for branding,
   but authorization must not trust the slug alone.
4. Reuse `@warehaus/logic` portal tab helpers and `@warehaus/ui` where platform
   files exist; do not import `apps/portal` Next routes.

## Out of scope until native scaffold

- Expo Router app shell
- Push notifications / device sessions
- Separate Convex project for mobile
