# Mac app

The Warehaus app on a staff Mac (see "Mac app" in `GLOSSARY.md`). Today it is
**Warehaus Runner**: a menu bar app that keeps the production runner going
headless. The Portal window ("Mac app: Portal window") is added later as its
own module. Full record: `docs/adr/0006-multi-platform-portal.md`.

Nothing here is a Node workspace.

**Staff:** this page is for developers and maintainers. To set up a Mac as a
runner, see [`tools/runner/FIRST-RUN.md`](../../tools/runner/FIRST-RUN.md). No
staff step uses a terminal.

## Layout

```
apps/mac/
  Package.swift                 Swift package: the modules and their tests
  runtime.lock                  the Node and gh versions bundled in the app
  Sources/RunnerSupervisor/     the runner supervisor, checklist and update rules (Foundation only)
  Sources/RunnerMenu/           menu bar dropdown, checklist and pairing windows, Remove dialog,
                                login item, notifications, self-update
  Tests/RunnerSupervisorTests/  state mapping, checklist, update rules, against a fake runner
  Tests/RunnerMenuTests/        the self-update coordinator, against fake files and swaps
  App/WarehausRunner.xcodeproj  the app target: a thin @main that links RunnerMenu
  scripts/build-release.sh      signed, notarized, stapled release build (a Mac or CI)
  scripts/bundle-runtime.sh     fills Contents/Resources/runner: Node, gh, tools/runner
  scripts/ci-keychain.sh        CI only: the certificate in a temporary keychain
  scripts/publish-release.sh    CI only: publishes the zip to the Portal (production)
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
- **Portal window** (later): the web view and the Mac adapter for the native
  bridge (`packages/native-bridge/swift`). It never imports RunnerSupervisor.

The seams, each a small protocol with a live and a fake side:

| Seam | Live | Where |
| --- | --- | --- |
| `RunnerLocating` | Release: the bundled runner in `Contents/Resources/runner`. Debug: this checkout and Homebrew Node | RunnerSupervisor |
| `PairingReading`, `PauseStoring` | The saved runner file; the remembered pause | RunnerSupervisor |
| `SetupSystem` | `gh`, the Claude Code installer, `setup --supervised`, the old launchd agent | RunnerMenu |
| `ReleaseSource`, `UpdateWorkspace`, `AppSwapping` | `app-release`; the Updates folder; swapping the app bundle | RunnerMenu |
| `LoginItem`, `AttentionNotifying`, `URLOpening` | `SMAppService.mainApp`; notifications; the browser | RunnerMenu |

## First launch

Until the app runs its own runner, it shows the checklist (GitHub, Claude
Code, Pair with the Portal), then the pairing window, which shows the code
from `setup --supervised --production` and opens `/?runnerPair=<code>`. An
existing pairing is adopted ("Already paired as …"). An old
`co.warehaus.runner.prod` launchd agent is offered as Replace it, and the app
starts no runner until it is replaced.

## Self-update

Between runs, never during one (Portal decision 0005, ADR-0005 amendment of
2026-11-26). The rules are in `AppUpdate.swift` (RunnerSupervisor), the file
and process work in `AppUpdater.swift` (RunnerMenu).

- Checks on launch, every 6 hours and on Check for update, once the app runs
  its own runner, through `app-release` (`POST /agent/app-release`). Newer
  means a higher build number.
- Downloads to `~/Library/Application Support/co.warehaus.runner.app/Updates`
  and checks size and SHA-256, then `codesign --verify`, team `7XQWUC33C7`,
  bundle id `co.warehaus.runner.app`, the build named by the release, and
  `spctl`.
- Installs only when the runner is idle, paused or stopped: stops it, swaps
  the bundle (rollback copy in `Updates/rollback`), and opens the new app with
  `-UpdateCheckIn <file>`. The old app rolls back if there is no check-in
  within 45 seconds.
- An app it cannot replace in place says "Can't update here. Move the app to
  Applications."

## Production only

- Release builds run against production `unique-turtle-383` only and read
  `~/.config/warehaus/runner.prod.env`. A pairing to any other deployment is
  Needs attention, never used.
- Debug builds run against shared dev and read `runner.env`. They refuse
  production. **A plain debug run starts a real dev runner if this Mac is
  paired to dev**, and it runs Claude headless. Use a fixture to look at the
  menu instead.

## Build and test

```bash
cd apps/mac && swift test
```

Or in Xcode: open `apps/mac/App/WarehausRunner.xcodeproj` and run the
**Warehaus Runner** scheme. The tests run from the package (`xcodebuild
-scheme WarehausMac-Package test -destination platform=macOS` in `apps/mac`).

Debug launch arguments, ticked under Product › Scheme › Edit Scheme › Run ›
Arguments. None of them touch this Mac's real gh, Claude Code, pairing or
launchd agent:

- `-RunnerFixture ready|working|paused|attention`: the menu states with
  fixture data and no runner.
- `-SetupFixture fresh|signed-out|github-code|installing|claude-signin|pairing|expired|takeover|done`:
  the checklist and pairing windows; clicks move the fixture along.
- `-SetupSnapshot <folder>`: writes every checklist and pairing state, Dark
  and Light, as PNGs for the design check, then quits.
- `-UpdateRelease <release.json>`: reads the release from a file instead of
  the Portal (a `file://` zip is fine), to try self-update end to end. Debug
  builds only, and never against production.

