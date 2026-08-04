# Warehaus Monorepo — Website + Portal Architecture Plan

> Status: **active plan** — Phase A scaffolding has started (`turbo`,
> `apps/portal`, package-level tokens CSS, `@warehaus/logic` portal IA).
>
> Companion to [`design-system-ecosystem.md`](./design-system-ecosystem.md).
> Where the two differ, **this doc wins** on app naming and app boundaries.

---

## 1. What you asked for (scope)

| Surface | Exists today | Target | React Native later? |
| --- | --- | --- | --- |
| Marketing **website** | Yes — `apps/web` | Stay its own Next.js app | **No** |
| Client **portal** | Design-only (style guide + nav config) | Separate Next.js app in the monorepo | **Yes** (Expo) |
| Shared system | Partial — `@warehaus/tokens` | Tokens + UI + logic packages | Yes (via platform files) |

Goals:

1. Keep the website clean (marketing / brand / content).
2. Keep the portal its own product environment (auth, density, data work).
3. Reuse the same libraries, styles, structure, and frontend paradigms.
4. Leave a clean runway for a React Native portal without forcing the website into RN.

---

## 2. Current-state diagnosis

### 2.1 Monorepo maturity

| Layer | Status | Notes |
| --- | --- | --- |
| Workspace layout | **In place** | npm workspaces: `apps/*`, `packages/*` |
| Deployable apps | **Two** | `@warehaus/web`, `@warehaus/portal` |
| Shared packages | **Growing** | `tokens`, `ui`, `logic`, `typescript-config` |
| Turborepo | **In place** | Root scripts filter web / portal |
| Package manager | **npm** | Staying on npm workspaces for now |
| Portal app | **Scaffolded** | Shell + dock + tab routes; no auth yet |
| Native app | **Does not exist** | Intentionally later |

Phase 0 from the ecosystem plan is **partially complete**: the Next app lives under
`apps/web`, and tokens generate CSS. Phases 1–3 (extract `ui` / `logic`,
scaffold portal/native) are still ahead.

### 2.2 What lives inside `apps/web` today

Everything product-shaped is still colocated in the marketing app:

```
apps/web/
├─ app/                 # Next App Router routes (home, pillars, codex, style-guide, …)
├─ src/
│  ├─ components/
│  │  ├─ layout/        # AppShell, BottomNav, MenuOverlay, ChatOverlay  ← shared chrome
│  │  ├─ providers/     # LayoutProvider (website + portal tab unions mixed)
│  │  ├─ react/ui/      # Bevel, BevelFrame, typography, logo, …
│  │  ├─ react/hero|three|chat|panels|animations  ← mostly website
│  │  └─ pages/         # Page compositions + styleguide (incl. PortalPanel docs)
│  ├─ hooks/            # useSwipeTabs, scroll, fade, typewriter
│  ├─ lib/data/         # navTabs (includes PORTAL_TABS), worlds, codex, …
│  └─ styles/           # global.css + tokens.generated.css
├─ .storybook/          # Storybook still app-local (not packages/ui yet)
└─ scripts/build-tokens.mjs
```

### 2.3 Portal is designed, not shipped

Strong product intent already exists — but only as documentation and nav config:

- Style guide tab **Portal** → `PortalPanel.tsx` defines app shell, data/forms,
  flows (onboarding, create project), chamfer usage in dense UI.
- `navTabs.ts` already declares `PORTAL_TABS` for path `/portal`
  (`portal` | `projects` | `chatroom` | `activity` | `account`).
- `LayoutProvider` already includes `PortalTab` in the shared `ActiveTab` union.
- **There is no `app/portal/` route** and no auth. The dock would show portal
  tabs only if that path existed.

Implication: the portal is a **first-class product surface already in the design
system**, not a vague future idea. The monorepo split should match that intent
instead of nesting portal screens forever under the marketing app.

### 2.4 What is already portable vs web-only

| Piece | Portable soon? | Why |
| --- | --- | --- |
| `@warehaus/tokens` scalars + colors | **Yes** | JS source; CSS emit for web; object import for RN |
| `navTabs` / tab-set pattern | **Yes** | Pure data + types |
| `useSwipeTabs` and similar hooks | **Mostly** | Pure React; drop DOM-only bits per platform |
| `Bevel` / `BevelFrame` | **API yes, impl no** | Needs `.web.tsx` / `.native.tsx` (SVG + measure APIs differ) |
| BottomNav / AppShell | **Pattern yes** | Same chrome concept; portal vs website tab sets; RN needs a native shell |
| Hero / Three.js / GSAP marketing | **Website only** | Never share into portal or native |
| Style guide page compositions | **Website only** | Docs live with the marketing/design surface |
| Chat overlay (marketing AI chat) | **Split carefully** | Portal “chatroom” is product chat; marketing chat is a different job |

