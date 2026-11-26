#!/usr/bin/env bash
# Puts the runner and its runtime inside a built Warehaus Runner.app and signs
# each nested binary, so the app needs nothing installed to run the runner:
#
#   Contents/Resources/runner/
#       bin/node  bin/gh                      (pinned in apps/mac/runtime.lock)
#       tools/runner/{src,hooks,prompts}      (from this checkout, no tests)
#       packages/runner-protocol/{index.mjs,package.json}
#       licenses/{node,gh}.txt
#
#   apps/mac/scripts/bundle-runtime.sh "<path>/Warehaus Runner.app" [--identity "<Developer ID>"]
#
# Node and gh are downloaded once from the official URLs into apps/mac/build/
# runtime-cache and checked against the SHA-256 in runtime.lock every time.
# A mismatch stops the build. Without --identity the binaries are signed ad hoc
# (Debug). With it, each gets the hardened runtime and a secure timestamp; Node
# alone gets App/Node.entitlements (allow-jit, allow-unsigned-executable-memory).
# Sign the app itself after this script.
#
# RUNTIME_LOCK and RUNTIME_CACHE override the lock file and cache (tests).
set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
LOCK="${RUNTIME_LOCK:-$HERE/runtime.lock}"
CACHE="${RUNTIME_CACHE:-$HERE/build/runtime-cache}"

APP="${1:-}"
IDENTITY="-"
shift || true
while [[ $# -gt 0 ]]; do
  case "$1" in
    --identity) IDENTITY="$2"; shift 2 ;;
    *) echo "Unknown option $1" >&2; exit 2 ;;
  esac
done
[[ -n "$APP" && -d "$APP/Contents" ]] || { echo "Usage: bundle-runtime.sh <app> [--identity <name>]" >&2; exit 2; }

# shellcheck source=/dev/null
source "$LOCK"
for var in NODE_VERSION NODE_FILE NODE_URL NODE_SHA256 GH_VERSION GH_FILE GH_URL GH_SHA256; do
  [[ -n "${!var:-}" ]] || { echo "runtime.lock is missing $var" >&2; exit 1; }
done

# fetch <url> <file> <sha256>: prints the cached path once the checksum matches.
fetch() {
  local url="$1" file="$2" want="$3" path="$CACHE/$2"
  mkdir -p "$CACHE"
  if [[ ! -f "$path" ]]; then
    case "$url" in https://nodejs.org/dist/*|https://github.com/cli/cli/releases/download/*) ;;
      *) echo "Refusing to download from $url (not an official URL)" >&2; return 1 ;; esac
    echo "Downloading $file" >&2
    curl -fsSL --proto '=https' --retry 3 -o "$path.part" "$url"
    mv "$path.part" "$path"
  fi
  local got
  got="$(shasum -a 256 "$path" | awk '{print $1}')"
  if [[ "$got" != "$want" ]]; then
    echo "Checksum mismatch for $file" >&2
    echo "  expected $want" >&2
    echo "  got      $got" >&2
    rm -f "$path"
    return 1
  fi
  echo "$path"
}

NODE_ARCHIVE="$(fetch "$NODE_URL" "$NODE_FILE" "$NODE_SHA256")"
GH_ARCHIVE="$(fetch "$GH_URL" "$GH_FILE" "$GH_SHA256")"

WORK="$(mktemp -d "${TMPDIR:-/tmp}/warehaus-runtime.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK/node" "$WORK/gh"
tar -xzf "$NODE_ARCHIVE" -C "$WORK/node" --strip-components 1
ditto -x -k "$GH_ARCHIVE" "$WORK/gh"
GH_DIR="$(find "$WORK/gh" -mindepth 1 -maxdepth 1 -type d | head -n 1)"

DEST="$APP/Contents/Resources/runner"
rm -rf "$DEST"
mkdir -p "$DEST/bin" "$DEST/licenses" "$DEST/tools/runner" "$DEST/packages/runner-protocol"

install -m 0755 "$WORK/node/bin/node" "$DEST/bin/node"
install -m 0755 "$GH_DIR/bin/gh" "$DEST/bin/gh"
cp "$WORK/node/LICENSE" "$DEST/licenses/node.txt"
cp "$GH_DIR/LICENSE" "$DEST/licenses/gh.txt"

# The runner as it is in this checkout. It imports only node: modules and
# packages/runner-protocol, so nothing needs installing.
rsync -a --exclude '*.test.mjs' "$REPO/tools/runner/src" "$DEST/tools/runner/"
rsync -a "$REPO/tools/runner/hooks" "$REPO/tools/runner/prompts" "$DEST/tools/runner/"
cp "$REPO/packages/runner-protocol/index.mjs" "$REPO/packages/runner-protocol/package.json" "$DEST/packages/runner-protocol/"
printf 'node %s\ngh %s\nrunner %s\n' "$NODE_VERSION" "$GH_VERSION" \
  "$(git -C "$REPO" rev-parse --short HEAD 2>/dev/null || echo unknown)" > "$DEST/VERSIONS"

# Sign inside out, before the app. Ad hoc in Debug.
sign() {
  local file="$1"; shift
  if [[ "$IDENTITY" == "-" ]]; then
    codesign --force --sign - "$@" "$file"
  else
    codesign --force --options runtime --timestamp --sign "$IDENTITY" "$@" "$file"
  fi
}
sign "$DEST/bin/node" --entitlements "$HERE/App/Node.entitlements"
sign "$DEST/bin/gh"

"$DEST/bin/node" --version >/dev/null
"$DEST/bin/gh" --version >/dev/null
echo "Bundled node $NODE_VERSION, gh $GH_VERSION and the runner into $DEST"
