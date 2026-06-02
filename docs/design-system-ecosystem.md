# Warehaus Design-System Ecosystem — Architecture Plan

> Status: **proposal / decision doc**. No code has changed. This captures the
> target architecture for growing the Warehaus UI into a managed system that
> spans a **marketing website**, a **web app**, and eventually a **React Native
> app**, with good performance across devices.

---

## 1. Goals & constraints

- One coherent system: tokens + components shared as the surface area grows.
- Three runtime targets: **web (Next.js)**, **web app**, **React Native (Expo)**.
- Performance across devices (mobile → desktop → native).
- Living documentation + isolation for development and visual testing.
- Preserve the brand signature — the painted **45° chamfer** (`Bevel`/`BevelFrame`),
  the ink/paper monochrome palette, Eurostile + Geist, rem-based spacing/shape.

---

## 2. Current-state assessment (honest)

What exists today is **web-only at the foundation** and will not port to React
Native as-is:

| Piece | Today | RN reality |
| --- | --- | --- |
| Tokens | CSS custom props in `global.css` (`var(--s-*)`, `--cut`, palette…) | RN has no CSS variables |
| `Bevel` / `BevelFrame` | inline `<svg>` painted, measured via `getBoundingClientRect` + `ResizeObserver`; `clip-path`, `color-mix()` | needs `react-native-svg` + `onLayout`; no clip-path/color-mix |
| Styling | heavy inline `style={{ var(--token) }}`, some Tailwind | RN uses `StyleSheet`/props; Tailwind needs NativeWind |
| Effects | `backdrop-filter`, theme via `.light` class | not available in RN |
| Logic (good) | `useSwipeTabs`, `navTabs` config, inspector store | mostly portable (pure TS/React) |

**Implication:** the multi-platform question is not a Storybook question — it's a
**tokens + styling-layer** question. Storybook organizes whatever we choose; it
doesn't make components cross-platform.

Also worth noting for "efficiency": we lean on inline styles with no variant
system (`cva`) and barely use the existing `cn()` util (`src/lib/utils/cn.ts`).
Even staying web-only, a variant layer would reduce sprawl.

---

## 3. Target architecture

### 3.1 Monorepo (Turborepo + pnpm workspaces)

```
warehaus/
├─ apps/
│  ├─ web/            # marketing site (Next.js)  ← current app moves here
│  ├─ app/            # web app (Next.js or Vite)
│  └─ native/         # Expo / React Native (later)
├─ packages/
│  ├─ tokens/         # source of truth → emits CSS vars + TS + native
│  ├─ ui/             # cross-platform components (Bevel, Button, …)
│  ├─ ui-web/         # web-only impls if needed (or .web.tsx files)
│  ├─ logic/          # framework-agnostic hooks/state (useSwipeTabs, navTabs)
│  └─ config/         # eslint/tsconfig/tailwind presets
└─ .storybook/ (per UI package)
```

Turborepo gives cached builds, parallel tasks, and clean dependency boundaries.

### 3.2 Tokens pipeline — **the real foundation** (do this first)

A `packages/tokens` source (JSON or TS) is transformed by **Style Dictionary**
into platform outputs:

- **Web:** `:root { --s-4: 1rem; --cut: 1.375rem; … }` (replaces the hand-written
  block in `global.css`) + a typed TS map.
- **Native:** a TS object (`tokens.spacing[4]`, `tokens.color.ink`) for RN
  `StyleSheet`.
- **Types:** autocomplete + safety everywhere.

Tokens to model from what we already have: ink/paper + neutral scale, the
pillar colors (dream/design/develop), `--s-*` spacing, the fluid `--t-*` type
scale, shape (`--radius`, `--cut`, `--cut-lg`), motion, and the `--nav-*` set.
The chamfer geometry (rem) lives here too.

### 3.3 Component layer — the open decision (see §6)

Three viable paths, each with the same **platform-API pattern**: one component
contract, platform implementations resolved by Metro/bundler extension
(`Bevel.tsx` web, `Bevel.native.tsx` native) — callers import `@warehaus/ui`.

- **A. Tamagui** — one API compiles to web (react-native-web) + native; built-in
  tokens + Storybook; strong perf. Most reuse; new ecosystem; rebuild `Bevel` on
  its primitives + `react-native-svg`.
- **B. Shared tokens, separate stacks** — web = Next + Tailwind/shadcn; native =
  Expo + NativeWind; share tokens + `logic`. Most idiomatic/performant per
  platform; visual components authored twice behind a shared API.
