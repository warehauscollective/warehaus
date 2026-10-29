/** Read-only resource detail. Recap text is the live description. No second resources database. */

export function notionNotesHref(notionPageId: string | null | undefined): string | null {
  if (!notionPageId) return null;
  if (/^(portal:|pending:)/i.test(notionPageId)) return null;
  const compact = notionPageId.replace(/-/g, '');
  if (!/^[0-9a-f]{32}$/i.test(compact)) return null;
  return `https://www.notion.so/${compact}`;
}

export function usedInTasksSubtitle(count: number): string {
  if (count === 0) return 'Not linked to any task yet';
  const noun = count === 1 ? 'task' : 'tasks';
  return `${count} ${noun} · click to open the task`;
}

export function resourceMeta(type: string | null | undefined, updatedAt: number | null | undefined): string {
  const when =
    updatedAt == null
      ? null
      : new Intl.DateTimeFormat('en-US', {
          month: 'short',
          day: 'numeric',
          timeZone: 'UTC',
        }).format(updatedAt);
  const parts = [type?.trim() || null, when].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : 'Resource';
}
