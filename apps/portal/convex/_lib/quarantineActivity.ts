/**
 * Staff Activity → Exceptions rows for the quarantine table.
 * Clients never receive these. Unscoped rows (no org) are sync-level and
 * show for every staff session; org-scoped rows show on that org only.
 */

export type QuarantineActivityRow = {
  id: string;
  notionPageId: string;
  database: string;
  reason: string;
  createdAt: number;
  orgId?: string | null;
};

export function staffQuarantineActivity(rows: QuarantineActivityRow[], orgId: string) {
  return rows
    .filter((row) => row.orgId == null || row.orgId === orgId)
    .map((row) => ({
      id: row.id,
      name: 'Sync quarantine',
      type: 'exception' as const,
      summary: `${row.database} ${row.notionPageId}: ${row.reason}`,
      timestamp: new Date(row.createdAt).toISOString(),
      tone: 'danger' as const,
      projectId: null as null,
    }));
}
