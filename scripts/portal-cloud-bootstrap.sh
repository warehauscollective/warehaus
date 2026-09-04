#!/usr/bin/env bash
# Cloud Agent helper: refresh portal env from Vercel + ensure test auth accounts.
# Safe to re-run. Does not start the Next.js server (use npm run dev:portal).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORTAL="$ROOT/apps/portal"
cd "$ROOT"

echo "→ Linking / pulling Vercel env for warehaus-portal (development)"
(
  cd "$PORTAL"
  if [[ ! -f .vercel/project.json ]]; then
    npx --yes vercel link --yes --project warehaus-portal --scope warehaus-collective
  fi
  npx --yes vercel env pull .env.local --yes --environment development
)

# Normalize quoted values + force localhost site URLs for cookie-friendly local auth
python3 - <<'PY'
from pathlib import Path
p = Path("/workspace/apps/portal/.env.local")
if not p.exists():
    raise SystemExit("apps/portal/.env.local missing after vercel env pull")
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
if "NEXT_PUBLIC_SITE_URL=" not in text:
    text += "\nNEXT_PUBLIC_SITE_URL=http://localhost:3100"
p.write_text(text.rstrip() + "\n")
print("✓ Wrote apps/portal/.env.local (localhost SITE_URL)")
PY

echo "→ Seeding Convex + ensuring Better Auth test users (portal must be up for auth)"
node "$ROOT/scripts/ensure-portal-test-auth.mjs" --seed-only
if curl -sf -o /dev/null "http://localhost:3100/login"; then
  node "$ROOT/scripts/ensure-portal-test-auth.mjs"
else
  echo "⚠ Portal not listening on :3100 — Convex seed done; re-run ensure after npm run dev:portal:"
  echo "    node scripts/ensure-portal-test-auth.mjs --wait-portal"
fi

echo "✓ portal-cloud-bootstrap complete"
