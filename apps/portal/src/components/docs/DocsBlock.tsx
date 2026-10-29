import { useState, type ReactNode } from 'react';
import { compareDocsByOrder } from '@warehaus/portal-sync';
import { OutlineButton } from '@/components/ui/primitives';
import { SyncChip } from '@/components/sync/SyncChip';
import type { RowSyncState } from '@/lib/data/view-models';

export type DocRow = {
  id: string;
  orgId?: string;
  projectId?: string | null;
  title: string;
  summary: string | null;
  docType: string;
  /** Sort key only. Never rendered. Omitted from client payloads. */
  order?: number | null;
  status?: string;
  publishToWarehaus?: boolean;
  notionPageId?: string | null;
  syncHidden?: boolean;
  syncState?: RowSyncState | null;
  lastSyncedAt?: number | null;
  updatedAt?: number | string | null;
  body?: string | null;
};

/**
 * Empty-state sentences are a placeholder draft until Peter approves them.
 */
const EMPTY_COPY = {
  staff: {
    title: 'No docs yet',
    body: 'Add a doc here or in the Notion Docs database. Clients only see docs you publish.',
  },
  client: {
    title: 'Nothing shared yet',
    body: 'Your Warehaus team will share briefs, scopes and guides here.',
  },
} as const;

/** Order ascending, then title. A missing Order sorts after every numbered row and is never shown. */
export function sortDocRows(docs: readonly DocRow[]): DocRow[] {
  return [...docs].sort(compareDocsByOrder);
}

function formatUpdated(value?: number | string | null): string | null {
  if (value == null || value === '') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const label = date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    ...(typeof value === 'number' && value > 1_000_000_000_000
      ? {}
      : { timeZone: 'UTC' }),
  });
  return `Updated ${label}`;
}

function formatSynced(value?: number | null): string | null {
  if (value == null) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function DocTypeTag({ type }: { type: string }) {
  if (!type.trim()) return null;
  return (
    <span
      className="ds-mono inline-flex shrink-0 items-center whitespace-nowrap"
      style={{
        border: '1px solid var(--border)',
        borderRadius: 999,
        padding: '4px 10px',
        fontSize: 11,
        letterSpacing: '0.44px',
        color: 'var(--fg)',
      }}
    >
      {type}
    </span>
  );
}

function DocIcon() {
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center"
      style={{
        width: 36,
        height: 36,
        borderRadius: 10,
        background: 'var(--surface-2, var(--surface))',
        border: '1px solid var(--border)',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icons/docs-doc.svg" alt="" width={16} height={16} />
    </span>
  );
}

function Chevron() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/icons/docs-chev.svg" alt="" width={16} height={16} className="shrink-0" />
  );
}

function PublishedMark({ published }: { published: boolean }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap" style={{ padding: '4px 8px' }}>
      {published ? (
        <span
          aria-hidden
          style={{
            width: 8,
            height: 8,
            background: 'var(--fg)',
            WebkitMask: 'url(/icons/docs-dot-on.svg) center / contain no-repeat',
            mask: 'url(/icons/docs-dot-on.svg) center / contain no-repeat',
          }}
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src="/icons/docs-dot-off.svg" alt="" width={8} height={8} />
      )}
      <span
        className="ds-mono"
        style={{ fontSize: 11, letterSpacing: '0.44px', color: published ? 'var(--fg)' : 'var(--muted)' }}
      >
        {published ? 'Published' : 'Not published'}
      </span>
    </span>
  );
}

function Clamp({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <span className="docs-clamp block" title={title}>
      {children}
    </span>
  );
}

