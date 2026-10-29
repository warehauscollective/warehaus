/**
 * Preview fixture gate. True only for local `next dev` with
 * NEXT_PUBLIC_PORTAL_FIXTURES=1. Any Vercel process fails closed:
 * VERCEL=1, or any set VERCEL_ENV (production, preview, or development).
 *
 * Read env dynamically so a preview build promoted to production still sees
 * the runtime VERCEL_ENV instead of a value baked at build time.
 */

export type FixturePreviewEnv = {
  fixturesFlag?: string;
  vercelEnv?: string;
  vercel?: string;
};

export function readRuntimeEnv(name: string): string | undefined {
  return (process.env as Record<string, string | undefined>)[name];
}

export function fixturePreviewAllowedFrom(env: FixturePreviewEnv): boolean {
  if (env.fixturesFlag !== '1') return false;
  if (env.vercel === '1') return false;
  if (env.vercelEnv != null && env.vercelEnv !== '') return false;
  return true;
}

export function fixturePreviewAllowed(): boolean {
  return fixturePreviewAllowedFrom({
    fixturesFlag: readRuntimeEnv('NEXT_PUBLIC_PORTAL_FIXTURES'),
    vercelEnv: readRuntimeEnv('VERCEL_ENV'),
    vercel: readRuntimeEnv('VERCEL'),
  });
}
