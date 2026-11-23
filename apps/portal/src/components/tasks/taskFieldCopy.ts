export function projectMoveCopy(taskName: string, fromName: string, toName: string): string {
  return `“${taskName}” moves from ${fromName} to ${toName}. Visibility doesn’t change.`;
}

export function fieldSaveNote(notion: 'off' | 'queued' | 'portal', wrote: boolean): string | null {
  if (!wrote) return null;
  if (notion === 'queued') return 'Queued for Notion.';
  if (notion === 'off') return 'Saved in the Portal only · Notion write-back is off.';
  return null;
}
