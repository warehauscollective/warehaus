#!/usr/bin/env bash
# CI only. Publishes the notarized zip from scripts/build-release.sh as the
# latest runner app release, through the Portal's publish path (Convex,
# apps/portal/convex/runnerApp.ts):
#
#   1. POST /runner-app/upload-url   a one-time Convex storage upload URL
#   2. POST <upload URL>             the zip; Convex answers with its storageId
#   3. POST /runner-app/release      version, build, sha256, size, minMacOS, storageId
#
# Steps 1 and 3 send RUNNER_APP_PUBLISH_TOKEN as a bearer token. A retried
# publish of the same build and hash is a no-op; a lower build is refused (409).
#
# This writes to PRODUCTION Convex. Only the release job in
# .github/workflows/runner-app-release.yml runs it, from main, by hand.
set -euo pipefail

: "${RUNNER_APP_PUBLISH_TOKEN:?RUNNER_APP_PUBLISH_TOKEN is not set}"
SITE="${CONVEX_SITE_URL:-https://unique-turtle-383.convex.site}"
[[ "$SITE" == "https://unique-turtle-383.convex.site" ]] \
  || { echo "Refusing to publish to $SITE: runner app releases go to production only." >&2; exit 1; }

HERE="$(cd "$(dirname "$0")/.." && pwd)"
ZIP="$HERE/build/Warehaus-Portal.zip"
META="$HERE/build/release.json"
[[ -f "$ZIP" && -f "$META" ]] || { echo "Run scripts/build-release.sh (with notarization) first." >&2; exit 1; }

SHA256="$(shasum -a 256 "$ZIP" | awk '{print $1}')"
[[ "$SHA256" == "$(jq -r .sha256 "$META")" ]] || { echo "The zip does not match release.json." >&2; exit 1; }

# The token goes to curl on stdin, never on its command line or in the log.
authed() {
  printf 'header = "Authorization: Bearer %s"\n' "$RUNNER_APP_PUBLISH_TOKEN" \
    | curl --config - --fail-with-body --silent --show-error --retry 2 "$@"
}

echo "Publishing $(jq -r '"version \(.version), build \(.build), \(.size) bytes"' "$META")"

UPLOAD_URL="$(authed -X POST "$SITE/runner-app/upload-url" | jq -er .uploadUrl)"
STORAGE_ID="$(curl --fail-with-body --silent --show-error -X POST \
  -H "Content-Type: application/zip" --data-binary "@$ZIP" "$UPLOAD_URL" | jq -er .storageId)"
BODY="$(jq -c --arg storageId "$STORAGE_ID" '. + {storageId: $storageId}' "$META")"
RESULT="$(authed -X POST -H "Content-Type: application/json" --data "$BODY" "$SITE/runner-app/release")"
echo "$RESULT" | jq .
[[ "$(jq -r .ok <<<"$RESULT")" == "true" ]] || { echo "The release was not recorded." >&2; exit 1; }
echo "Published. Staff see it in Set up runner; runners pick it up between runs."
