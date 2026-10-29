'use client';

import { TaskGlyph } from '@/components/tasks/TaskGlyph';
import { OutlineButton } from '@/components/ui/primitives';
import { projectListEmptyCopy, projectListLoadNotice } from '@/lib/data/projectList';

/** Dashed empty card from Projects / States (Figma 297:18354). */
export function ProjectListEmptyState({
  viewerCount,
  staff,
  onCreate,
}: {
  viewerCount: number;
  staff: boolean;
  onCreate?: () => void;
}) {
  const copy = projectListEmptyCopy(viewerCount, staff);
  if (!copy.detail) {
    return (
      <p className="mt-4" data-testid="projects-empty" style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>
        {copy.title}
      </p>
    );
  }
  return (
    <div
      className="mt-4 flex flex-col items-center text-center"
      data-testid="projects-empty"
      style={{
        gap: 12,
        border: '1px dashed var(--border)',
        borderRadius: 18,
        background: 'var(--bg-2, var(--bg))',
        padding: '48px 24px',
      }}
    >
      <span style={{ color: 'var(--muted)' }}>
        <TaskGlyph src="/icons/task-layers.svg" size={28} />
      </span>
      <p style={{ margin: 0, fontSize: 16, fontWeight: 500, lineHeight: '19px' }}>{copy.title}</p>
      <p style={{ margin: 0, maxWidth: 384, fontSize: 13, lineHeight: '19px', color: 'var(--muted)' }}>{copy.detail}</p>
      {staff && onCreate ? <OutlineButton onClick={onCreate}>New project</OutlineButton> : null}
    </div>
  );
}

/** Three list rows: icon tile, two bars, a short pill. */
export function ProjectListSkeleton() {
  return (
    <div className="mt-4 flex flex-col" aria-busy="true" data-testid="projects-loading" style={{ gap: 24 }}>
      {[0, 1, 2].map((row) => (
        <div key={row} className="flex items-center" style={{ gap: 16, minHeight: 36 }}>
          <span className="animate-pulse shrink-0" style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--surface-2)' }} />
          <span className="flex min-w-0 flex-1 flex-col" style={{ gap: 8 }}>
            <span className="animate-pulse" style={{ height: 12, width: '70%', maxWidth: 302, borderRadius: 6, background: 'var(--surface-2)' }} />
            <span className="animate-pulse" style={{ height: 10, width: 160, maxWidth: '40%', borderRadius: 6, background: 'var(--surface-2)' }} />
          </span>
          <span className="animate-pulse shrink-0" style={{ width: 64, height: 22, borderRadius: 999, background: 'var(--surface-2)' }} />
        </div>
      ))}
    </div>
  );
}

export function ProjectListLoadNotice({ staff, message }: { staff: boolean; message: string }) {
  const copy = projectListLoadNotice(staff, message);
  return (
    <div
      role="alert"
      data-testid="projects-load-error"
      className="mt-4 flex items-start"
      style={{
        gap: 12,
        border: '1px solid var(--danger)',
        borderRadius: 18,
        background: 'var(--surface)',
        padding: '16px 24px',
      }}
    >
      <span
        aria-hidden
        className="inline-flex shrink-0 items-center justify-center"
        style={{
          width: 20,
          height: 20,
          borderRadius: 999,
          border: '1.25px solid var(--danger)',
          color: 'var(--danger)',
          fontSize: 11,
          fontWeight: 600,
          lineHeight: '20px',
        }}
      >
        !
      </span>
      <span className="flex min-w-0 flex-1 flex-col" style={{ gap: 4 }}>
        <span style={{ color: 'var(--danger)', fontSize: 14, fontWeight: 600, lineHeight: '20px' }}>{copy.title}</span>
        <span style={{ color: 'var(--muted)', fontSize: 13, lineHeight: '19px' }}>{copy.body}</span>
        {copy.retry ? (
          <span style={{ marginTop: 8 }}>
            <OutlineButton
              onClick={() => {
                window.location.reload();
              }}
            >
              Retry now
            </OutlineButton>
          </span>
        ) : null}
      </span>
    </div>
  );
}
