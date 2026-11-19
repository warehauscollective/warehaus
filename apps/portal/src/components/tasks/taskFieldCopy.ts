/** Confirm body for ConfirmFrame kind=archive. */
export function archiveConfirmCopy(name: string, subtasks: number): string {
  const quoted = `“${name}”`;
  const notion = 'This also archives the task’s page in Notion.';
  if (subtasks <= 0) return `${quoted} leaves the board and the client portal. ${notion}`;
  const label = subtasks === 1 ? '1 sub-task' : `${subtasks} sub-tasks`;
  return `${quoted} and its ${label} leave the board and the client portal. ${notion}`;
}

export function projectMoveCopy(taskName: string, fromName: string, toName: string): string {
  return `“${taskName}” moves from ${fromName} to ${toName}. Visibility doesn’t change.`;
}

export function fieldSaveNote(notion: 'off' | 'queued' | 'portal', wrote: boolean): string | null {
  if (!wrote) return null;
  if (notion === 'queued') return 'Queued for Notion.';
  if (notion === 'off') return 'Saved in the Portal only · Notion write-back is off.';
  return null;
}