### 2.5 Coupling risks if we do nothing

If portal features are added as `apps/web/app/portal/**`:

1. **Bundle / dependency bleed** — marketing pulls auth, tables, forms; portal
   pulls Three.js / GSAP / hero stacks unless aggressively code-split.
2. **Deploy coupling** — one Vercel project, one domain story, one blast radius
   for every release.
3. **Mental model blur** — style guide already treats Brand / Website / Portal as
   three systems; the repo should too.
4. **RN dead end** — a `/portal` route inside the marketing Next app does not
   map cleanly to Expo; shared packages do.

---

## 3. Target architecture (recommended)

### 3.1 Top-level layout

```
warehaus/
├─ apps/
│  ├─ web/                 # Marketing website (Next.js) — public, brand-led
│  ├─ portal/              # Client portal (Next.js) — authenticated product
│  └─ native/              # Expo portal (later) — same product, mobile
├─ packages/
│  ├─ tokens/              # @warehaus/tokens — already exists
│  ├─ ui/                  # @warehaus/ui — shared primitives (platform files)
│  ├─ logic/               # @warehaus/logic — hooks, nav config, pure state
│  ├─ portal-sync/         # @warehaus/portal-sync — Notion→Convex allowlists
│  ├─ typescript-config/   # shared tsconfig bases
│  └─ eslint-config/       # shared lint presets (optional early)
├─ docs/
│  ├─ design-system-ecosystem.md
│  ├─ portal-multi-tenant.md
│  ├─ planning/portal-convex/           # migration SoT (Convex + Notion authoring)
│  ├─ notion-sync-architecture.md       # historical dual-space notes (obsolete for portal runtime)
│  └─ monorepo-portal-architecture.md   ← this file
├─ package.json            # workspace root scripts via turbo
└─ turbo.json              # build/lint/typecheck/test orchestration
```

**Naming decision:** call the product app **`portal`**, not `app`.
The style guide, nav config, and product language already say “portal.”
Keep that vocabulary in folder names, package names, and deploy projects.

### 3.2 Hard boundary rules

1. **`apps/*` are deployables.** They never import each other.
2. **Shared code only via `packages/*`.** If website and portal both need it,
   extract it — do not reach across apps.
3. **Website-only stays in `apps/web`.** Hero, Three.js, GSAP marketing motion,
   codex/content pages, style-guide page shells.
4. **Portal-only stays in `apps/portal`.** Auth gates, tables, forms, operator
   flows, account settings, product chatroom.
5. **Native only mirrors the portal.** `apps/native` consumes the same
   `@warehaus/ui` + `@warehaus/logic` (+ tokens). There is no `apps/native-web`
   and no RN build of the marketing site.
6. **One design language, two densities.** Same tokens, type, chamfer, dock
   pattern — portal is denser and task-oriented; website is atmospheric.

### 3.3 Package responsibilities

#### `@warehaus/tokens` (exists)

- Source of truth for spacing, type scale, shape (`cut` / radius), motion,
  semantic + pillar colors.
- Web: generate CSS variables (today’s `tokens.generated.css` pipeline).
- Native: import the JS maps into `StyleSheet` / NativeWind theme.
- Next: move remaining chrome tokens still hard-coded in `global.css`
  (`--nav-*`, glass, panel) into tokens when both apps need them.

#### `@warehaus/ui` (to create)

Shared visual primitives with a **single import path**:

```ts
import { Bevel, BevelFrame, Button, Text, Heading } from '@warehaus/ui';
```

Platform resolution (Metro / bundler extensions):

| File | Runtime |
| --- | --- |
| `Bevel.tsx` or `Bevel.web.tsx` | Next (website + portal) |
| `Bevel.native.tsx` | Expo |

Start with what both surfaces already need:

- `Bevel`, `BevelFrame`
- Typography (`Heading`, `Text`, `Eyebrow`, `Mono`)
- `WarehausLogo`
- `useSwipeTabs` + `SwipeTabView` (standard left/right tab page shell)
- Buttons / inputs / status (as portal work forces them)
- Nav dock primitive (presentational); apps wire route-specific tab data

Keep Storybook on this package (move off `apps/web` when extracted).

#### `@warehaus/logic` (to create)

Framework-agnostic (or React-only, DOM-free) pieces:

- `ROUTE_TAB_SETS` / `getNavTabsForPath` pattern → generalize to
  `getNavTabsForSurface(surface, path)`
- `PortalTab` / pillar tab types
- Swipe-tab / gesture helpers that don’t assume `window`
- Future: API clients, zod schemas, permission helpers

#### Config packages

Shared `tsconfig` / eslint so `web` and `portal` stay on the same TypeScript
and lint paradigms without copy-paste drift.

