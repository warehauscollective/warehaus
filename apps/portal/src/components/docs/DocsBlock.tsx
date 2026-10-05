import { Pill } from '@/components/ui/primitives';
import { PublishChip, SyncChip } from '@/components/sync/SyncChip';

export type DocRow = {
  id: string;
  orgId?: string;
  projectId?: string | null;
  title: string;
  summary: string | null;
  docType: string;
  order: number | null;
  status?: string;
  publishToWarehaus?: boolean;
  notionPageId?: string | null;
  syncHidden?: boolean;
};

export function DocsBlock({
  docs,
  staff,
}: {
  docs: DocRow[];
  staff: boolean;
}) {
  return (
    <section className="flex flex-col gap-2">
      <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--faint)' }}>
        Docs
      </p>
      {docs.length === 0 ? (
        <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>No docs on this record.</p>
      ) : (
        docs.map((doc) => (
          <div
            key={doc.id}
            style={{
              padding: '0.7rem 0.8rem',
              borderRadius: 10,
              border: '1px solid var(--border)',
            }}
          >
            <div className="flex flex-wrap items-center gap-2">
              <strong style={{ fontSize: 'var(--t-sm)', overflowWrap: 'anywhere' }}>{doc.title}</strong>
              <Pill>{doc.docType}</Pill>
              {doc.status ? <Pill>{doc.status}</Pill> : null}
              {staff && doc.publishToWarehaus != null ? (
                <PublishChip published={doc.publishToWarehaus} />
              ) : null}
              <SyncChip notionPageId={doc.notionPageId} syncHidden={doc.syncHidden} />
            </div>
            <p style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)', marginTop: 4 }}>
              {doc.summary ?? '—'}
              {doc.order != null ? ` · Order ${doc.order}` : ''}
            </p>
          </div>
        ))
      )}
    </section>
  );
}
