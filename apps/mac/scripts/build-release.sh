#!/usr/bin/env bash
# Builds Warehaus Runner for release: Developer ID signed with the hardened
# runtime and a secure timestamp, notarized, stapled, and checked by
# Gatekeeper. The same script runs on a staff Mac and in GitHub Actions
# (.github/workflows/runner-app-release.yml).
#
#   apps/mac/scripts/build-release.sh [--skip-notarize | --unsigned]
#
# Needs "Developer ID Application: Warehaus LLC (7XQWUC33C7)" with its private
# key in a keychain (never in the repo). On a Mac that is the login keychain;
# CI imports it into a temporary one (scripts/ci-keychain.sh).
#
# Notarization uses, in this order:
#   - an App Store Connect API key, when NOTARY_KEY_PATH, NOTARY_KEY_ID and
#     NOTARY_ISSUER_ID are all set (CI, from repository secrets)
#   - otherwise the notarytool keychain profile "warehaus-notary" (a staff Mac)
#
# Optional environment:
#   BUILD_NUMBER      CFBundleVersion. The app updates to a higher one. CI sets
#                     it to the commit count on main. Default: the project's.
#   SIGNING_KEYCHAIN  the keychain that holds the identity. Default: the search list.
#
# --skip-notarize builds and checks the Developer ID signature, without
# notarizing. --unsigned needs no certificate at all: it builds, signs ad hoc
# with the hardened runtime and checks that (the PR dry run, which reads no
# secrets). Neither leaves a zip, because only a notarized build is published.
#
# Output: apps/mac/build/Warehaus Runner.app, and after notarization
# Warehaus-Runner.zip plus release.json (version, build, sha256, size,
# minMacOS) for scripts/publish-release.sh.
set -euo pipefail

IDENTITY="Developer ID Application: Warehaus LLC (7XQWUC33C7)"
TEAM_ID="7XQWUC33C7"
PROFILE="warehaus-notary"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$HERE/build"
DERIVED="$OUT/DerivedData"
APP="$OUT/Warehaus Runner.app"
ZIP="$OUT/Warehaus-Runner.zip"
META="$OUT/release.json"
NOTARIZE=1
ADHOC=0
case "${1:-}" in
  "") ;;
  --skip-notarize) NOTARIZE=0 ;;
  --unsigned) NOTARIZE=0; ADHOC=1 ;;
  *) echo "Usage: $0 [--skip-notarize | --unsigned]" >&2; exit 2 ;;
esac

step() { printf '\n== %s\n' "$1"; }
fail() { echo "$1" >&2; exit 1; }

# What codesign signs with: the Developer ID, or "-" (ad hoc, no timestamp).
SIGN_ID="$IDENTITY"
TIMESTAMP="--timestamp"
KEYCHAIN_ARGS=()
if [[ "$ADHOC" == 1 ]]; then
  SIGN_ID="-"
  TIMESTAMP="--timestamp=none"
elif [[ -n "${SIGNING_KEYCHAIN:-}" ]]; then
  KEYCHAIN_ARGS=(--keychain "$SIGNING_KEYCHAIN")
fi

NOTARY_ARGS=(--keychain-profile "$PROFILE")
if [[ -n "${NOTARY_KEY_PATH:-}" || -n "${NOTARY_KEY_ID:-}" || -n "${NOTARY_ISSUER_ID:-}" ]]; then
  [[ -f "${NOTARY_KEY_PATH:-}" && -n "${NOTARY_KEY_ID:-}" && -n "${NOTARY_ISSUER_ID:-}" ]] \
    || fail "Set all of NOTARY_KEY_PATH (an existing .p8), NOTARY_KEY_ID and NOTARY_ISSUER_ID, or none."
  NOTARY_ARGS=(--key "$NOTARY_KEY_PATH" --key-id "$NOTARY_KEY_ID" --issuer "$NOTARY_ISSUER_ID")
fi

if [[ "$ADHOC" == 0 ]]; then
  step "Checking the signing identity"
  security find-identity -v -p codesigning ${SIGNING_KEYCHAIN:+"$SIGNING_KEYCHAIN"} | grep -F "$IDENTITY" >/dev/null \
    || fail "Missing a valid \"$IDENTITY\" in the keychain."
fi

step "Testing the supervisor"
(cd "$HERE" && swift test --quiet)

step "Building Release (Apple silicon, macOS 14+)"
rm -rf "$APP" "$ZIP" "$META"
BUILD_SETTINGS=()
[[ -n "${BUILD_NUMBER:-}" ]] && BUILD_SETTINGS+=("CURRENT_PROJECT_VERSION=$BUILD_NUMBER")
if [[ "$ADHOC" == 1 ]]; then
  BUILD_SETTINGS+=("CODE_SIGN_IDENTITY=-" "DEVELOPMENT_TEAM=" "OTHER_CODE_SIGN_FLAGS=--timestamp=none")
