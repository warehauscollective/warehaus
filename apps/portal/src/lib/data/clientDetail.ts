import { formatPortalDate } from '@/lib/data/view-models';

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

/** Your brands meta. Hidden when the brand is the company itself. */
export function clientBrandMeta(companyName: string, brand?: string | null): string | null {
  const company = companyName.trim();
  const value = (brand ?? company).trim();
  if (!value || value.localeCompare(company, undefined, { sensitivity: 'accent' }) === 0) return null;
  return `Brand: ${value}`;
}

/** Calm sync line on the staff client card. A missing time stays "In sync". */
export function inSyncLine(lastSyncedAt: number | null | undefined, now = Date.now()): string {
  if (lastSyncedAt == null || Number.isNaN(lastSyncedAt)) return 'In sync';
  const minutes = Math.max(0, Math.round((now - lastSyncedAt) / 60000));
  if (minutes < 1) return 'In sync · just now';
  if (minutes < 60) return `In sync · ${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `In sync · ${hours}h ago`;
  const days = Math.round(hours / 24);
  return `In sync · ${days}d ago`;
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

/** Client stage badge. Matches the dashboard awaiting label. */
export const CLIENT_TEAM_STAGE_LABEL = 'Pending approval';

export function clientPersonStatus(person: {
  invitePending?: boolean;
  portalAccess?: string | null;
}): string {
  if (person.invitePending) return 'Invite pending';
  if (person.portalAccess === 'Enabled') return 'Active';
  return 'No portal access';
}

/** Desktop trail is Account / Company / Your team. Phone keeps Company, the page you go back to. */
export function clientTeamCrumbs(phone: boolean): {
  parent: 'Account' | 'Company';
  middle: 'Company' | null;
  current: 'Your team';
  back: 'account' | 'company';
} {
  if (phone) {
    return { parent: 'Company', middle: null, current: 'Your team', back: 'company' };
  }
  return { parent: 'Account', middle: 'Company', current: 'Your team', back: 'account' };
}

/** Notice only. It does not send an invite. */
export function clientTeamInviteCopy(
  company: string,
  people: Array<{ name: string; role?: string | null }>,
): { title: string; body: string } {
  const admin = people.find((person) => person.role === 'Client Admin' && person.name.trim());
  const who = admin ? admin.name.trim().split(/\s+/)[0] : 'A Client Admin';
  return {
    title: 'Client Admins can invite teammates',
    body: `${who} can invite new Client Members from Account › Team. Invited people only see ${company}.`,
  };
}

export function clientUpdatedLabel(task: {
  lastEditedTime?: string | null;
  date?: string | null;
}): string | null {
  if (!task.lastEditedTime) return null;
  const label = formatPortalDate(task.lastEditedTime);
  if (!label || label === '—') return null;
  return `Updated ${label}`;
}

export function clientDueLabel(date: string | null | undefined): string | null {
  if (!date) return null;
  const dueTime = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(dueTime)) return null;
  const label = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(dueTime));
  return `Due ${label}`;
}

export function withoutClientLeaks<T extends object>(row: T): T {
  const next = { ...row } as Record<string, unknown>;
  for (const key of CLIENT_LEAK_KEYS) delete next[key];
  return next as T;
}
