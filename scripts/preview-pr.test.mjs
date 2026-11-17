import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  PROD_SLUG,
  SHARED_DEV_SLUG,
  assertBranchName,
  assertPreviewTarget,
  failureMessage,
  isProductionConvexHost,
  isProductionDeployment,
  previewBanner,
  previewEnv,
  previewUrl,
  serverLaunch,
  switchAndInstallSteps,
} from './preview-pr.mjs';

const SECRET = 'super-secret-token-value';

const sharedEnv = {
  CONVEX_DEPLOYMENT: `dev:${SHARED_DEV_SLUG}`,
  NEXT_PUBLIC_CONVEX_URL: `https://${SHARED_DEV_SLUG}.convex.cloud`,
  NEXT_PUBLIC_CONVEX_SITE_URL: `https://${SHARED_DEV_SLUG}.convex.site`,
  CONVEX_CLOUD_URL: `https://${SHARED_DEV_SLUG}.convex.cloud`,
  CONVEX_SITE_URL: `https://${SHARED_DEV_SLUG}.convex.site`,
  NOTION_WAREHAUS_TOKEN: SECRET,
};

function assertHidden(error, pattern) {
  assert.equal(error instanceof Error, true);
  assert.equal(error.message.includes(SECRET), false);
  assert.equal(error.message.includes('https://'), false);
  assert.match(error.message, pattern);
}

describe('preview target', () => {
  it('accepts shared dev graceful-mastiff-960 only', () => {
    assert.doesNotThrow(() => assertPreviewTarget(sharedEnv));
  });

  it('refuses production unique-turtle-383 without printing the URL', () => {
    assert.throws(
      () =>
        assertPreviewTarget({
          ...sharedEnv,
          CONVEX_DEPLOYMENT: `prod:${PROD_SLUG}`,
          NEXT_PUBLIC_CONVEX_URL: `https://user:${SECRET}@${PROD_SLUG}.convex.cloud/?token=${SECRET}`,
        }),
      (error) => {
        assertHidden(error, /production/);
        assert.match(error.message, new RegExp(PROD_SLUG));
        return true;
      },
    );
    assert.throws(
      () =>
        assertPreviewTarget({
          ...sharedEnv,
          NEXT_PUBLIC_CONVEX_URL: `https://${PROD_SLUG}.convex.cloud`,
        }),
      (error) => {
        assertHidden(error, /production/);
        return true;
      },
    );
  });

  it('refuses any other production host', () => {
    assert.equal(isProductionConvexHost(`${PROD_SLUG}.convex.cloud`), true);
    assert.equal(isProductionConvexHost(`${PROD_SLUG}.convex.site`), true);
    assert.equal(isProductionConvexHost('warehaus-portal.vercel.app'), true);
    assert.equal(isProductionConvexHost('other-prod.convex.cloud'), true);
    assert.equal(isProductionConvexHost(`${SHARED_DEV_SLUG}.convex.cloud`), false);
    assert.equal(isProductionDeployment(`prod:other-app`), true);
    assert.equal(isProductionDeployment(`dev:${SHARED_DEV_SLUG}`), false);

    for (const host of ['other-prod.convex.cloud', 'preview-app.vercel.app', 'another.convex.site']) {
      assert.throws(
        () =>
          assertPreviewTarget({
            ...sharedEnv,
            NEXT_PUBLIC_CONVEX_URL: `https://${host}`,
          }),
        (error) => {
          assertHidden(error, /production host/);
          assert.equal(error.message.includes(host), false);
          return true;
        },
      );
    }
  });

  it('refuses a non-shared dev deployment and a credentialed URL', () => {
    assert.throws(
      () =>
        assertPreviewTarget({
          ...sharedEnv,
          CONVEX_DEPLOYMENT: 'dev:some-other-name',
        }),
      /not shared dev graceful-mastiff-960/,
    );
    assert.throws(
      () =>
        assertPreviewTarget({
          ...sharedEnv,
          NEXT_PUBLIC_CONVEX_URL: `https://user:${SECRET}@${SHARED_DEV_SLUG}.convex.cloud`,
        }),
      (error) => {
        assertHidden(error, /bare Convex origin/);
        return true;
      },
    );
  });

  it('lets a production process env override the file and still refuses', () => {
    const merged = previewEnv(sharedEnv, {
      NEXT_PUBLIC_CONVEX_URL: `https://${PROD_SLUG}.convex.cloud`,
      NOTION_WAREHAUS_TOKEN: SECRET,
    });
    assert.throws(
      () => assertPreviewTarget(merged),
      (error) => {
        assertHidden(error, /production/);
        return true;
      },
    );
  });
});

