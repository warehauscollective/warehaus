'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { TASK_ESTIMATES, TASK_PRIORITIES, TASK_SOURCES } from '@warehaus/portal-sync';
import { PublishChip } from '@/components/sync/SyncChip';

/** Blank live fields stay visible so staff can see the property is empty. */
export function liveFieldText(value: string | null | undefined): string {
  const text = value?.trim() ?? '';
  return text.length > 0 ? text : '—';
}

export type StaffLiveFieldPatch = {
  estimate?: string | null;
  priority?: string | null;
  source?: string | null;
  publishToWarehaus?: boolean;
};

type SaveResult = { ok: boolean; error?: string };

const selectStyle = {
  width: '100%',
  maxWidth: 220,
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: 'var(--bg)',
  color: 'var(--fg)',
  padding: '0.35rem 0.5rem',
  fontSize: 14,
} as const;

function choiceOptions(known: readonly string[], current: string | null | undefined) {
  const text = current?.trim() ?? '';
  const options = known.map((value) => ({ value, disabled: false }));
  if (text && !known.includes(text)) return [{ value: text, disabled: true }, ...options];
  return options;
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
 * Estimate, Priority, Source, and publish on staff task detail.
 * Each change enqueues a Notion write. Is Done stays a read-only mark.
 * Clients never receive this block.
 */
export function StaffLiveFields({
  estimate,
  priority,
  source,
  published,
  done,
  row = false,
  onSave,
}: {
  estimate?: string | null;
  priority?: string | null;
  source?: string | null;
  /** Omitted when the row has no publish flag. */
  published?: boolean;
  /** Notion Is Done formula. Shown only when it is true. */
  done?: boolean;
  row?: boolean;
  onSave?: (patch: StaffLiveFieldPatch) => Promise<SaveResult>;
}) {
  const [estimateValue, setEstimateValue] = useState(estimate?.trim() ?? '');
  const [priorityValue, setPriorityValue] = useState(priority?.trim() ?? '');
  const [sourceValue, setSourceValue] = useState(source?.trim() ?? '');
  const [publishValue, setPublishValue] = useState(published === true);
  const [pending, setPending] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    setEstimateValue(estimate?.trim() ?? '');
  }, [estimate]);
  useEffect(() => {
    setPriorityValue(priority?.trim() ?? '');
  }, [priority]);
  useEffect(() => {
    setSourceValue(source?.trim() ?? '');
  }, [source]);
  useEffect(() => {
    setPublishValue(published === true);
  }, [published]);

  const commitSelect = async (
    known: readonly string[],
    next: string,
    previous: string,
    setValue: (value: string) => void,
    field: 'estimate' | 'priority' | 'source',
  ) => {
    setValue(next);
    if (!onSave || next === previous) return;
    const value = next.trim() ? next.trim() : null;
    if (value !== null && !known.includes(value)) {
      setValue(previous);
      return;
    }
    setPending(true);
    try {
      const result = await onSave({ [field]: value });
      if (!result.ok) {
        setValue(previous);
        setNote(result.error ?? 'Could not save');
        return;
      }
      setNote('Queued for Notion.');
    } finally {
      setPending(false);
    }
  };

  const commitPublish = async (next: boolean) => {
    const previous = publishValue;
    setPublishValue(next);
    if (!onSave || next === previous) return;
    setPending(true);
    try {
      const result = await onSave({ publishToWarehaus: next });
      if (!result.ok) {
        setPublishValue(previous);
        setNote(result.error ?? 'Could not save');
        return;
      }
      setNote('Queued for Notion.');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex flex-col gap-1" data-testid="staff-live-fields">
      <Field label="Estimate" row={row} testId="task-estimate">
        <select
          aria-label="Estimate"
          data-testid="task-estimate-input"
          value={estimateValue}
          disabled={pending}
          style={selectStyle}
          onChange={(event) => {
            void commitSelect(TASK_ESTIMATES, event.target.value, estimateValue, setEstimateValue, 'estimate');
          }}
        >
          <option value="">—</option>
          {choiceOptions(TASK_ESTIMATES, estimate).map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.value}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Priority" row={row} testId="task-priority">
        <select
          aria-label="Priority"
          data-testid="task-priority-input"
          value={priorityValue}
          disabled={pending}
          style={selectStyle}
          onChange={(event) => {
            void commitSelect(TASK_PRIORITIES, event.target.value, priorityValue, setPriorityValue, 'priority');
          }}
        >
          <option value="">—</option>
          {choiceOptions(TASK_PRIORITIES, priority).map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.value}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Source" row={row} testId="task-source">
        <select
          aria-label="Source"
          data-testid="task-source-input"
          value={sourceValue}
          disabled={pending}
          style={selectStyle}
          onChange={(event) => {
            void commitSelect(TASK_SOURCES, event.target.value, sourceValue, setSourceValue, 'source');
          }}
        >
          <option value="">—</option>
          {choiceOptions(TASK_SOURCES, source).map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.value}
            </option>
          ))}
        </select>
      </Field>
      {published == null ? null : (
        <Field label="Publish" row={row} testId="task-publish">
          <label className="inline-flex items-center gap-2" style={{ cursor: pending ? 'default' : 'pointer' }}>
            <input
              type="checkbox"
              checked={publishValue}
              disabled={pending}
              aria-label="Publish"
              data-testid="task-publish-input"
              onChange={(event) => {
                void commitPublish(event.target.checked);
              }}
            />
            <PublishChip published={publishValue} />
          </label>
        </Field>
      )}
      {done ? (
        <Field label="Done" row={row} testId="task-done-mark">
          Done
        </Field>
      ) : null}
      {note ? (
        <p role="status" data-testid="task-fields-note" style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>
          {note}
        </p>
      ) : null}
    </div>
  );
}
