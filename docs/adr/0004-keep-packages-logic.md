# ADR-0004: Keep packages/logic as its own package

Status: Accepted, Claude on Peter's instruction, 2026-11-24.

Peter asked for every architecture review candidate to be worked through without him, with Claude's recommended answers accepted ("Auto accept all of your grill questions and recommendations"). This is candidate 12 of the 2026-11-23 review: fold `packages/logic` into the portal.

## Context

`packages/logic` (`@warehaus/logic`) is about 85 lines: the portal tab set, `getPortalTabsForMode`, `getPortalTabForPath` and `isPortalTab`. Today its only consumer is `apps/portal`, which imports it in about 15 files. `apps/web` lists it in `transpilePackages` but does not import it.

On the deletion test alone, it is a shallow package with one consumer and could be folded into `apps/portal/src/lib/nav`.

## Decision

Keep it as its own package. Do not fold it into the portal.

## Why

- The plan in `docs/design-system-ecosystem.md` (Phase 3) gives it a second consumer: `apps/native`, the Expo portal, which must share the same tabs and routing. The package header says the same. With two consumers it is a real seam, not a hypothetical one.
- The review itself rated the fold "Speculative, low value either way". Folding it now and splitting it out again for native would be churn for no gain.
- The cost of keeping it is small: one workspace entry and one CI path filter.

## Considered options

- **Fold it into `apps/portal/src/lib/nav`.** Rejected for the reasons above. Reopen this if the native app is dropped from the plan.

## Consequences

- Future architecture reviews should not suggest folding `packages/logic` while `apps/native` stays planned.
- Portal-only navigation code with no chance of being shared (deep links, dock layering) stays in `apps/portal/src/lib/nav`, not in this package.