export function DocsBlock({
  docs,
  staff,
  loading = false,
}: {
  docs: DocRow[];
  staff: boolean;
  loading?: boolean;
}) {
  const [note, setNote] = useState<string | null>(null);
  const rows = sortDocRows(docs);
  const count = rows.length;
  const empty = EMPTY_COPY[staff ? 'staff' : 'client'];

  return (
    <section
      className="docs-block flex flex-col"
      style={{
        border: '1px solid var(--border)',
        borderRadius: 16,
        padding: '28px 32px',
        gap: 4,
      }}
      data-testid={staff ? 'docs-staff' : 'docs-client'}
    >
      <style>{`
        .docs-clamp {
          display: -webkit-box;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 1;
          overflow: hidden;
        }
        .docs-main { display: flex; align-items: center; gap: 16px; flex: 1; min-width: 0; order: 1; }
        .docs-badges { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; justify-content: flex-end; order: 2; }
        .docs-chev { order: 3; }
        @media (max-width: 480px) {
          .docs-clamp { -webkit-line-clamp: 2; }
          .docs-row { align-items: flex-start; }
          .docs-main { flex: 1 1 0; min-width: 0; align-items: flex-start; gap: 12px; }
          .docs-chev { order: 2; flex: 0 0 auto; margin-top: 2px; }
          .docs-badges { order: 3; flex: 1 0 100%; flex-wrap: wrap; overflow: visible; justify-content: flex-start; align-items: center; gap: 6px; padding-left: 48px; box-sizing: border-box; }
          .docs-block { padding: 20px 16px !important; }
        }
        .docs-row:focus-visible {
          outline: 2px solid var(--accent);
          outline-offset: 2px;
        }
      `}</style>
      <div className="flex items-center gap-3">
        <div className="flex min-w-0 flex-1 items-baseline gap-2.5">
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600, margin: 0 }}>Docs</h2>
          {staff ? (
            <span className="ds-mono" style={{ fontSize: 12, color: 'var(--muted)' }}>{count}</span>
          ) : count > 0 ? (
            <span className="ds-mono" style={{ fontSize: 12, color: 'var(--muted)' }}>{count}</span>
          ) : null}
        </div>
        {staff ? (
          <OutlineButton onClick={() => setNote('Add doc is not wired yet. Nothing was sent.')}>Add doc</OutlineButton>
        ) : null}
      </div>
      <p style={{ fontSize: 13, color: 'var(--muted)', margin: '4px 0 8px' }}>
        {staff ? 'Synced from Notion · clients see published docs only' : 'Shared by the Warehaus team'}
      </p>
      {loading ? (
        <div aria-busy="true">
          {[0, 1, 2].map((row) => (
            <div
              key={row}
              className="flex items-center gap-4"
              style={{ borderBottom: '1px solid var(--border)', padding: '24px 0' }}
            >
              <span className="animate-pulse shrink-0" style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--surface-2, var(--surface))' }} />
              <span className="flex min-w-0 flex-1 flex-col gap-2">
                <span className="animate-pulse" style={{ height: 14, width: 240, maxWidth: '70%', borderRadius: 6, background: 'var(--surface-2, var(--surface))' }} />
                <span className="animate-pulse" style={{ height: 12, width: 520, maxWidth: '100%', borderRadius: 6, background: 'var(--surface-2, var(--surface))' }} />
                <span className="animate-pulse" style={{ height: 10, width: 120, borderRadius: 6, background: 'var(--surface-2, var(--surface))' }} />
              </span>
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center gap-2.5 text-center"
          style={{ border: '1px dashed var(--border)', borderRadius: 12, padding: '48px 16px' }}
        >
          <DocIcon />
          <p style={{ fontSize: 16, fontWeight: 500, margin: 0 }}>{empty.title}</p>
          <p style={{ fontSize: 14, color: 'var(--muted)', margin: 0, maxWidth: 440 }}>{empty.body}</p>
        </div>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
          {rows.map((doc) => (
            <li key={doc.id}>
              <DocListRow doc={doc} staff={staff} />
            </li>
          ))}
        </ul>
      )}
      {note ? (
        <p role="status" style={{ fontSize: 13, color: 'var(--muted)', marginTop: 8 }}>{note}</p>
      ) : null}
    </section>
  );
}

