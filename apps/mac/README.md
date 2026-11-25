# Mac app

The Warehaus app on a staff Mac (see "Mac app" in `GLOSSARY.md`). It runs the
runner from the menu bar and shows the web Portal in its own window.
Full record: `docs/adr/0006-multi-platform-portal.md`.

This folder is empty on purpose. The Portal milestone "Runner Mac app, set up
from the Portal" adds the Xcode project here; "Mac app: Portal window" adds the
window. Nothing here is a Node workspace.

## Planned modules

Two deep modules that never talk to each other, with the menu bar and
notifications on top of both:

- **Runner supervisor**: starts the bundled Node runner (`tools/runner`) and
  exposes its state (Ready, Working, Paused, Needs attention) plus pause,
  resume and remove. Tested against a fake runner process.
- **Portal window**: the web view and the Mac adapter for the native bridge
  (`packages/native-bridge/swift`). Release builds load the production Portal
  only; debug builds may load a localhost preview and refuse production Convex.

## Rules

- Developer ID signed and notarized, downloaded only from the Portal. Never the
  App Store: its sandbox would block the runner.
- Apple silicon, macOS 14 or later.
- The window session and the runner's Keychain registration stay separate.
- Swift never parses `warehaus://` links. It hands them to the page with
  `navigate`.