elif [[ -n "${SIGNING_KEYCHAIN:-}" ]]; then
  BUILD_SETTINGS+=("OTHER_CODE_SIGN_FLAGS=--timestamp --keychain $SIGNING_KEYCHAIN")
fi
xcodebuild -project "$HERE/App/WarehausRunner.xcodeproj" -scheme "Warehaus Runner" \
  -configuration Release -derivedDataPath "$DERIVED" -destination "generic/platform=macOS" \
  ${BUILD_SETTINGS[@]+"${BUILD_SETTINGS[@]}"} build -quiet
cp -R "$DERIVED/Build/Products/Release/Warehaus Runner.app" "$APP"

step "Signing with the hardened runtime"
# Node, gh and the runner, signed inside out (Node with App/Node.entitlements).
# Without --identity it signs them ad hoc (the --unsigned dry run). It finds the
# identity through the keychain search list, where CI puts its temporary keychain.
BUNDLE_ARGS=()
[[ "$ADHOC" == 0 ]] && BUNDLE_ARGS=(--identity "$IDENTITY")
"$HERE/scripts/bundle-runtime.sh" "$APP" ${BUNDLE_ARGS[@]+"${BUNDLE_ARGS[@]}"}
codesign --force --options runtime "$TIMESTAMP" ${KEYCHAIN_ARGS[@]+"${KEYCHAIN_ARGS[@]}"} \
  --entitlements "$HERE/App/WarehausRunner.entitlements" --sign "$SIGN_ID" "$APP"
codesign --verify --deep --strict --verbose=2 "$APP"

step "Checking the signature"
SIG="$(codesign -dvv "$APP" 2>&1)"
grep -qE 'flags=.*runtime' <<<"$SIG" || fail "The hardened runtime is off."
if [[ "$ADHOC" == 1 ]]; then
  grep -qF "Signature=adhoc" <<<"$SIG" || fail "Expected an ad hoc signature."
  echo "Ad hoc, hardened runtime. No certificate was used."
else
  grep -qF "Authority=$IDENTITY" <<<"$SIG" || fail "Not signed by \"$IDENTITY\"."
  grep -qF "TeamIdentifier=$TEAM_ID" <<<"$SIG" || fail "Team identifier is not $TEAM_ID."
  grep -qE '^Timestamp=' <<<"$SIG" || fail "No secure timestamp."
  echo "Developer ID, team $TEAM_ID, hardened runtime, secure timestamp."
fi

VERSION="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$APP/Contents/Info.plist")"
BUILD="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$APP/Contents/Info.plist")"
MIN_MACOS="$(/usr/libexec/PlistBuddy -c 'Print :LSMinimumSystemVersion' "$APP/Contents/Info.plist")"
echo "Version $VERSION, build $BUILD, macOS $MIN_MACOS or later."

if [[ "$NOTARIZE" == 1 ]]; then
  step "Notarizing (this waits for Apple)"
  ditto -c -k --keepParent "$APP" "$ZIP"
  xcrun notarytool submit "$ZIP" "${NOTARY_ARGS[@]}" --wait --timeout 30m
  step "Stapling"
  xcrun stapler staple "$APP"
  xcrun stapler validate "$APP"
  rm -f "$ZIP"
  ditto -c -k --keepParent "$APP" "$ZIP"
fi

step "Gatekeeper"
GK="$(spctl -a -vv "$APP" 2>&1 || true)"
echo "$GK"
if [[ "$NOTARIZE" == 1 ]]; then
  grep -qF "$APP: accepted" <<<"$GK" || fail "Gatekeeper did not accept the app."
  grep -qF "source=Notarized Developer ID" <<<"$GK" || fail "Gatekeeper does not see a notarized Developer ID app."

  SHA256="$(shasum -a 256 "$ZIP" | awk '{print $1}')"
  SIZE="$(stat -f %z "$ZIP")"
  jq -n --arg version "$VERSION" --argjson build "$BUILD" --arg sha256 "$SHA256" \
    --argjson size "$SIZE" --arg minMacOS "$MIN_MACOS" \
    '{version: $version, build: $build, sha256: $sha256, size: $size, minMacOS: $minMacOS}' >"$META"
else
  echo "(Not notarized, so Gatekeeper is expected to refuse it. Nothing here is published.)"
fi

echo
echo "Built $APP"
if [[ -f "$ZIP" ]]; then
  echo "Zip for the Portal download: $ZIP"
  echo "Release metadata: $META"
fi
