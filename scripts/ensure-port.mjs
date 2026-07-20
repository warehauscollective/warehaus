#!/usr/bin/env node
/**
 * Fail fast if a port is already taken — Next.js otherwise auto-increments
 * (3000 → 3001 → …) and the website can steal the portal’s port.
 *
 * Usage: node scripts/ensure-port.mjs <port> <label>
 */
import net from 'node:net';

const port = Number(process.argv[2]);
const label = process.argv[3] || 'app';

if (!Number.isInteger(port) || port < 1) {
  console.error(`ensure-port: invalid port "${process.argv[2]}"`);
  process.exit(1);
}

const free = await new Promise((resolve) => {
  const server = net.createServer();
  server.once('error', () => resolve(false));
  server.once('listening', () => {
    server.close(() => resolve(true));
  });
  server.listen(port, '0.0.0.0');
});

if (!free) {
  console.error(`
✖ Port ${port} is already in use — cannot start ${label}.

  Next.js will NOT silently move to another port from this script.
  Free the port, or override:
    website → WEB_PORT=3020 npm run dev:web
    portal  → PORTAL_PORT=3100 npm run dev:portal

  Tip: another project on :3000 often pushes the website onto :3001 and
  crowds out the portal. Check with:  lsof -iTCP:${port} -sTCP:LISTEN
`);
  process.exit(1);
}

console.log(`✓ ${label} port ${port} is free`);
