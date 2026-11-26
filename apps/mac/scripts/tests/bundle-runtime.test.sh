#!/usr/bin/env bash
# Checks that bundle-runtime.sh refuses a runtime file whose SHA-256 does not
# match runtime.lock, and refuses URLs that are not the official ones. Offline:
# the "downloads" are placed in a temporary cache first.
#
#   apps/mac/scripts/tests/bundle-runtime.test.sh
set -uo pipefail

HERE="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPT="$HERE/scripts/bundle-runtime.sh"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/bundle-runtime-test.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT
fails=0

check() { # check <name> <expected exit: 0|nonzero> <grep pattern> -- command...
  local name="$1" want="$2" pattern="$3"; shift 4
  local out code
  out="$("$@" 2>&1)"; code=$?
  if { [[ "$want" == 0 && $code -eq 0 ]] || [[ "$want" != 0 && $code -ne 0 ]]; } && grep -q -- "$pattern" <<<"$out"; then
    echo "ok   $name"
  else
    echo "FAIL $name (exit $code)"; echo "$out" | sed 's/^/     /'; fails=$((fails + 1))
  fi
}

mkdir -p "$TMP/cache" "$TMP/Fake.app/Contents"
printf 'not node' > "$TMP/cache/node.tar.gz"
printf 'not gh' > "$TMP/cache/gh.zip"
good_node="$(shasum -a 256 "$TMP/cache/node.tar.gz" | awk '{print $1}')"

lock() { # lock <file> <node url> <node sha>
  cat > "$1" <<LOCK
NODE_VERSION=0.0.0
NODE_FILE=node.tar.gz
NODE_URL=$2
NODE_SHA256=$3
GH_VERSION=0.0.0
GH_FILE=gh.zip
GH_URL=https://github.com/cli/cli/releases/download/v0/gh.zip
GH_SHA256=0000000000000000000000000000000000000000000000000000000000000000
LOCK
}

lock "$TMP/bad-node.lock" https://nodejs.org/dist/v0/node.tar.gz 1111111111111111111111111111111111111111111111111111111111111111
check "a wrong Node checksum stops the build" 1 "Checksum mismatch for node.tar.gz" -- \
  env RUNTIME_LOCK="$TMP/bad-node.lock" RUNTIME_CACHE="$TMP/cache" "$SCRIPT" "$TMP/Fake.app"
[[ -f "$TMP/cache/node.tar.gz" ]] && { echo "FAIL the mismatched file stays in the cache"; fails=$((fails + 1)); } \
  || echo "ok   the mismatched file is removed from the cache"

printf 'not node' > "$TMP/cache/node.tar.gz"
lock "$TMP/bad-gh.lock" https://nodejs.org/dist/v0/node.tar.gz "$good_node"
check "a matching Node passes and a wrong gh checksum still stops it" 1 "Checksum mismatch for gh.zip" -- \
  env RUNTIME_LOCK="$TMP/bad-gh.lock" RUNTIME_CACHE="$TMP/cache" "$SCRIPT" "$TMP/Fake.app"

lock "$TMP/evil.lock" https://example.com/node.tar.gz "$good_node"
check "a download from an unofficial URL is refused" 1 "not an official URL" -- \
  env RUNTIME_LOCK="$TMP/evil.lock" RUNTIME_CACHE="$TMP/empty-cache" "$SCRIPT" "$TMP/Fake.app"

printf 'NODE_VERSION=1\n' > "$TMP/short.lock"
check "a lock file without every pin is refused" 1 "missing NODE_FILE" -- \
  env RUNTIME_LOCK="$TMP/short.lock" "$SCRIPT" "$TMP/Fake.app"

check "the real lock pins sha-256 values" 0 "" -- \
  bash -c "source '$HERE/runtime.lock' && [[ \$NODE_SHA256 =~ ^[0-9a-f]{64}\$ && \$GH_SHA256 =~ ^[0-9a-f]{64}\$ ]]"

[[ $fails -eq 0 ]] && echo "All bundle-runtime checks passed" || { echo "$fails failed"; exit 1; }
