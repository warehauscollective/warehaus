# ADR-0006: One Portal on many platforms: Convex for every client, a native shell on the Mac

Status: Accepted, Peter, 2026-11-25. Peter answered "Yes to all" to five grilling rounds (three on the plan, one codebase-design review of the seams, one on Asks), then confirmed the summary with "Yes, set it up". The Portal records these as Warehaus Portal decisions 0006 to 0010. The work is tracked in the Portal milestones "Asks: needs anyone, not just Peter", "Mac app: Portal window" and "Portal on iOS and Android (Expo)" (parked).

## Context

The runner needs a Mac, and Decision 0005 in the Portal already makes the runner a native Swift menu bar app. Peter wants the whole Portal on the Mac with the runner built in, without losing the web Portal, and with room for iOS, Android and later clients. Today the Portal is Next.js on Vercel over Convex. Almost all business logic is already in Convex; Next serves four server routes (auth, MCP, Notion sync, Notion webhook). ADR-0004 and `docs/design-system-ecosystem.md` plan an Expo app for phones.

## Decision

1. **Convex is the one API for every client.** Web, the Mac app and the later Expo app read and write through Convex. The Next server routes stay server-only. New product logic goes into Convex or `packages/*`, never into a Next page.
2. **The web Portal is the one UI codebase.** The Mac app is a native Swift shell for staff that holds the runner, menu bar, notifications and Keychain, and shows the hosted web Portal in its own window. A screen moves to SwiftUI only when the web one clearly falls short.
3. **The Mac app lives in `apps/mac` and ships only as a Portal download.** Developer ID signed and notarized, never the App Store, because the App Store sandbox would block the runner. Release builds load the production Portal only. Debug builds may load a localhost preview and refuse production Convex, like `npm run preview:pr`.
4. **Two identities stay apart.** The staff member's session in the window and the runner registration in the Keychain never mix. Signing in never pairs a runner; the pairing link opens in the app window.
5. **Alert rules live in Convex.** One public query, the attention feed, returns the signed-in person's open Asks and new alerts, filtered by their notification preferences and without their own actions. Every client shows the same feed.
6. **Pages never touch the native bridge.** One Portal module, mounted once in `PortalShell`, passes the attention feed to the shell. It has two adapters: the Mac adapter, and a browser adapter that only puts the count in the tab title. Pages ask `useShell()` what the shell can do and never read the user agent.
7. **The native bridge has four messages**, in `packages/native-bridge`: `shell.hello` and `navigate` (shell to page), `attention` and `openExternal` (page to shell). `navigate` carries the raw `warehaus://` link; the Portal resolves it, so Swift never parses routes. The TypeScript and Swift copies are kept in step by tests that decode the same JSON examples. No code generation.
8. **Inside `apps/mac`, the runner supervisor and the Portal window are separate modules** that never talk. The menu bar and notifications sit on both.
9. **The Expo app shares Convex, not the bridge.** It reads Convex natively and shares `packages/logic`, `tokens` and the attention feed. No `apps/native` folder until that milestone starts.
10. **New code takes the tenant from the signed-in user**, not from host headers alone, so a native client can pass it.
11. **A note can wait on any staff member.** "Needs Peter" becomes an Ask (see `GLOSSARY.md`). Approval Asks go to Peter, the only approver. Blocked Asks default to Peter until milestones or tasks have an owner.

## Considered options

- **Rewrite the Portal in SwiftUI.** Rejected: a second UI codebase for one platform.
- **Expo with react-native-macos for the Mac.** Rejected: weak macOS support, and the runner is awkward to drive from React Native.
- **Electron or Tauri.** Rejected: Electron was already turned down in Portal Decision 0005; neither gives a native menu bar runner for less.
- **Pages calling the bridge directly, alert rules in the web page.** Rejected: every page would learn the message names, and the Expo app would write the rules again.
- **A native Swift Convex client now.** Rejected until the web window clearly falls short.
- **Role-based Asks, or asking clients.** Rejected for now: no client reads notes, and approvals have one approver.

## Consequences

- `packages/native-bridge` is a real seam with two adapters (Mac and browser) plus test fixtures. Do not import it from pages or components.
- ADR-0004's reason to keep `packages/logic` gets stronger. Deep links still resolve in `apps/portal/src/lib/nav`.
- The Mac app milestone follows "Runner Mac app, set up from the Portal", which builds the Swift app with the runner supervisor and Portal window as separate modules from the start.
- For "Mac app: Portal window" only, the docs, `packages/native-bridge` and an empty `apps/mac` may start during design review. Nothing visible starts and nothing merges before Peter's approval.
- Mac window frames are designed in Dark and Light at 1440 and the 1024 minimum window width. There is no 390 for a Mac window.
