/**
 * Preview fixture gate. Both conditions are required.
 * A missing flag, VERCEL_ENV=production, or an unknown Vercel env fails closed.
 * Local `next dev` is allowed only when the process is not running on Vercel.
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
  if (env.vercelEnv === 'production') return false;
  if (env.vercelEnv === 'preview' || env.vercelEnv === 'development') return true;
  if (env.vercel === '1' || (env.vercelEnv != null && env.vercelEnv !== '')) return false;
  return true;
}

export function fixturePreviewAllowed(): boolean {
  return fixturePreviewAllowedFrom({
    fixturesFlag: readRuntimeEnv('NEXT_PUBLIC_PORTAL_FIXTURES'),
    vercelEnv: readRuntimeEnv('VERCEL_ENV'),
    vercel: readRuntimeEnv('VERCEL'),
  });
}
