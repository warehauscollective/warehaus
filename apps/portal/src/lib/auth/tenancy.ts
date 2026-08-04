/**
 * Portal tenancy helpers.
 *
 * Host-based multi-tenancy (preferred):
 * - `portal.{root}` / apex / bare localhost → team
 * - `{slug}.{root}` → client tenant
 *
 * Env overrides (local debug):
 * - `PORTAL_TENANT_MODE=team|client`
 * - `PORTAL_CLIENT_ID=CLI-001` (forces client scope even on team hosts)
 */

export type TenantMode = 'team' | 'client';

export const TENANT_MODE_HEADER = 'x-warehaus-tenant-mode';
export const TENANT_SLUG_HEADER = 'x-warehaus-slug';

export interface HostTenantHint {
  mode: TenantMode;
  slug: string | null;
}

export interface ResolvedTenant {
  mode: TenantMode;
  slug: string | null;
  clientExternalId: string | null;
  clientName: string | null;
  /** false when client slug is unknown or portal access disabled */
  ok: boolean;
  error?: 'unknown_tenant' | 'portal_disabled';
}

function parseRootDomains(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw =
    env.ROOT_DOMAINS?.trim() ||
    'warehaus.vercel.app,warehaus.co,localhost';
  return raw
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
}

function teamSubdomain(env: NodeJS.ProcessEnv = process.env): string {
  return (env.TEAM_SUBDOMAIN?.trim() || 'portal').toLowerCase();
}

/** Parse Host / x-forwarded-host into a tenant hint (no DB lookup). */
export function parseHostTenant(
  hostHeader: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): HostTenantHint {
  const forced = env.PORTAL_TENANT_MODE?.trim().toLowerCase();
  if (forced === 'team') {
    return { mode: 'team', slug: null };
  }
  if (forced === 'client') {
    const slug =
      env.PORTAL_CLIENT_SLUG?.trim().toLowerCase() ||
      null;
    return { mode: 'client', slug };
  }

  const host = (hostHeader ?? '').split(',')[0]?.trim().toLowerCase() ?? '';
  const hostname = host.split(':')[0] || 'localhost';
  const roots = parseRootDomains(env);
  const team = teamSubdomain(env);

  for (const root of roots) {
    if (hostname === root) {
      return { mode: 'team', slug: null };
    }
    const suffix = `.${root}`;
    if (hostname.endsWith(suffix)) {
      const sub = hostname.slice(0, -suffix.length);
      const label = sub.split('.').filter(Boolean).pop() ?? '';
      if (!label || label === 'www' || label === team) {
        return { mode: 'team', slug: null };
      }
      return { mode: 'client', slug: label };
    }
  }

  return { mode: 'team', slug: null };
}

export function getPortalClientId(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  return env.PORTAL_CLIENT_ID?.trim() || undefined;
}

/**
 * Team-debug helper: missing client on a row is allowed.
 * Prefer `assertWritableForTenant` / `scopeCollectionsForClient` for client hosts.
 */
export function assertClientAccess(
  recordClientId: string | null | undefined,
  portalClientId: string | undefined,
): boolean {
  if (!portalClientId) return true;
  if (!recordClientId) return true;
  return recordClientId === portalClientId;
}

/** Client hosts require an exact clientExternalId match — null never passes. */
export function assertStrictClientAccess(
  recordClientId: string | null | undefined,
  portalClientId: string,
): boolean {
  return recordClientId === portalClientId;
}

export function normalizeSlug(slug: string | null | undefined): string | null {
  if (!slug) return null;
  const cleaned = slug
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || null;
}

/** Notion integration scope checklist (ops). */
export const NOTION_SCOPE_CHECKLIST = [
  'Warehaus integration shared only on Warehaus space DBs',
  'Motoko NOTION_TOKEN shared only on Second Brain DBs',
  'Bridge uses NOTION_WAREHAUS_TOKEN separately from day-to-day Motoko tools',
  'Composio Notion OAuth pointed at Second Brain only',
  'Shipments are dead — never sync or surface in the portal',
] as const;
