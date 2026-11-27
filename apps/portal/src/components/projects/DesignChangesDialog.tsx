'use client';

import { useState, type CSSProperties, type FormEvent } from 'react';
import { DESIGN_CHANGE_TASK_LIMIT, DESIGN_CHANGES_NEED_NOTES } from '@convex/_lib/designApproval';
import { userFacingErrorMessage } from '@convex/_lib/userFacingError';
import { PortalModal } from '@/components/ui/PortalModal';
import { OutlineButton } from '@/components/ui/primitives';

export const DESIGN_CHANGES_TITLE = 'Request design changes';
export const DESIGN_CHANGES_OUTCOME =
  'Adds design tasks. The runner updates the designs in Figma and asks you again. Build tasks stay locked.';

export type DesignChangesInput = { notes: string; taskIds: string[]; newTasks: string[] };

/** One task per non-empty line, capped like the server. */
export function designChangeLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, DESIGN_CHANGE_TASK_LIMIT);
}

/**
 * Peter's Request design changes (Figma 1311:38026). Notes, the design tasks
 * the changes revise, and optional new task lines. Sending adds design tasks,
 * closes the Approve designs Ask and keeps build locked.
 */
export function DesignChangesDialog({
  designTasks,
  onSend,
  onClose,
  narrow = false,
  cover = false,
}: {
  designTasks: readonly { id: string; name: string }[];
  onSend: (input: DesignChangesInput) => Promise<unknown>;
  onClose: () => void;
  narrow?: boolean;
  cover?: boolean;
}) {
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState('');
  const [picked, setPicked] = useState<string[]>(() => designTasks.map((task) => task.id));
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pad = narrow ? '8px 16px' : '8px 24px';

  const send = (event?: FormEvent) => {
    event?.preventDefault();
    if (sending) return;
    if (!notes.trim()) {
      setError(DESIGN_CHANGES_NEED_NOTES);
      return;
    }
    setSending(true);
    setError(null);
    void onSend({ notes: notes.trim(), taskIds: picked, newTasks: designChangeLines(lines) })
      .then(onClose)
      .catch((err) => setError(userFacingErrorMessage(err, 'Couldn’t send the design changes. Nothing changed. Try again.')))
      .finally(() => setSending(false));
  };

  return (
    <PortalModal
      testId="milestone-design-changes"
      label={DESIGN_CHANGES_TITLE}
      onClose={() => {
        if (!sending) onClose();
      }}
      narrow={narrow}
      sheet="bottom"
      header="compact"
      blueFocus
      showIcon={sending}
      icon="spinner"
      showFooter={false}
      cover={cover}
      locked={sending}
    >
      <form onSubmit={send}>
        <div className="flex flex-col gap-4" style={{ padding: pad }}>
          <label className="flex flex-col gap-2">
            <span className="ds-mono" style={labelStyle}>WHAT NEEDS TO CHANGE</span>
            <textarea
              data-testid="design-changes-notes"
              rows={4}
              value={notes}
              disabled={sending}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="More room on the card at 390. Status pill reads too small."
              style={fieldStyle}
            />
          </label>
          {designTasks.length > 0 ? (
            <fieldset className="flex flex-col gap-2" style={{ border: 0, margin: 0, padding: 0 }}>
              <legend className="ds-mono" style={{ ...labelStyle, marginBottom: 8 }}>APPLIES TO</legend>
              {designTasks.map((task) => (
                <label key={task.id} className="flex items-center gap-2" style={{ fontSize: 14, lineHeight: '21px' }}>
                  <input
                    type="checkbox"
                    data-testid="design-changes-task"
                    checked={picked.includes(task.id)}
                    disabled={sending}
                    onChange={(event) =>
                      setPicked((current) =>
                        event.target.checked ? [...current, task.id] : current.filter((id) => id !== task.id),
                      )
                    }
                  />
                  <span className="min-w-0" style={{ overflowWrap: 'anywhere' }}>{task.name}</span>
                </label>
              ))}
            </fieldset>
          ) : null}
          <label className="flex flex-col gap-2">
            <span className="ds-mono" style={labelStyle}>NEW DESIGN TASKS (ONE PER LINE, OPTIONAL)</span>
            <textarea
              data-testid="design-changes-lines"
              rows={3}
              value={lines}
              disabled={sending}
              onChange={(event) => setLines(event.target.value)}
              placeholder="Rework the tile at 390"
              style={fieldStyle}
            />
          </label>
          <p data-testid="design-changes-outcome" style={{ margin: 0, fontSize: 14, lineHeight: '21px', color: 'var(--muted)' }}>
            {DESIGN_CHANGES_OUTCOME}
          </p>
          {error ? <p role="alert" style={{ margin: 0, color: 'var(--danger-text)', fontSize: 14 }}>{error}</p> : null}
        </div>
        <div style={{ display: 'flex', flexWrap: 'nowrap', justifyContent: 'flex-end', gap: 8, padding: narrow ? '16px 16px 24px' : '16px 24px 20px' }}>
          {sending ? null : <OutlineButton nowrap onClick={onClose}>Cancel</OutlineButton>}
          <button
            type="submit"
            data-testid="design-changes-send"
            disabled={sending}
            className="inline-flex shrink-0 items-center justify-center gap-2"
            style={{ background: '#f59e0b', color: '#0a0a0b', border: 0, borderRadius: 9, padding: '8px 14px', fontSize: 14, whiteSpace: 'nowrap', opacity: sending ? 0.4 : 1 }}
          >
            {sending ? 'Sending…' : 'Send design changes'}
          </button>
        </div>
      </form>
    </PortalModal>
  );
}

const labelStyle: CSSProperties = { fontSize: 11, letterSpacing: '0.08em', color: 'var(--muted)' };

const fieldStyle: CSSProperties = {
  width: '100%',
  border: '1px solid var(--border)',
  borderRadius: 10,
  background: 'var(--surface-2)',
  color: 'var(--fg)',
  padding: '10px 12px',
  font: 'inherit',
  fontSize: 14,
  lineHeight: '21px',
  resize: 'vertical',
};