function DocListRow({ doc, staff }: { doc: DocRow; staff: boolean }) {
  const [retryNote, setRetryNote] = useState<string | null>(null);
  const updated = formatUpdated(doc.updatedAt ?? doc.lastSyncedAt);
  const failed = doc.syncState === 'failed';
  const synced = formatSynced(doc.lastSyncedAt);
  const summary = doc.summary?.trim() ? doc.summary : null;
  return (
    <a
      href={`#doc-${doc.id}`}
      className="docs-row flex flex-wrap items-center gap-4"
      style={{
        borderBottom: '1px solid var(--border)',
        padding: '24px 0',
        color: 'inherit',
        textDecoration: 'none',
      }}
      aria-label={doc.title}
      title={doc.title}
    >
      <span className="docs-main">
        <DocIcon />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <Clamp title={doc.title}>
            <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--fg)' }}>{doc.title}</span>
          </Clamp>
          {summary ? (
            <Clamp title={summary}>
              <span style={{ fontSize: 14, color: 'var(--muted)' }}>{summary}</span>
            </Clamp>
          ) : null}
          {staff && failed ? (
            <span className="ds-mono" style={{ fontSize: 12, color: 'var(--danger)' }}>
              Notion could not be reached{synced ? ` · last synced ${synced}` : ''}
            </span>
          ) : updated ? (
            <span className="ds-mono" style={{ fontSize: 12, color: 'var(--faint)' }}>{updated}</span>
          ) : null}
          {retryNote ? <span style={{ fontSize: 12, color: 'var(--muted)' }}>{retryNote}</span> : null}
        </span>
      </span>
      <span className="docs-badges">
        <DocTypeTag type={doc.docType} />
        {staff && doc.publishToWarehaus != null ? <PublishedMark published={doc.publishToWarehaus} /> : null}
        {staff ? (
          <SyncChip
            audience="staff"
            notionPageId={doc.notionPageId}
            syncHidden={doc.syncHidden}
            syncState={doc.syncState}
            onRetry={failed ? () => setRetryNote('Nothing was sent.') : undefined}
          />
        ) : null}
      </span>
      <span className="docs-chev">
        <Chevron />
      </span>
    </a>
  );
}

/** Fixture-only stack of the empty, loading, sync, and truncation states. */
export function DocsStatesGallery() {
  const longTitle =
    'Warehaus Portal — Phase two discovery brief covering client onboarding, staff tooling, Notion sync and the B6 to B7 roadmap';
  const longSummary =
    'A long summary that runs past the available width so the row has to cut it off cleanly with an ellipsis instead of wrapping onto extra lines and pushing the badges out of alignment with the rest of the list.';
  const problem: DocRow = {
    id: 'state-problem',
    title: 'Services agreement',
    summary: 'Signed agreement covering fees, timelines and ownership of the work.',
    docType: 'Contract',
    publishToWarehaus: false,
    notionPageId: 'notion-doc-problem',
    syncState: 'failed',
    lastSyncedAt: Date.parse('2026-10-26T16:12:00Z'),
    updatedAt: Date.parse('2026-10-26T16:12:00Z'),
  };
  const long: DocRow = {
    id: 'state-long',
    title: longTitle,
    summary: longSummary,
    docType: 'Brief',
    publishToWarehaus: true,
    notionPageId: 'notion-doc-long',
    syncState: 'synced',
    updatedAt: Date.parse('2026-10-28T12:00:00Z'),
    lastSyncedAt: Date.parse('2026-10-28T12:00:00Z'),
  };
  return (
    <div className="flex flex-col gap-8 overflow-y-auto pb-8" data-testid="docs-states">
      <div>
        <p className="ds-mono" style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>EMPTY · STAFF</p>
        <DocsBlock docs={[]} staff />
      </div>
      <div>
        <p className="ds-mono" style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>EMPTY · CLIENT</p>
        <DocsBlock docs={[]} staff={false} />
      </div>
      <div>
        <p className="ds-mono" style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>LOADING</p>
        <DocsBlock docs={[]} staff loading />
      </div>
      <div>
        <p className="ds-mono" style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>SYNC PROBLEM · STAFF</p>
        <DocsBlock docs={[problem]} staff />
      </div>
      <div>
        <p className="ds-mono" style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>LONG TITLE · STAFF</p>
        <DocsBlock docs={[long]} staff />
      </div>
      <div>
        <p className="ds-mono" style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>LONG TITLE · CLIENT</p>
        <DocsBlock docs={[{ ...long, id: 'state-long-client' }]} staff={false} />
      </div>
    </div>
  );
}
