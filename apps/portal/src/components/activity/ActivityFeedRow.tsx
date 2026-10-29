'use client';

import { TaskGlyph } from '@/components/tasks/TaskGlyph';

/**
 * Activity row from Figma 296:16492.
 * Icon, title, meta, optional publish mark, time.
 * The publish mark is staff-only and reads the server clientVisible flag.
 */
export function ActivityFeedRow({
  name,
  summary,
  when,
  published,
}: {
  name: string;
  summary: string;
  when: string;
  /** Undefined hides the mark. A boolean is the staff publish state. */
  published?: boolean;
}) {
  const marked = published != null;
  return (
    <div
      className={
        marked
          ? 'grid grid-cols-[36px_minmax(0,1fr)_80px] items-start gap-x-4 border-b py-6 lg:grid-cols-[36px_minmax(0,1fr)_130px_80px] lg:items-center'
          : 'grid grid-cols-[36px_minmax(0,1fr)_80px] items-center gap-x-4 border-b py-6'
      }
      style={{ borderColor: 'var(--border)' }}
    >
      <span
        className={`flex items-center justify-center ${marked ? 'row-span-2 lg:row-span-1' : ''}`}
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: 'var(--surface-2, var(--bg))',
          border: '1px solid var(--border)',
          color: 'var(--fg)',
        }}
      >
        <TaskGlyph src="/icons/activity-row.svg" size={16} />
      </span>
      <span className="min-w-0">
        <span
          className="block break-words"
          style={{ fontSize: 16, fontWeight: 500, lineHeight: 1.35, color: 'var(--fg)' }}
        >
          {name}
        </span>
        {summary ? (
          <span
            className="ds-mono mt-1 block break-words"
            style={{ fontSize: 12, lineHeight: '18px', color: 'var(--muted)' }}
          >
            {summary}
          </span>
        ) : null}
      </span>
      {marked ? (
        <span className="col-start-2 row-start-2 mt-2 lg:col-start-3 lg:row-start-1 lg:mt-0">
          <PublishMark published={published} />
        </span>
      ) : null}
      <span
        className={`ds-mono text-right ${marked ? 'col-start-3 row-start-1 lg:col-start-4' : ''}`}
        style={{ fontSize: 12, color: 'var(--faint)' }}
      >
        {when}
      </span>
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