### 3.4 App responsibilities

#### `apps/web` — Website

- Public marketing: home pillars, about, contact, codex, dream/design/develop.
- Style guide remains here (Brand / Website / Portal **documentation**).
- Uses `@warehaus/ui` + `@warehaus/tokens` + `@warehaus/logic`.
- May keep website-only chrome wrappers (e.g. marketing chat overlay).
- **No auth product shell.** Links to portal domain for “log in.”

#### `apps/portal` — Portal

- Authenticated product on the `portal.` subdomain: portal home (`/`),
  projects, chatroom, activity, account (tabs in `@warehaus/logic`).
- Own `AppShell` composition: same dock paradigm, portal tab set, portal menu.
- Own Next root layout, env, middleware/proxy for auth.
- Uses the same `@warehaus/ui` / `tokens` / `logic`.
- **Does not import** Three.js scenes, marketing heroes, or style-guide pages.

#### `apps/native` — later

- Expo app of **portal only**.
- Reuses tokens + logic + `*.native.tsx` UI.
- No attempt to port the marketing site.

### 3.5 Frontend paradigms to preserve (both Next apps)

Keep these consistent so the two apps feel like one system:

| Paradigm | Keep |
| --- | --- |
| Next App Router | Both `web` and `portal` |
| React 19 + client islands where needed | Same patterns for interactive chrome |
| Tailwind v4 + CSS variables from tokens | Same `@theme inline` bridge pattern |
| Eurostile display + Geist body/mono | Shared font loading approach (or shared font package later) |
| Chamfer / Bevel as brand signature | From `@warehaus/ui`, not forked copies |
| Route-aware floating dock | Same component family; different tab data |
| Theme: dark default + `.light` class | Shared token themes |
| Storybook + Chromatic | On `packages/ui` for shared visuals |

Portal-specific paradigm additions (do **not** force onto website):

- Auth session boundary (Clerk / Auth.js / etc. — decide when scaffolding)
- Data tables, forms, empty states, toasts
- Higher information density, less marketing motion

### 3.6 Deployment model (Vercel)

Two Vercel projects from one repo (standard monorepo pattern):

| Project | Root directory | Domain example |
| --- | --- | --- |
| `warehaus-web` | `apps/web` | `warehaus.co` / `www` (local **:3000**) |
| `warehaus-portal` | `apps/portal` | `portal.warehaus.co` + `*.warehaus.co` (local **:3100**, not :3001). See `docs/portal-multi-tenant.md`. |

- Ignored build step / Turbo filter so each project only builds its app + deps.
- Separate env vars (portal gets auth + API secrets; website stays lean).
- Website CTA “Enter portal” → portal origin; never deep-merge routes long-term.

Optional later: `apps/native` via EAS; unrelated to Vercel web deploys.

---

## 4. Cross-platform strategy (portal web → portal native)

The ecosystem doc’s three options still apply. **Recommendation for Warehaus:**

### Recommended: Path B — shared tokens + shared contracts, idiomatic stacks

- **Web (website + portal):** Next.js + Tailwind + `@warehaus/ui` web impls.
- **Native (portal only):** Expo + NativeWind (or StyleSheet) + `@warehaus/ui`
  native impls.
- **Share:** tokens, logic, component **APIs**, chamfer math.
- **Do not share:** DOM marketing effects, Radix-only primitives without a
  native twin, Three.js.

Why not Tamagui (Path A) as the default now?

- The website is already deep into Next + Tailwind + custom Bevel measurement.
- Only the **portal** needs native — forcing the marketing site through
  `react-native-web` would be cost without benefit.
- Path B lets portal native grow when ready without rewriting the website.

Revisit Tamagui only if portal native becomes the primary surface and web portal
is secondary.

### Platform file convention

```
packages/ui/src/bevel/
  chamferPath.ts          # pure math (shared)
  Bevel.tsx               # web default (Next)
  Bevel.native.tsx        # Expo
  types.ts                # shared props
```

Callers never import `.native` / `.web` suffixes directly.

---

## 5. What to extract vs what to leave

### Extract to packages early (high leverage)

1. Tokens pipeline ownership — move `apps/web/scripts/build-tokens.mjs` to
   `packages/tokens` (or a tiny `tokens` build script at package level) so both
   apps can `prebuild` the same CSS emit.
2. `Bevel`, `BevelFrame`, typography, logo → `@warehaus/ui`.
3. Nav tab types + `getNavTabsForPath` → `@warehaus/logic` (split website vs
   portal tab registries so marketing data doesn’t ship into portal bundles).
4. `cn()` + future `cva` variants → `@warehaus/ui` or `@warehaus/logic`.

### Leave in `apps/web`

