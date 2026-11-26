#!/usr/bin/env bash
# Builds Warehaus Runner for release on this Mac: Developer ID signed with the
# hardened runtime and a secure timestamp, notarized, stapled, and checked by
# Gatekeeper. Needs, in this Mac's keychain (never in the repo):
#   - "Developer ID Application: Warehaus LLC (7XQWUC33C7)" with its private key
#   - the notarytool profile "warehaus-notary" (xcrun notarytool store-credentials)
#
#   apps/mac/scripts/build-release.sh [--skip-notarize]
#
# Output: apps/mac/build/Warehaus Runner.app and Warehaus-Runner.zip.
# The GitHub Actions task does the same on CI with repository secrets.
set -euo pipefail

IDENTITY="Developer ID Application: Warehaus LLC (7XQWUC33C7)"
PROFILE="warehaus-notary"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$HERE/build"
DERIVED="$OUT/DerivedData"
APP="$OUT/Warehaus Runner.app"
ZIP="$OUT/Warehaus-Runner.zip"
NOTARIZE=1
[[ "${1:-}" == "--skip-notarize" ]] && NOTARIZE=0

step() { printf '\n== %s\n' "$1"; }

step "Checking the signing identity"
security find-identity -v -p codesigning | grep -F "$IDENTITY" >/dev/null \
  || { echo "Missing \"$IDENTITY\" in the keychain." >&2; exit 1; }

step "Testing the supervisor"
(cd "$HERE" && swift test --quiet)

step "Building Release (Apple silicon, macOS 14+)"
rm -rf "$APP" "$ZIP"
xcodebuild -project "$HERE/App/WarehausRunner.xcodeproj" -scheme "Warehaus Runner" \
  -configuration Release -derivedDataPath "$DERIVED" -destination "generic/platform=macOS" \
  build -quiet
cp -R "$DERIVED/Build/Products/Release/Warehaus Runner.app" "$APP"

step "Signing with the hardened runtime and a secure timestamp"
# Nested code (the bundled Node and gh, from the first-launch task) is signed inside out first.
if [[ -d "$APP/Contents/Resources/runner/bin" ]]; then
  find "$APP/Contents/Resources/runner/bin" -type f -perm -u+x -print0 | while IFS= read -r -d '' tool; do
    codesign --force --options runtime --timestamp --sign "$IDENTITY" "$tool"
  done
fi
codesign --force --options runtime --timestamp \
  --entitlements "$HERE/App/WarehausRunner.entitlements" --sign "$IDENTITY" "$APP"
codesign --verify --deep --strict --verbose=2 "$APP"

if [[ "$NOTARIZE" == 1 ]]; then
  step "Notarizing (this waits for Apple)"
  ditto -c -k --keepParent "$APP" "$ZIP"
  xcrun notarytool submit "$ZIP" --keychain-profile "$PROFILE" --wait
  step "Stapling"
  xcrun stapler staple "$APP"
  xcrun stapler validate "$APP"
  rm -f "$ZIP"
  ditto -c -k --keepParent "$APP" "$ZIP"
fi

step "Gatekeeper"
spctl -a -vv "$APP"
echo
echo "Built $APP"
[[ -f "$ZIP" ]] && echo "Zip for the Portal download: $ZIP"
