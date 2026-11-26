# Mac app

The Warehaus app on a staff Mac (see "Mac app" in `GLOSSARY.md`). It is
**Warehaus Runner**: a menu bar app that keeps the production runner going
headless, and shows the Portal in its own window. Full record:
`docs/adr/0006-multi-platform-portal.md`.

Nothing here is a Node workspace.

## Layout

```
apps/mac/
  Package.swift                 Swift package: the modules and their tests
  Sources/RunnerSupervisor/     the runner supervisor (Foundation only)
  Sources/PortalWindow/         the Portal window and the Mac adapter of the native bridge
  Sources/NotificationRouting/  the one notification center delegate, routing clicks by source
  Sources/RunnerMenu/           menu bar dropdown, Remove dialog, login item, notifications
  Tests/RunnerSupervisorTests/  state mapping and supervisor tests, against a fake runner
  Tests/PortalWindowTests/      origin policy, link routing, bridge scripts, alerts and badge
  Tests/NotificationRoutingTests/ click routing by source
  App/WarehausRunner.xcodeproj  the app target: a thin @main that links RunnerMenu
  scripts/build-release.sh      signed, notarized, stapled release build
```

## Modules

Two deep modules that never talk to each other, with the menu bar and
notifications on top of both (ADR-0006, decision 8):

- **RunnerSupervisor** starts the Node runner (`tools/runner`) as a child
  process with `start --supervised --mode headless` (plus `--production` in
  release builds) and reads its state lines: one `@@warehaus {json}` line per
  change on stdout. It maps them to the four menu states, Ready, Working,
  Paused and Needs attention (`MenuState.from`). Pause and Resume are `pause`
  and `resume` on the runner's stdin; the runner then sends `paused` on every
  heartbeat, so the Portal chip reads Paused. A run in progress always
  finishes first. Remove runs `remove`, which revokes the runner in the
  Portal (`POST /agent/unpair`, with its own secret), removes the old launchd
  agent and deletes the Keychain secret. It restarts a runner that stops, and
  says Needs attention when it stops three times in five minutes.
- **RunnerMenu** draws the approved design (Figma, Mac runner app, node
  `1115-38617`): the dropdown, the Remove confirm dialog, Start at login
  (`SMAppService.mainApp`, on from the first launch in release builds) and
  notifications only when a person must act (`AttentionReason.needsPerson`).
- **PortalWindow** shows the hosted Portal in one WKWebView under a
  transparent 40px title bar strip that drags the window (Figma, Projects /
  Mac app, 1440 and 1024 frames; minimum 1024 x 768). It is the Mac adapter
  of the native bridge (`packages/native-bridge/swift`): it adds the
  `warehaus` script message handler, sends `shell.hello` with
  `openExternal` after every page load, opens `openExternal` links (https
  only) in the default browser, accepts and ignores `attention`, and logs
  and drops anything the decoder refuses. A `warehaus://` link opened
  anywhere on the Mac (Info.plist `CFBundleURLTypes`) opens the window and
  goes to the page raw with `navigate`. Portal-origin navigations stay in the
  window; every other link goes to the default browser (`LinkRouter`). It
  never imports RunnerSupervisor. The menu's Open Portal opens this window.

  `attention` from the page sets the Dock badge to the count (none at 0) and
  posts one notification per alert id not seen before (Figma, Projects /
  Mac app / Needs you and Ready to Ship notifications). Seen ids live in
  UserDefaults (the newest 200), so a reload or relaunch never notifies
  twice, and the first `attention` after launch only seeds them. Permission
  is asked the first time an alert would notify, never at launch. The hello
  claims `badge` and `openExternal` always and `notify` only while the Mac
  allows it, and is sent again when that changes. Clicking a notification
  opens the window and hands the alert's raw link to the page.
- **NotificationRouting** is the one `UNUserNotificationCenter` delegate.
  The window tags its notifications `source: portal`, the runner menu tags
  its act-only ones `source: runner`, and the app delegate registers a click
  handler for each. Neither module imports the other for this.

Seams left for their own tasks, each a small protocol with a stub today:

| Seam | Today | Task |
| --- | --- | --- |
| `RunnerLocating` | Release: `Contents/Resources/runner` (empty until bundled). Debug: this checkout and Homebrew Node | First launch: bundled Node, runner and gh |
| `SetUpFlow` | Opens the Portal, or github.com/login | First launch: checklist and pairing windows |
| `UpdateChecking` | Always "Up to date" | Self-update between runs |
| The release workflow | `scripts/build-release.sh` on this Mac | GitHub Actions |

## Production only

- Release builds run against production `unique-turtle-383` only and read
  `~/.config/warehaus/runner.prod.env`. A pairing to any other deployment is
  Needs attention, never used.
- The release window loads only the production Portal,
  `https://warehaus-portal.vercel.app` (the Vercel project's only production
  domain). Debug windows load only `http://localhost:<port>` (default 3100,
  or `-PortalURL http://localhost:3190/projects`), and block production
  Convex: a WebKit content rule blocks every request naming
  `unique-turtle-383`, and a script replaces the page with a refusal if it
  tries (`ConvexGuard`).
- Debug builds run against shared dev and read `runner.env`. They refuse
  production. **A plain debug run starts a real dev runner if this Mac is
  paired to dev**, and it runs Claude headless. Use a fixture to look at the
  menu instead.

## Build and test

```bash
cd apps/mac && swift test
```

Or in Xcode: open `apps/mac/App/WarehausRunner.xcodeproj` and run the
**Warehaus Runner** scheme. To see the four states with fixture data and no
runner, tick one `-RunnerFixture` argument under Product › Scheme › Edit
Scheme › Run › Arguments (ready, working, paused, attention). The tests run
from the package (`xcodebuild -scheme WarehausMac-Package test
-destination platform=macOS` in `apps/mac`).

To check the Portal window against a local fixtures preview (no Convex):

```bash
PORTAL_PORT=3190 NEXT_PUBLIC_SITE_URL=http://localhost:3190 NEXT_PUBLIC_PORTAL_FIXTURES=1 npm run dev -w @warehaus/portal
```

Then run the debug app with `-RunnerFixture ready -OpenPortalWindow YES
-PortalURL http://localhost:3190/projects`. Debug-only arguments
`-PortalWindowSize 1024x768`, `-PortalAppearance dark|light` and
`-PortalWindowSnapshot <folder>` size the window, force the appearance and
write a PNG plus what the page made of the shell (`data-shell`, the hello,
the inset) and the native state (badge, permission, delivered
notifications) without screen recording permission.
`-AttentionFixture needs-you|ready-to-ship|both|clear` has the page post
fixture `attention` messages through the real bridge handler (an empty seed,
then the fixture), until the Convex attention feed exists.

A signed and notarized build:

```bash
apps/mac/scripts/build-release.sh
```

It signs with "Developer ID Application: Warehaus LLC (7XQWUC33C7)" using
`--options runtime --timestamp`, notarizes with `xcrun notarytool submit
--keychain-profile warehaus-notary --wait`, staples, and checks
`spctl -a -vv`. The certificate and the notary profile live in the Mac's
keychain, never in the repo.

## Rules

- Developer ID signed and notarized, downloaded only from the Portal. Never the
  App Store: its sandbox would block the runner.
- Apple silicon, macOS 14 or later.
- The window session and the runner's Keychain registration stay separate. The
  app never reads the runner secret; the runner does.
- Swift never parses `warehaus://` links. It hands them to the page with
  `navigate`.
