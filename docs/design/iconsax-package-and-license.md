# Iconsax: package and license

Milestone "Iconsax icons across the Portal", task 01. Checked 2026-11-26. Nothing is installed yet.

This is a reading of the published terms, not legal advice.

## Answer

- **React package:** `iconsax-reactjs` 0.0.8.
- **Figma source:** the official "Iconsax" plugin on Figma Community, Linear style, rounded. One check is open, see "Open points".
- **Free or Pro:** every mapped icon is in the free set. No Pro plan is needed.
- **License:** free icons may be used in a commercial app with no attribution. They may not be resold, sublicensed or shared as loose files.

## Package

Three packages on npm carry the Iconsax name. Their tarballs were downloaded and read.

| Package | Version | Published | Weekly downloads | Verdict |
|---|---|---|---|---|
| `iconsax-reactjs` | 0.0.8 | 2025-04-13 | about 38,000 | Use this |
| `iconsax-react` | 0.0.8 | 2021-12-28 | about 85,000 | Do not use |
| `iconsax` (official) | 0.1.1 | 2026-07-14 | about 5,600 | Do not use |

### `iconsax-reactjs`: use

- 993 icons, each in six styles (Linear, Outline, Bold, Bulk, Broken, TwoTone), chosen with a `variant` prop.
- All 40 icons in the approved mapping are present under the mapped names, including `HamburgerMenu`.
- No runtime dependencies. Peer dependency is `react` only.
- Defaults are written inline (`variant` Linear, `color` currentColor, `size` 24), so it works on React 19. The Portal is on React 19.2.
- Each icon is a plain `forwardRef` SVG with no hooks, so it renders on the server and the client.
- `sideEffects: false` with one file per icon, so only imported icons reach the bundle. The package is 15 MB unpacked.
- Ships TypeScript types (`Icon`, `IconProps`).
- MIT licensed. Same author and same repository as `iconsax-react` (`rendinjast/iconsax-react`), published under a second npm account.

### `iconsax-react`: do not use

Same icons, older build. Every icon sets its defaults through `defaultProps` and depends on `prop-types`. React 19 no longer reads `defaultProps` on function components, so `size`, `color` and `variant` would arrive undefined unless every call passes all three. It also spells the menu icon `HambergerMenu`. Last published in 2021.

### `iconsax` (official): do not use

- It is a web component, `<iconsax-icon>`, not React components. Iconsax's own docs say there is no React package.
- It loads each icon with `fetch` at runtime, one JSON file per category. Icons would appear after the page paints and would not render on the server.
- It uses the newer V2 names. Ten of the mapped icons are not in it under their mapped names (for example `element-3`, `kanban`, `arrow-right-2`, `logout`, `export-square`, `hamburger-menu`).
- It ships 1,211 free icons, of which 1,155 have a Linear style.
- Pro icons need an API key and a `npx iconsax sync` step that writes them to a JSON file in the repo.

## Free or Pro

`iconsax-reactjs` contains only the free set, so nothing from it can be a Pro icon. The mapping in the milestone notes uses these 40 names, all present:

Activity, Add, ArrowDown2, ArrowLeft2, ArrowRight2, BookSaved, Building, Buildings2, Calendar, Clock, CloseCircle, Data, DocumentText, Element3, ExportSquare, Eye, EyeSlash, Filter, Gps, HamburgerMenu, InfoCircle, Kanban, Layer, Link, Lock, Logout, Microphone, More, Notification, People, Profile, RecordCircle, Refresh, SearchNormal, Shield, ShieldTick, Sms, Task, TickCircle, Warning2.

Iconsax has no bare tick and no bare X. Peter's decision on 2026-11-25 covers this: Lucide `Check` and `X` stay as the fallback, so `lucide-react` stays installed.

Pro pricing could not be read (the pricing page did not load for an automated fetch). It does not matter unless a Pro icon is wanted later.

## License

Two licenses apply.

1. **The package code** is MIT (`rendinjast/iconsax-react`, LICENSE file). MIT asks that the copyright and permission notice travel with copies of the software.
2. **The icon artwork** belongs to Iconsax and falls under the Iconsax license at `docs.iconsax.io/license-and-terms`.

What the Iconsax free license says:

| Question | Answer | Source wording |
|---|---|---|
| Commercial use in a paid web app | Allowed | "Permitted Use: UNLIMITED! Personal and Commercial." |
| Attribution | Not required for an app | "Attribution: NOT REQUIRED! (Except for Digital Items)." |
| Resale or sublicensing | Forbidden | "Resale / Sublicensing: FORBIDDEN!" |
| Sharing the icons | Only inside code, never as loose files | "Redistribution (Loose Icons): Only as PART of code (w/ notice)." and "NO loose files." |

"Digital Items" means things sold or given away for others to build with, such as templates, UI kits and themes. The Portal is not one.

What this means for the build:

- Icons are used only as React components imported from the package. No Iconsax SVG files are copied into the repo. This matters because the Warehaus repository is public on GitHub.
- The dock icons in `apps/portal/public/icons/*.svg` are replaced by components, not by downloaded Iconsax SVGs.
- A short notice goes in the repo with the wrapper: icons by Iconsax (iconsax.io), used under the Iconsax license; React package `iconsax-reactjs`, MIT, copyright Erfan Khadivar. Iconsax suggests `// Icon assets from Iconsax - https://iconsax.io` as a code comment.
- No visible credit is needed in the Portal UI.

If a Pro icon is ever wanted:

- Pro is licensed to one named person and is not transferable. A client needs their own license to reuse the icons.
- The official flow commits the Pro icons to the repo as a JSON file. The terms do not say whether that is allowed in a public repo. Ask Iconsax before doing it.

## Open points

1. **Figma and code may draw from different versions of the set.** `iconsax-reactjs` holds the original set (about 1,000 icons, 6 styles). The official Figma plugin serves the current V2 library, where some icons are renamed (`arrow-down-01` in place of `ArrowDown2`, for example) and may be redrawn. When Product Design Lead builds Atom/Icon, each icon should be compared with the `iconsax-reactjs` drawing at iconsax.erfan.ee. If any differ, take that icon from the original "Iconsax" Figma community file instead. The plugin page could not be opened by an automated fetch, so this was not checked here.
2. **The package is not actively maintained.** One release, April 2025, 10 open issues. The risk is low: it is static SVG with no dependencies, and the wrapper is the only file that imports it, so it can be swapped later.
3. **"Only as part of code (w/ notice)"** is read here as covering icons compiled into the Portal's JavaScript. The terms do not spell that case out. It is the normal use of an icon package, and the notice above covers the "w/ notice" part.

## Sources

- npm registry: `iconsax-reactjs`, `iconsax-react`, `iconsax` (tarballs read 2026-11-26)
- https://github.com/rendinjast/iconsax-react (LICENSE, MIT)
- https://docs.iconsax.io/license-and-terms/license
- https://docs.iconsax.io/license-and-terms/usage-manifesto
- https://docs.iconsax.io/license-and-terms/atribution-guide
- https://docs.iconsax.io/npm/web-component
- https://docs.iconsax.io/features/icon-library
