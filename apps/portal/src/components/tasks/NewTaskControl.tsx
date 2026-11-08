'use client';

import { useState, type FormEvent } from 'react';
import { useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { WRITEBACK_OFF_ERROR, createTaskExternalId } from '@warehaus/portal-sync';
import { GhostButton, PrimaryButton, Surface } from '@/components/ui/primitives';
import { LIVE_TASK_STATUSES } from '@/lib/data/view-models';

/**
 * Dashboard New task. Calls createTask only when the deployment write-back flag is on.
 * Otherwise it shows the write-back-off error and does not call Convex.
 */
export function NewTaskControl({
  projectName,
  writebackEnabled = false,
  orgId = null,
  projectNotionId = null,
  hostSlug,
}: {
  projectName: string;
  writebackEnabled?: boolean;
  orgId?: string | null;
  projectNotionId?: string | null;
  hostSlug?: string;
}) {
  const createTask = useMutation(api.tasks.createTask);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [showMore, setShowMore] = useState(false);
  const [due, setDue] = useState('');
  const [owner, setOwner] = useState('');
  const [status, setStatus] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) {
      setNote('Title is required. Nothing was sent.');
      return;
    }
    if (!writebackEnabled) {
      setNote(WRITEBACK_OFF_ERROR);
      return;
    }
    if (!orgId || !projectNotionId) {
      setNote('This project is not in Notion yet. Nothing was sent.');
      return;
    }
    setPending(true);
    setNote(null);
    try {
      const result = await createTask({
        hostSlug,
        orgId: orgId as Id<'clients'>,
        name: title.trim(),
        status: status || 'To Do',
        projectNotionId,
        externalId: createTaskExternalId(`${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`),
        ...(due ? { date: due } : {}),
      });
      if (!result.ok) {
        setNote(result.error);
        return;
      }
      setTitle('');
      setDue('');
      setOwner('');
      setStatus('');
      setOpen(false);
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'Could not create the task');
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <PrimaryButton
        onClick={() => {
          setNote(null);
          setOpen(true);
        }}
      >
        New task
      </PrimaryButton>
      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="New task"
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 80,
            background: 'color-mix(in oklab, var(--bg) 55%, transparent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div onClick={(event) => event.stopPropagation()} style={{ width: 'min(100%, 440px)' }}>
            <Surface style={{ padding: 'var(--s-5)' }}>
              <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>
                New task
              </p>
              <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', marginTop: 8 }}>
                {projectName} is already selected.
              </p>
              <form className="mt-4 flex flex-col gap-3" onSubmit={onSubmit}>
                <label className="flex flex-col gap-1">
                  <span style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>Title</span>
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    required
                    style={inputStyle}
                  />
                </label>
                <p style={{ fontSize: 'var(--t-sm)' }}>
                  Project <strong>{projectName}</strong>
                </p>
                <button
                  type="button"
                  onClick={() => setShowMore((value) => !value)}
                  className="ds-mono self-start"
                  style={{
                    fontSize: 'var(--t-xs)',
                    color: 'var(--accent)',
                    background: 'none',
                    border: 0,
                    cursor: 'pointer',
                  }}
                >
                  {showMore ? 'Hide options' : 'Due, owner, status'}
                </button>
                {showMore ? (
                  <div className="flex flex-col gap-3">
                    <label className="flex flex-col gap-1">
                      <span style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>Due date</span>
                      <input
                        type="date"
                        value={due}
                        onChange={(event) => setDue(event.target.value)}
                        style={inputStyle}
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>Owner</span>
                      <input
                        value={owner}
                        onChange={(event) => setOwner(event.target.value)}
                        style={inputStyle}
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>Status</span>
                      <select
                        value={status}
                        onChange={(event) => setStatus(event.target.value)}
                        style={inputStyle}
                      >
                        <option value="">Leave empty</option>
                        {LIVE_TASK_STATUSES.map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                ) : null}
                {note ? (
                  <p style={{ fontSize: 'var(--t-sm)', color: 'var(--danger)' }} role="status">
                    {note}
                  </p>
                ) : null}
                <div className="mt-2 flex justify-end gap-2">
                  <GhostButton onClick={() => setOpen(false)}>Close</GhostButton>
                  <PrimaryButton type="submit" disabled={pending}>
                    {pending ? 'Saving…' : 'Save task'}
                  </PrimaryButton>
                </div>
              </form>
            </Surface>
          </div>
        </div>
      ) : null}
    </>
  );
}

const inputStyle = {
  width: '100%',
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: 'var(--bg)',
  color: 'var(--fg)',
  padding: '0.55rem 0.7rem',
  fontSize: 'var(--t-sm)',
  fontFamily: 'var(--font-body)',
} as const;