describe('preview command', () => {
  it('checks out a new or existing branch, then installs, and never calls Convex', () => {
    const fresh = switchAndInstallSteps({ branch: 'feature/preview', localExists: false });
    assert.deepEqual(fresh, [
      ['git', 'checkout', '-b', 'feature/preview', 'origin/feature/preview'],
      ['npm', 'install'],
    ]);
    const existing = switchAndInstallSteps({ branch: 'feature/preview', localExists: true });
    assert.deepEqual(existing, [
      ['git', 'checkout', 'feature/preview'],
      ['git', 'merge', '--ff-only', 'origin/feature/preview'],
      ['npm', 'install'],
    ]);
    const flat = JSON.stringify([...fresh, ...existing]);
    assert.equal(flat.includes('convex'), false);
    assert.equal(flat.includes('--prod'), false);
  });

  it('rejects unsafe branch names', () => {
    assert.throws(() => assertBranchName('--prod'), /not usable/);
    assert.throws(() => assertBranchName('feature/../../.env'), /not usable/);
    assert.throws(() => assertBranchName('feature name'), /not usable/);
    assert.doesNotThrow(() => assertBranchName('cursor/milestone-build-protocol-7303'));
  });

  it('prints only the localhost URL and the deployment name', () => {
    assert.equal(previewUrl(), 'http://localhost:3100');
    assert.equal(previewUrl('3101'), 'http://localhost:3101');
    const lines = previewBanner('feature/preview', previewUrl()).join('\n');
    assert.match(lines, /http:\/\/localhost:3100/);
    assert.match(lines, new RegExp(SHARED_DEV_SLUG));
    assert.equal(lines.includes(SECRET), false);
    assert.equal(lines.includes('convex.cloud'), false);
    const launch = serverLaunch('/repo');
    assert.equal(launch.command, process.execPath);
    assert.deepEqual(launch.args, ['/repo/scripts/dev-app.mjs', 'portal']);
    assert.equal(JSON.stringify(launch).includes('convex'), false);
  });

  it('keeps git and npm failures free of command output', () => {
    const leaked = `fatal: https://x-access-token:${SECRET}@github.com/org/repo`;
    for (const kind of ['fetch', 'checkout', 'merge', 'install', 'status', 'missing-branch']) {
      const message = failureMessage(kind);
      assert.equal(message.includes(SECRET), false);
      assert.equal(message.includes(leaked), false);
      assert.match(message, /^preview: /);
    }
  });

  it('wires npm run preview:pr to this script and not to convex dev', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    assert.equal(pkg.scripts['preview:pr'], 'node scripts/preview-pr.mjs');
    assert.equal(pkg.scripts['test:preview-pr'], 'node --test scripts/preview-pr.test.mjs');
    assert.doesNotMatch(pkg.scripts['preview:pr'], /convex/);
    const source = readFileSync(new URL('./preview-pr.mjs', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /convex\s+dev/);
    assert.doesNotMatch(source, /convex\s+deploy/);
    assert.doesNotMatch(source, /--prod/);
    assert.match(source, /dev-app\.mjs/);
  });
});

describe('protocol text', () => {
  const files = [
    new URL('../AGENTS.md', import.meta.url),
    new URL('../CLAUDE.md', import.meta.url),
    new URL('../.cursor/rules/milestone-build-protocol.mdc', import.meta.url),
  ];

  it('keeps the required rules in each agent instruction file', () => {
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      assert.match(text, /Portal milestone/);
      assert.match(text, /Dark and Light at 1440 and 390/);
      assert.match(text, /Figma/);
      assert.match(text, /graceful-mastiff-960/);
      assert.match(text, /unique-turtle-383/);
      assert.match(text, /Grok Bot/);
      assert.match(text, /iteration tasks/);
      assert.match(text, /indexed reads/);
      assert.match(text, /bounded pagination/);
      assert.match(text, /whole-table scans/);
      assert.match(text, /no-op writes/);
      assert.match(text, /convex dev/);
      assert.match(text, /production Notion token/);
      assert.match(text, /real Warehaus Notion/);
      assert.match(text, /test Notion spec is coming/);
      assert.match(text, /Peter never approves in Notion/);
    }
  });

  it('keeps the Eurostile brand block in CLAUDE.md', () => {
    const text = readFileSync(new URL('../CLAUDE.md', import.meta.url), 'utf8');
    assert.match(text, /<!-- BRAND-GUIDELINES-START -->[\s\S]*Eurostile[\s\S]*<!-- BRAND-GUIDELINES-END -->/);
  });
});