A signed and notarized build:

```bash
apps/mac/scripts/build-release.sh
```

It runs `bundle-runtime.sh` first, which downloads the Node and `gh` pinned in
`runtime.lock`, checks their SHA-256, and copies them with `tools/runner` and
`packages/runner-protocol` into `Contents/Resources/runner` (Node is signed
with `App/Node.entitlements`). `BUILD_NUMBER` sets the build number.

It signs with "Developer ID Application: Warehaus LLC (7XQWUC33C7)" using
`--options runtime --timestamp`, notarizes with `xcrun notarytool submit
--keychain-profile warehaus-notary --wait`, staples, and checks
`spctl -a -vv`, failing unless it reports `accepted` and
`source=Notarized Developer ID`. The certificate and the notary profile live in
the Mac's keychain, never in the repo. `--skip-notarize` checks the Developer
ID signature without notarizing. `--unsigned` needs no certificate: it signs ad
hoc with the hardened runtime. Neither leaves a zip.

After notarization it writes `build/Warehaus-Runner.zip` and
`build/release.json` (version, build, sha256, size, minMacOS).

## Release on CI

`.github/workflows/runner-app-release.yml` runs the same script on `macos-15`.

- **Release** (`workflow_dispatch`, from `main` only; any other ref fails).
  Run it by hand after a production deploy that changes `apps/mac` or
  `tools/runner`. It imports the certificate into a temporary keychain,
  notarizes with the App Store Connect API key, staples, checks Gatekeeper and
  publishes with `scripts/publish-release.sh` to production Convex
  (`/runner-app/upload-url`, then `/runner-app/release`). The build number is
  the commit count on `main`, so each release is higher than the last. Running
  it twice on the same commit is refused (409), which is expected.
- **Dry run** (pull requests that change `apps/mac/**` or `tools/runner/**`).
  Runs `build-release.sh --unsigned`: tests, builds and signs ad hoc. It reads
  no secrets, so the certificate never reaches pull request code, and it runs
  on forks too. No Developer ID, no notarization, no publish.

Nothing runs on push, tag or schedule. Deploys are manual, and so is this.

### Repository secrets

Added by Peter in GitHub › Settings › Secrets and variables › Actions. Never
commit them, paste them in chat or print them in a log.

| Secret | What it is | How to make it |
| --- | --- | --- |
| `MAC_DEVELOPER_ID_P12_BASE64` | "Developer ID Application: Warehaus LLC (7XQWUC33C7)" with its private key, as a .p12, base64 | Keychain Access › export the identity as .p12, then `base64 -i DeveloperID.p12 \| pbcopy` |
| `MAC_DEVELOPER_ID_P12_PASSWORD` | The password set on that .p12 export | The password chosen at export |
| `ASC_API_KEY_P8_BASE64` | The App Store Connect API key "Warehaus notarization" (.p8), base64 | `base64 -i AuthKey_<KEY_ID>.p8 \| pbcopy` |
| `ASC_API_KEY_ID` | That key's Key ID | App Store Connect › Users and Access › Integrations › Team Keys |
| `ASC_API_ISSUER_ID` | The team's Issuer ID (a UUID) | Same page, above the key list |
| `RUNNER_APP_PUBLISH_TOKEN` | The publish token. The same value must be set as `RUNNER_APP_PUBLISH_TOKEN` in the production Convex env. 32 characters or more | `openssl rand -hex 32 \| pbcopy`, then set it in both places |

Only the release job reads these secrets. It runs by hand, from `main` only.

## Rules

- Developer ID signed and notarized, downloaded only from the Portal. Never the
  App Store: its sandbox would block the runner.
- Apple silicon, macOS 14 or later.
- The window session and the runner's Keychain registration stay separate. The
  app never reads the runner secret; the runner does.
- Swift never parses `warehaus://` links. It hands them to the page with
  `navigate`.

## Open items

- The runner gets only an allowlist of the app's environment (`HOME`, `USER`,
  `LOGNAME`, `SHELL`, `TMPDIR`, `LANG`, `SSH_AUTH_SOCK`), so a runner under the
  app has no `CURSOR_API_KEY` and Cursor builds block with a note. Claude Code
  projects are not affected. A fix needs its own task, with no terminal step
  for staff.
