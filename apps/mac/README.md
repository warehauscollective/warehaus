# Mac app

The Warehaus app on a staff Mac (see "Mac app" in `GLOSSARY.md`). Today it is
**Warehaus Runner**: a menu bar app that keeps the production runner going
headless. The Portal window ("Mac app: Portal window") is added later as its
own module. Full record: `docs/adr/0006-multi-platform-portal.md`.

Nothing here is a Node workspace.

## Layout

```
apps/mac/
  Package.swift                 Swift package: the modules and their tests
  Sources/RunnerSupervisor/     the runner supervisor (Foundation only)
  Sources/RunnerMenu/           menu bar dropdown, Remove dialog, login item, notifications
  Tests/RunnerSupervisorTests/  state mapping and supervisor tests, against a fake runner
  App/WarehausRunner.xcodeproj  the app target: a thin @main that links RunnerMenu
  scripts/build-release.sh      signed, notarized, stapled release build (a Mac or CI)
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

Seams left for their own tasks, each a small protocol with a stub today:

| Seam | Today | Task |
| --- | --- | --- |
| `RunnerLocating` | Release: `Contents/Resources/runner` (empty until bundled). Debug: this checkout and Homebrew Node | First launch: bundled Node, runner and gh |
| `SetUpFlow` | Opens the Portal, or github.com/login | First launch: checklist and pairing windows |
| `UpdateChecking` | Always "Up to date" | Self-update between runs |

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
**Warehaus Runner** scheme. To see the four states with fixture data and no
runner, tick one `-RunnerFixture` argument under Product › Scheme › Edit
Scheme › Run › Arguments (ready, working, paused, attention). The tests run
from the package (`xcodebuild -scheme WarehausMac-Package test
-destination platform=macOS` in `apps/mac`).

A signed and notarized build:

```bash
apps/mac/scripts/build-release.sh
```

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
