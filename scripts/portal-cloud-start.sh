#!/usr/bin/env bash
# Per-boot Cloud Agent start: refresh portal env, seed Convex, run Next on :3100,
# then ensure Better Auth test users exist.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORTAL="$ROOT/apps/portal"
cd "$ROOT"

echo "→ portal-cloud-start: env + seed"
(
  cd "$PORTAL"
  if [[ ! -f .vercel/project.json ]]; then
    npx --yes vercel link --yes --project warehaus-portal --scope warehaus-collective
  fi
  npx --yes vercel env pull .env.local --yes --environment development
)

python3 - <<'PY'
from pathlib import Path
p = Path("/workspace/apps/portal/.env.local")
lines = []
for line in p.read_text().splitlines():
    if not line or line.startswith("#") or "=" not in line:
        lines.append(line)
        continue
    k, v = line.split("=", 1)
    v = v.strip()
    if (v.startswith('"') and v.endswith('"')) or (v.startswith("'") and v.endswith("'")):
        v = v[1:-1]
    if k in ("NEXT_PUBLIC_SITE_URL", "SITE_URL"):
        v = "http://localhost:3100"
    lines.append(f"{k}={v}")
text = "\n".join(lines)
if "SITE_URL=" not in text:
    text += "\nSITE_URL=http://localhost:3100"
p.write_text(text.rstrip() + "\n")
PY

# Seed without waiting on portal (Convex HTTP)
node "$ROOT/scripts/ensure-portal-test-auth.mjs" --seed-only

echo "→ Starting @warehaus/portal on :3100"
npm run dev:portal &
PORTAL_PID=$!

cleanup() {
  kill "$PORTAL_PID" 2>/dev/null || true
}
trap cleanup EXIT

# Ensure auth users once login is up
node "$ROOT/scripts/ensure-portal-test-auth.mjs" --wait-portal

echo "✓ Portal ready — http://localhost:3100  (demo@northbay.test / WarehausDemo1!)"
# Keep start attached to the Next process
wait "$PORTAL_PID"