- All `components/pages/*` marketing compositions
- Hero / Three / GSAP / Particle stacks
- Style guide **pages** (they may *import* portal specimens from `@warehaus/ui`)
- Marketing chat overlay copy/flow

### Create fresh in `apps/portal`

- Auth layout + middleware
- Dashboard / projects / chatroom / activity / account routes
- Data table + form patterns (can graduate into `@warehaus/ui` once stable)
- Portal menu content (operator nav, not marketing sitemap)

### Do not copy-paste

If you find yourself duplicating `BottomNav.tsx` into portal, stop and extract
the presentational dock + a thin app-level adapter for tab config.

---

## 6. Migration phases (shippable increments)

Each phase should leave `main` green and the website visually unchanged unless
the phase’s goal says otherwise.

### Phase A — Tooling skeleton (no UX change)

- [x] Add Turborepo (`turbo.json`) with `build` / `lint` / `typecheck` / `tokens`.
- [x] Root scripts: `turbo run dev --filter=@warehaus/web` / `@warehaus/portal`.
- [x] Stay on **npm** workspaces (documented in README).
- [x] Add `packages/typescript-config`.
- [x] Update root README for the monorepo.
- [x] Scaffold thin `apps/portal` on shared tokens + `@warehaus/logic` portal tabs.
- [x] Move token CSS emit to `packages/tokens` (`@warehaus/tokens/css`).

### Phase B — Shared packages from existing code

- Create `@warehaus/ui` and `@warehaus/logic`.
- Move Bevel family + typography + logo; point `apps/web` at workspace packages
  (`transpilePackages`).
- Move Storybook toward `packages/ui` (or keep temporary dual until stable).
- Split nav config: website tab sets vs portal tab sets in `@warehaus/logic`.

### Phase C — Scaffold `apps/portal`

- Next.js app mirroring web’s tooling (Tailwind 4, tokens import, fonts).
- Minimal shell: login placeholder + empty dashboard using shared `BottomNav`
  paradigm + `PORTAL_TABS`.
- Wire Vercel project (preview deploys) with root `apps/portal`.
- Website gains a single “Portal” link to the portal origin (not an in-app fake).

### Phase D — Portal product surface

- Auth provider + protected routes.
- Implement tab routes from the style guide flows (start with one vertical:
  e.g. projects list → detail).
- Promote repeated portal primitives into `@warehaus/ui`.

### Phase E — Native portal (when ready)

- Expo app in `apps/native`.
- Implement `*.native.tsx` for Bevel + shell.
- Share logic/types; accept that some forms/tables are re-authored for mobile UX.

---

## 7. Explicit non-goals

- No React Native marketing website.
- No forever-`/portal` route living inside `apps/web` as the real product
  (a short-lived prototype route is OK only if deleted once `apps/portal` exists).
- No sharing Three.js / GSAP hero stacks into portal.
- No apps importing other apps.
- No blocking portal scaffold on Tamagui / full token completion — Path B +
  existing tokens is enough to start.

---

## 8. Decisions to confirm

| # | Decision | Recommendation |
| --- | --- | --- |
| 1 | App name | **`apps/portal`** (not `apps/app`) |
| 2 | Package manager | Pick **one**: stay npm *or* move pnpm; add Turbo either way |
| 3 | Cross-platform UI | **Path B** (shared tokens/contracts; idiomatic web + Expo) |
| 4 | Portal domain | `portal.` or `app.` subdomain — product call |
| 5 | Auth vendor | Defer to Phase C scaffold; keep `@warehaus/logic` free of vendor lock-in at the edges |
| 6 | Storybook home | Move to `packages/ui` once extraction lands |
| 7 | Style guide location | Remains on **website**; documents portal patterns by importing shared UI |

---

## 9. Immediate next step (when you say go)

**Phase A + scaffold empty `apps/portal` with shared tokens only** — before large
feature work. That locks the boundary early, keeps the website clean, and makes
every later extraction an obvious “move to package” rather than “untangle from
marketing.”

Do **not** wait for full `@warehaus/ui` extraction to create the portal app
folder; create the app thin, then extract as the first portal screens need
shared primitives.

---

## 10. Traceability to existing docs & code

| Existing signal | How this plan uses it |
| --- | --- |
| `docs/design-system-ecosystem.md` | Still the design-system + RN technical plan; app folder renamed `app` → **`portal`** |
| Style guide Portal panel | Spec for portal density, shell, flows |
| `PORTAL_TABS` in `navTabs.ts` | Becomes portal app IA; lives in `@warehaus/logic` |
| `@warehaus/tokens` | Foundation both apps consume from day one |
| Storybook in `apps/web` | Interim; migrates with `@warehaus/ui` |

---

*Update this file when app boundaries or package ownership change.*
