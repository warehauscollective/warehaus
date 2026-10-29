import { TaskGlyph } from './TaskGlyph';
import { formatPortalDate } from '@/lib/data/view-models';

export type AttachedResource = {
  id: string;
  name: string;
  type: string | null;
  publishToWarehaus?: boolean;
  updatedAt?: number | string | null;
  lastSyncedAt?: number | null;
  attachedCount?: number | null;
};

export function resourceKind(type: string | null): { label: string; icon: string } {
  const value = (type ?? '').toLowerCase();
  if (/granola|meeting|note/.test(value)) return { label: 'Granola', icon: '/icons/resource-mic.svg' };
  if (/link|url/.test(value)) return { label: 'Link', icon: '/icons/resource-link.svg' };
  return { label: /file|pdf|article/.test(value) || !type ? 'Doc' : type, icon: '/icons/resource-doc.svg' };
}

function isRecap(type: string | null): boolean {
  return /granola|meeting|note|recap/i.test(type ?? '');
}

function metaLine(resource: AttachedResource): string {
  const kind = resourceKind(resource.type);
  const stamp = resource.updatedAt ?? resource.lastSyncedAt;
  const when = stamp == null
    ? null
    : formatPortalDate(typeof stamp === 'number' ? new Date(stamp).toISOString() : stamp);
  const count = resource.attachedCount ?? 0;
  const attached = `attached to ${count} ${count === 1 ? 'item' : 'items'}`;
  return [kind.label, when && when !== '—' ? when : null, attached].filter(Boolean).join(' · ');
}

function PublishMark({ published }: { published: boolean }) {
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

/**
 * Row/Resource 282:7871. Type icon, meta `type · date · attached to N`, chevron.
 * Recap and publish marks are staff-only.
 */
export function AttachedResourceRow({
  resource,
  staff,
  phone,
}: {
  resource: AttachedResource;
  staff: boolean;
  phone: boolean;
}) {
  const kind = resourceKind(resource.type);
  const draft = staff && resource.publishToWarehaus === false && isRecap(resource.type);
  const marks = staff && resource.publishToWarehaus != null ? (
    <span className="inline-flex flex-wrap items-center gap-2">
      {draft ? (
        <span
          className="ds-mono whitespace-nowrap"
          style={{
            border: '1px dashed var(--border)',
            borderRadius: 999,
            padding: '4px 8px',
            fontSize: 11,
            color: 'var(--muted)',
          }}
        >
          Draft recap
        </span>
      ) : null}
      <PublishMark published={resource.publishToWarehaus} />
    </span>
  ) : null;

  return (
    <div
      data-testid="attached-resource-row"
      data-resource-id={resource.id}
      style={{ padding: '12px 0' }}
    >
      <div className="flex items-center gap-3">
        <span
          className="inline-flex shrink-0 items-center justify-center"
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            color: 'var(--muted)',
          }}
        >
          <TaskGlyph src={kind.icon} size={16} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block" style={{ fontSize: 16, fontWeight: 500, lineHeight: '22px' }}>{resource.name}</span>
          <span className="ds-mono block" style={{ fontSize: 12, lineHeight: '16px', color: 'var(--muted)' }}>{metaLine(resource)}</span>
        </span>
        {!phone ? marks : null}
        <span style={{ color: 'var(--muted)' }}>
          <TaskGlyph src="/icons/docs-chev.svg" size={16} />
        </span>
      </div>
      {phone && marks ? (
        <div className="flex flex-wrap items-center gap-2" style={{ marginTop: 8, paddingLeft: 48 }}>
          {marks}
        </div>
      ) : null}
    </div>
  );
}
