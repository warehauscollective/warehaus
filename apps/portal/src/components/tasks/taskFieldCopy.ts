/** Confirm body for ConfirmFrame kind=archive. Notion is named only when write-back is on. */
export function archiveConfirmCopy(name: string, subtasks: number, notion = false): string {
  const quoted = `“${name}”`;
  const leave = subtasks <= 0
    ? `${quoted} leaves the board and the client portal.`
    : `${quoted} and its ${subtasks === 1 ? '1 sub-task' : `${subtasks} sub-tasks`} leave the board and the client portal.`;
  return notion ? `${leave} This also archives the task’s page in Notion.` : leave;
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