- **C. NativeWind + react-native-web** — Tailwind as the single styling language
  on both; lighter than Tamagui; chamfer SVG + cross-platform perf need care.

shadcn (from the earlier discussion) is **web-only** (Radix = DOM); it can be the
web primitive layer in Path B, but it is not the cross-platform answer.

### 3.4 The chamfer `Bevel`, cross-platform

- Extract the **path math** (`chamferPath`) into `packages/ui` as a pure,
  platform-agnostic util (already isolated logic).
- Web impl: current inline `<svg>` + `ResizeObserver`.
- Native impl: `react-native-svg` `<Svg><Path>` sized via `onLayout`.
- Same props API (`corners/cut/shoulder/radius/perCorner`, rem). `BevelFrame`'s
  even-odd ring → web `clip-path` vs native two-path SVG.

### 3.5 Storybook

- **Now:** `@storybook/nextjs` (or `react-vite`) in `packages/ui` documenting
  the existing components and every variant/state.
- **Addons:** a11y, viewport (use the original `DESIGN-MANIFEST` matrix:
  360/390/430/820/1024/1366/1440/1920), interaction tests.
- **Visual regression:** Chromatic in CI — catches unintended visual diffs as the
  system grows (this is the "managed efficiently as we grow" payoff).
- **Native later:** separate `@storybook/react-native` in `apps/native`.

### 3.6 Performance notes

- Prefer **compile-time / class-based styling** over per-instance JS where
  possible. The current `Bevel` measures **every instance** (`ResizeObserver`) +
  re-renders an SVG — fine for dozens, a cost at hundreds. Mitigations: memoize,
  only measure when geometry depends on size, and consider a CSS-only bevel
  fallback for simple cases.
- Web: keep heavy/dev-only pieces (the Leva inspector) code-split & dev-gated
  (already done).
- Native: avoid layout thrash; lean on `react-native-svg` caching; NativeWind/
  Tamagui compile styles.

---

## 4. Migration phases (each independently shippable, low-risk)

- **Phase 0 — Tokens + monorepo skeleton.** Stand up Turborepo, move the app to
  `apps/web`, create `packages/tokens` and generate today's `global.css` block
  from it. No visual change. *Highest leverage, lowest risk.*
- **Phase 1 — Storybook (web).** Add Storybook to `packages/ui`; write stories
  for `Bevel`, `BevelFrame`, `Card`, `DsButton`, inputs, the rail, etc. Add a11y
  + viewport addons.
- **Phase 2 — `ui` package + variants.** Extract components into `packages/ui`;
  introduce `cva` + `cn()` to replace inline-style sprawl with managed variants;
  move `logic` (hooks, nav config, swipe state) to `packages/logic`.
- **Phase 3 — Cross-platform.** Adopt the chosen stack (§6). Build native
  primitives + the `.native.tsx` `Bevel`; scaffold `apps/native` (Expo) + RN
  Storybook.
- **Phase 4 — CI + visual regression.** Chromatic, Turbo cache, typecheck/lint
  gates.

---

## 5. Risks & tradeoffs

- **Tamagui** = most reuse but a real learning curve and a rebuild of the brand
  primitives on its system.
- **Separate stacks** = simplest mental model, best per-platform perf, but
  double authoring of visual components.
- The painted-SVG chamfer is the trickiest thing to keep identical across web and
  native — budget time for the native `react-native-svg` impl + visual parity.
- Monorepo adds upfront tooling overhead; pays off as apps/components multiply.

---

## 6. Decisions still needed

1. **Cross-platform stack:** Tamagui (A) vs shared-tokens/separate (B) vs
   NativeWind+RNW (C). *Recommendation:* A if native code-sharing is the priority;
   B if keeping web fully idiomatic (Next/shadcn) is the priority.
2. Package manager confirm (pnpm recommended) + Turborepo.
3. Native runtime: Expo (recommended) vs bare RN.
4. Whether to add shadcn as the **web** primitive layer (only meaningful in Path B).
5. Visual-regression host (Chromatic vs self-hosted).

---

## 7. Recommended immediate next step

**Phase 0 + Phase 1** regardless of the §6 stack choice: they're additive,
reversible, and lock in nothing. They give us the tokens source of truth and a
Storybook workbench immediately, after which the cross-platform decision can be
made with real components in hand.
