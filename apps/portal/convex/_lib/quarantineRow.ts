/**
 * One quarantine row per Notion page and edit time.
 * A repeated pass of the same edit updates nothing; a newer edit is a new row.
 */

export type QuarantineIdentity = {
  id: string;
  notionPageId: string;
  editedAtMs?: number | null;
};

export function matchingQuarantineId(
  rows: QuarantineIdentity[],
  incoming: { notionPageId: string; editedAtMs?: number | null },
): string | null {
  const editedAtMs = incoming.editedAtMs ?? null;
  const match = rows.find(
    (row) =>
      row.notionPageId === incoming.notionPageId && (row.editedAtMs ?? null) === editedAtMs,
  );
  return match?.id ?? null;
}
