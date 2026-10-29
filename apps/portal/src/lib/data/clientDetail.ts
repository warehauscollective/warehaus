/** Read-only client detail. Brand is the client company — there is no second database. */

const STUDIO_PROJECT = 'warehaus.studio';
const STUDIO_EMAIL = '@warehaus.studio';

export const CLIENT_LEAK_KEYS = [
  'notionPageId',
  'publishToWarehaus',
  'lastSyncedAt',
  'syncHidden',
  'syncState',
  'syncNotice',
  'internal',
  'externalId',
  'sourceNotionUrl',
] as const;

export function isStudioProjectName(name: string | null | undefined): boolean {
  return (name ?? '').trim().toLowerCase() === STUDIO_PROJECT;
}

export function isStudioEmail(email: string | null | undefined): boolean {
  return (email ?? '').trim().toLowerCase().endsWith(STUDIO_EMAIL);
}

/** Earliest project start, shown as "Client since March 2026". No date means the clause stays off. */
export function formatClientSince(dates: Array<string | null | undefined>): string | null {
  const times = dates
    .map((value) => (value ? Date.parse(`${value}T00:00:00Z`) : Number.NaN))
    .filter((value) => !Number.isNaN(value));
  if (times.length === 0) return null;
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Math.min(...times)));
}

export function staffHeaderLine(since: string | null, lead: string | null): string | null {
  const parts: string[] = [];
  if (since) parts.push(`Client since ${since}`);
  if (lead) parts.push(`Warehaus lead: ${lead}`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

export function brandLine(brand: string): string {
  const name = brand.trim();
  return name ? `Brand: ${name}` : 'Brand: —';
}

export function warehausLead(
  people: Array<{ name: string; role?: string | null }>,
): string | null {
  const lead = people.find((person) => person.role === 'Warehaus Staff' && person.name.trim());
  return lead?.name.trim() ?? null;
}

/** People a client may see. Staff contacts and warehaus.studio mail stay off. */
export function clientVisiblePerson(person: { role?: string | null; email?: string | null }): boolean {
  if (person.role === 'Warehaus Staff') return false;
  if (isStudioEmail(person.email)) return false;
  return true;
}

export function withoutClientLeaks<T extends object>(row: T): T {
  const next = { ...row } as Record<string, unknown>;
  for (const key of CLIENT_LEAK_KEYS) delete next[key];
  return next as T;
}
