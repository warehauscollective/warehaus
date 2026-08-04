# `@warehaus/portal-sync`

Typed Notion → Convex allowlist contracts for the Warehaus portal.

This package is the **single source of truth** for:

- The seven in-bounds Notion collection IDs (plus out-of-bounds Second Brain IDs)
- Property → `CLIENT` / `SERVER` / `NEVER` tiers (fail closed on unknown props)
- Row-level sync gates
- Relation traversal refuse rules
- Client Docs body block allowlist
- File metadata types (Vercel Blob + Convex `_storage`)
- Activity client-type filter (project only; shipments dead)

Sync workers and Convex CLIENT serializers must import from here — do not duplicate maps.

## Scripts

```bash
npm run test:portal-sync
npm run typecheck -w @warehaus/portal-sync
```

## Specs

See `docs/planning/portal-convex/`.
