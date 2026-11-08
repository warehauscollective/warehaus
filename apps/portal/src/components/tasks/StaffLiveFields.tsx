import type { ReactNode } from 'react';
import { PublishChip } from '@/components/sync/SyncChip';

/** Blank live fields stay visible so staff can see the property is empty. */
export function liveFieldText(value: string | null | undefined): string {
  const text = value?.trim() ?? '';
  return text.length > 0 ? text : '—';
}

function Field({
  label,
  row,
  testId,
  children,
}: {
  label: string;
  row: boolean;
  testId: string;
  children: ReactNode;
}) {
  if (row) {
    return (
      <div className="flex items-center gap-3" data-testid={testId} style={{ minHeight: 40 }}>
        <p className="ds-mono" style={{ width: 104, flex: '0 0 auto', fontSize: 12, color: 'var(--muted)', margin: 0 }}>
          {label}
        </p>
        <div style={{ fontSize: 14, minWidth: 0, overflowWrap: 'anywhere' }}>{children}</div>
      </div>
    );
  }
  return (
    <div data-testid={testId}>
      <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--faint)' }}>{label}</p>
      <div style={{ marginTop: 4, fontSize: 'var(--t-sm)', overflowWrap: 'anywhere' }}>{children}</div>
    </div>
  );
}

/**
 * Step 3 live fields on task detail. Staff only. Read-only: these do not enqueue a write.
 * Estimate, Priority, and Source are SERVER. Clients never receive them.
 */
export function StaffLiveFields({
  estimate,
  priority,
  source,
  published,
  done,
  row = false,
}: {
  estimate?: string | null;
  priority?: string | null;
  source?: string | null;
  /** Omitted when the row has no publish flag. */
  published?: boolean;
  /** Notion Is Done formula. Shown only when it is true. */
  done?: boolean;
  row?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1" data-testid="staff-live-fields">
      <Field label="Estimate" row={row} testId="task-estimate">{liveFieldText(estimate)}</Field>
      <Field label="Priority" row={row} testId="task-priority">{liveFieldText(priority)}</Field>
      <Field label="Source" row={row} testId="task-source">{liveFieldText(source)}</Field>
      {published == null ? null : (
        <Field label="Publish" row={row} testId="task-publish">
          <PublishChip published={published} />
        </Field>
      )}
      {done ? (
        <Field label="Done" row={row} testId="task-done-mark">
          Done
        </Field>
      ) : null}
    </div>
  );
}
