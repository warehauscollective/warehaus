/** Resources list counts and row copy. Existing fields only — no new columns. */

export type ResourceListFilter = 'all' | 'meeting-notes' | 'files-links' | 'draft-recap';

export type ResourceListInput = {
  type?: string | null;
  publishToWarehaus?: boolean;
  attachedCount?: number | null;
};

export function isMeetingResource(type: string | null | undefined): boolean {
  return /meeting|recap|notes|granola/i.test(type ?? '');
}

export function isDraftRecap(row: ResourceListInput): boolean {
  return isMeetingResource(row.type) && row.publishToWarehaus === false;
}

export function isPublishedRecap(row: ResourceListInput): boolean {
  return isMeetingResource(row.type) && row.publishToWarehaus === true;
}

/** Source label already implied by the resource type. Not a second field. */
export function resourceSourceLabel(type: string | null | undefined): string {
  const value = (type ?? '').toLowerCase();
  if (/granola|meeting|note|recap/.test(value)) return 'Granola';
  if (/link|url/.test(value)) return 'Link';
  if (/file|pdf|article/.test(value)) return 'File';
  return type?.trim() || 'Resource';
}

export function resourceTitleLine(name: string, updatedAt: number | null | undefined): string {
  if (updatedAt == null) return name;
  const when = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(updatedAt);
  return `${name} · ${when}`;
}

/** "Source · attached item" plus "+N" when more than one attachment is known. */
export function resourceAttachmentMeta(
  source: string,
  item: string | null | undefined,
  extra: number,
): string {
  const name = item?.trim();
  if (!name) return source;
  return extra > 0 ? `${source} · ${name} +${extra}` : `${source} · ${name}`;
}

export function resourceMatchesFilter(row: ResourceListInput, filter: ResourceListFilter): boolean {
  if (filter === 'draft-recap') return isDraftRecap(row);
  if (filter === 'meeting-notes') return isMeetingResource(row.type);
  if (filter === 'files-links') return !isMeetingResource(row.type);
  return true;
}

/**
 * Counts from the rows this audience can already see.
 * Clients never receive unpublished rows, so draft recaps stay at 0
 * instead of repeating a staff-only total.
 */
export function resourceListStats(rows: readonly ResourceListInput[], staff: boolean) {
  const meetings = rows.filter((row) => isMeetingResource(row.type));
  const drafts = staff ? rows.filter((row) => isDraftRecap(row)) : [];
  const published = staff ? rows.filter((row) => isPublishedRecap(row)) : meetings;
  const attachedKnown = meetings.some((row) => typeof row.attachedCount === 'number');
  const attached = attachedKnown
    ? meetings.filter((row) => (row.attachedCount ?? 0) > 0).length
    : null;
  return {
    meetings: meetings.length,
    drafts: drafts.length,
    published: published.length,
    files: rows.filter((row) => !isMeetingResource(row.type)).length,
    total: rows.length,
    attached,
  };
}

export function attachedHint(attached: number | null, staff: boolean): string {
  if (attached == null) return staff ? 'In this list' : 'Shared with you';
  return `${attached} attached to items`;
}
