#!/usr/bin/env bash
# CI only. Imports the Developer ID certificate into a temporary keychain for
# scripts/build-release.sh, and deletes it again. GitHub Actions runs this in
# .github/workflows/runner-app-release.yml; a staff Mac never needs it.
#
#   ci-keychain.sh create   needs MAC_DEVELOPER_ID_P12_BASE64 and
#                           MAC_DEVELOPER_ID_P12_PASSWORD (repository secrets)
#                           and RUNNER_TEMP; exports SIGNING_KEYCHAIN to GITHUB_ENV
#   ci-keychain.sh delete   deletes the keychain and any key files in RUNNER_TEMP
#
# Nothing here prints a secret. The keychain password is random per run and
# never leaves this script.
set -euo pipefail

: "${RUNNER_TEMP:?RUNNER_TEMP is not set (this script is for GitHub Actions)}"
KEYCHAIN="$RUNNER_TEMP/warehaus-signing.keychain-db"
P12_FILE="$RUNNER_TEMP/developer-id.p12"
CA_FILE="$RUNNER_TEMP/DeveloperIDG2CA.cer"
# Apple's Developer ID intermediate, so the identity in the .p12 validates.
CA_URL="https://www.apple.com/certificateauthority/DeveloperIDG2CA.cer"

case "${1:-}" in
  create)
    : "${MAC_DEVELOPER_ID_P12_BASE64:?MAC_DEVELOPER_ID_P12_BASE64 is not set}"
    : "${MAC_DEVELOPER_ID_P12_PASSWORD:?MAC_DEVELOPER_ID_P12_PASSWORD is not set}"
    umask 077
    PASS="$(openssl rand -hex 24)"
    security create-keychain -p "$PASS" "$KEYCHAIN"
    security set-keychain-settings -lut 7200 "$KEYCHAIN"
    security unlock-keychain -p "$PASS" "$KEYCHAIN"

    printf '%s' "$MAC_DEVELOPER_ID_P12_BASE64" | base64 --decode >"$P12_FILE"
    security import "$P12_FILE" -k "$KEYCHAIN" -f pkcs12 -P "$MAC_DEVELOPER_ID_P12_PASSWORD" \
      -T /usr/bin/codesign -T /usr/bin/security >/dev/null
    rm -f "$P12_FILE"

    curl -fsSL --retry 3 "$CA_URL" -o "$CA_FILE"
    security import "$CA_FILE" -k "$KEYCHAIN" >/dev/null 2>&1 || true
    rm -f "$CA_FILE"

    # Lets codesign use the key without a prompt.
    security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$PASS" "$KEYCHAIN" >/dev/null
    # Put it first in the search list so xcodebuild finds the identity too.
    existing=()
    while IFS= read -r line; do
      line="${line#"${line%%[![:space:]]*}"}"; line="${line%\"}"; line="${line#\"}"
      [[ -n "$line" ]] && existing+=("$line")
    done < <(security list-keychains -d user)
    security list-keychains -d user -s "$KEYCHAIN" ${existing[@]+"${existing[@]}"}

    security find-identity -v -p codesigning "$KEYCHAIN"
    echo "SIGNING_KEYCHAIN=$KEYCHAIN" >>"${GITHUB_ENV:-/dev/null}"
    ;;
  delete)
    security delete-keychain "$KEYCHAIN" 2>/dev/null || true
    rm -f "$P12_FILE" "$CA_FILE" "$RUNNER_TEMP"/AuthKey_*.p8
    ;;
  *)
    echo "Usage: $0 create|delete" >&2
    exit 2
    ;;
esac
