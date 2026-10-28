/**
 * One identity for a notices-table row.
 * Staff sync, conflict, unknown Stage, and invite state all use this.
 * Read state is per contact on noticeReads. `notices.readAt` does not
 * open a slot for another copy of the same notice.
 */
export type NoticeIdentity = {
  audience: 'staff' | 'clientAdmin';
  orgId: string;
  message: string;
  edgeCase?: string | null;
  contactNotionPageId?: string | null;
};

export function isDuplicateNotice(
  existing: ReadonlyArray<NoticeIdentity & { readAt?: number | null }>,
  next: NoticeIdentity,
): boolean {
  const edge = next.edgeCase ?? null;
  const contact = next.contactNotionPageId ?? null;
  return existing.some(
    (row) =>
      row.audience === next.audience &&
      row.orgId === next.orgId &&
      row.message === next.message &&
      (row.edgeCase ?? null) === edge &&
      (row.contactNotionPageId ?? null) === contact,
  );
}
