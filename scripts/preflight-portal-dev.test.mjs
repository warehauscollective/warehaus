import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  assertNode22,
  assertSharedDevEnv,
  parseEnv,
  runPreflight,
} from './preflight-portal-dev.mjs';

const shared = `
CONVEX_DEPLOYMENT=dev:shared-dev-name
NEXT_PUBLIC_CONVEX_URL=https://shared-dev-name.convex.cloud
`;

describe('portal preflight', () => {
  it('requires Node 22', () => {
    assert.throws(
      () => assertNode22('20.19.0'),
      /portal preflight: Node\.js 22 is required \(found v20\.19\.0\)\./,
    );
    assert.doesNotThrow(() => assertNode22('22.23.4'));
  });

  it('rejects production unique-turtle-383', () => {
    assert.throws(
      () =>
        assertSharedDevEnv(
          parseEnv(`
CONVEX_DEPLOYMENT=prod:unique-turtle-383
NEXT_PUBLIC_CONVEX_URL=https://unique-turtle-383.convex.cloud
`),
        ),
      /portal preflight: CONVEX_DEPLOYMENT points at unique-turtle-383\. Refusing to start\. Production is unique-turtle-383\. Mac and cloud agents use the one shared dev: deployment\./,
    );
    assert.throws(
      () =>
        assertSharedDevEnv(
          parseEnv(`
CONVEX_DEPLOYMENT=dev:shared-dev-name
NEXT_PUBLIC_CONVEX_URL=https://unique-turtle-383.convex.cloud
`),
        ),
      /portal preflight: NEXT_PUBLIC_CONVEX_URL points at unique-turtle-383\. Refusing to start\./,
    );
  });

  it('rejects a deployment that is not dev:', () => {
    assert.throws(
      () =>
        assertSharedDevEnv(
          parseEnv(`
CONVEX_DEPLOYMENT=prod:other-name
NEXT_PUBLIC_CONVEX_URL=https://other-name.convex.cloud
`),
        ),
      /portal preflight: CONVEX_DEPLOYMENT is not a dev: deployment/,
    );
  });

  it('accepts one shared dev deployment when the URL matches', () => {
    assert.doesNotThrow(() => assertSharedDevEnv(parseEnv(shared)));
    assert.doesNotThrow(() =>
      runPreflight({
        push: false,
        nodeVersion: '22.14.0',
        envText: 'export CONVEX_DEPLOYMENT="dev:shared-dev-name"\nNEXT_PUBLIC_CONVEX_URL=https://shared-dev-name.convex.cloud\n',
      }),
    );
  });

  it('fails when .env.local is missing', () => {
    assert.throws(
      () =>
        runPreflight({
          nodeVersion: '22.0.0',
          envPath: '/tmp/warehaus-preflight-missing.env.local',
        }),
      /portal preflight: apps\/portal\/\.env\.local is missing/,
    );
  });
});

describe('script wiring', () => {
  const rootPkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const portalPkg = JSON.parse(
    readFileSync(new URL('../apps/portal/package.json', import.meta.url), 'utf8'),
  );
  const portalVercel = JSON.parse(
    readFileSync(new URL('../apps/portal/vercel.json', import.meta.url), 'utf8'),
  );
  const webVercel = readFileSync(new URL('../apps/web/vercel.json', import.meta.url), 'utf8');

  it('runs preflight before portal and convex dev, not before fixtures', () => {
    assert.match(rootPkg.scripts['dev:portal'], /preflight-portal-dev\.mjs && turbo run dev --filter=@warehaus\/portal/);
    assert.equal(
      rootPkg.scripts['dev:portal:local'],
      'NEXT_PUBLIC_PORTAL_FIXTURES=1 turbo run dev --filter=@warehaus/portal',
    );
    assert.doesNotMatch(rootPkg.scripts['dev:portal:local'], /preflight/);
    assert.equal(rootPkg.scripts['dev:local'], 'node scripts/dev-local.mjs');
    assert.match(portalPkg.scripts['dev:convex'], /preflight-portal-dev\.mjs --push && convex dev/);
    assert.doesNotMatch(portalPkg.scripts.dev, /convex dev/);
  });

  it('disables git deploys for the portal project only', () => {
    assert.equal(portalVercel.git.deploymentEnabled, false);
    assert.equal(portalVercel.crons.length, 0);
    assert.doesNotMatch(webVercel, /deploymentEnabled/);
  });
});
