'use client';

import { ChevronRight, Lock } from 'lucide-react';
import { PortalRowLink } from '@/components/layout/PortalRowLink';
import { TaskGlyph } from '@/components/tasks/TaskGlyph';

/**
 * Activity row from Figma 296:16492.
 * Icon, title, meta, optional publish mark, time.
 * The publish mark is staff-only and reads the server clientVisible flag.
 */
function rowIcon(lane: string): string {
  if (lane === 'resources') return '/icons/resource-doc.svg';
  if (lane === 'people') return '/icons/activity-person.svg';
  if (lane === 'tasks') return '/icons/task-list.svg';
  return '/icons/activity-row.svg';
}

export function ActivityFeedRow({
  name,
  summary,
  when,
  lane = 'other',
  published,
  href,
  locked = false,
}: {
  name: string;
  summary: string;
  when: string;
  lane?: string;
  /** Undefined hides the mark. A boolean is the staff publish state. */
  published?: boolean;
  /** Set only when this viewer may open the subject. */
  href?: string | null;
  /** Staff-only target. No link, no chevron, lock icon. */
  locked?: boolean;
}) {
  const marked = published != null;
  const link = Boolean(href) && !locked;
  const meta = locked
    ? [summary, summary.includes('not shared with you') ? '' : 'not shared with you'].filter(Boolean).join(' · ')
    : summary;
  const rowClass = 'flex w-full min-w-0 flex-nowrap items-center gap-3';
  const body = (
    <>
      <span
        className="flex shrink-0 items-center justify-center"
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: 'var(--surface-2, var(--bg))',
          border: '1px solid var(--border)',
          color: 'var(--fg)',
        }}
      >
        {locked ? (
          <Lock data-testid="activity-lock" aria-hidden size={18} strokeWidth={1.5} />
        ) : (
          <TaskGlyph src={rowIcon(lane)} size={16} />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className="block break-words"
          style={{ fontSize: 16, fontWeight: 500, lineHeight: 1.35, color: 'var(--fg)' }}
        >
          {name}
        </span>
        {meta ? (
          <span
            className="ds-mono mt-1 block"
            data-testid={locked ? 'activity-locked-meta' : undefined}
            style={{ fontSize: 12, lineHeight: '18px', color: 'var(--muted)', whiteSpace: 'normal', overflow: 'visible' }}
          >
            {meta}
          </span>
        ) : null}
        {marked ? (
          <span className="mt-2 flex lg:hidden" data-testid="publish-column">
            <PublishMark published={published} />
          </span>
        ) : null}
      </span>
      {marked ? (
        <span className="hidden shrink-0 lg:flex" data-testid="publish-column-desktop">
          <PublishMark published={published} />
        </span>
      ) : null}
      <span className="ds-mono shrink-0 text-right" style={{ fontSize: 12, color: 'var(--faint)' }}>
        {when}
      </span>
      {link ? (
        <ChevronRight className="portal-row-chevron shrink-0" aria-hidden data-testid="row-chevron" />
      ) : null}
    </>
  );
  if (link && href) {
    return (
      <PortalRowLink href={href} className={rowClass} testId="activity-link">
        {body}
      </PortalRowLink>
    );
  }
  return (
    <div className={`portal-row portal-static-row ${rowClass}`} data-testid="activity-static" {...(locked ? { 'data-locked': 'true' } : {})}>
      {body}
    </div>
  );
}

function PublishMark({ published }: { published: boolean }) {
  return (
    <span className="inline-flex items-center gap-2" data-testid="publish-state">
      <span
        aria-hidden
        className="inline-block h-2 w-2 shrink-0 rounded-full"
        style={
          published
            ? { background: 'var(--fg)' }
            : { background: 'transparent', boxShadow: 'inset 0 0 0 1.5px var(--muted)' }
        }
      />
      <span
        className="ds-mono whitespace-nowrap"
        style={{
          fontSize: 11,
          letterSpacing: '0.04em',
          color: published ? 'var(--fg)' : 'var(--muted)',
        }}
      >
        {published ? 'Published' : 'Not published'}
      </span>
    </span>
  );
}
