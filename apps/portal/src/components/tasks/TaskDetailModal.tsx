'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { TASK_STAGES, TASK_UNAVAILABLE, createTaskExternalId, taskDescriptionEditMode } from '@warehaus/portal-sync';
import { OutlineButton, Pill, PortalCheckbox, PrimaryButton } from '@/components/ui/primitives';
import { useSafeQuery } from '@/hooks/useSafeQuery';
import { LIVE_TASK_STATUSES, formatPortalDate, taskStatusColor, type PortalTask } from '@/lib/data/view-models';
import { TaskGlyph } from './TaskGlyph';

type ResourceRow = {
  id: string;
  name: string;
  type: string | null;
  notionPageId?: string | null;
  publishToWarehaus?: boolean;
  projectId?: string | null;
  updatedAt?: number | null;
  lastSyncedAt?: number | null;
};

export function TaskDetailModal({
  task,
  staff,
  phone,
  subtasks,
  resources,
  unavailable,
  onClose,
  onOpenTask,
  projectResources,
  clientName = null,
  hostSlug,
  live = false,
}: {
  task: PortalTask | null;
  staff: boolean;
  phone: boolean;
  subtasks: PortalTask[];
  resources: ResourceRow[];
  unavailable: boolean;
  onClose: () => void;
  onOpenTask: (id: string) => void;
  projectResources: ResourceRow[];
  clientName?: string | null;
  hostSlug?: string;
  /** Convex task id. Fixture rows skip the timeline query. */
  live?: boolean;
}) {
  const [attach, setAttach] = useState(false);
  const [asideNote, setAsideNote] = useState<string | null>(null);
  const moveStage = useMutation(api.tasks.moveStage);
  const moveStatus = useMutation(api.tasks.moveStatus);
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    titleRef.current?.focus();
  }, [task?.id, unavailable]);

  return (
    <ModalShell phone={phone} onClose={onClose} label={task?.name ?? 'Task'}>
      {unavailable || !task ? (
        <div className="flex flex-col items-start gap-3">
          <h2 ref={titleRef} tabIndex={-1} style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--t-lg)' }}>
            {TASK_UNAVAILABLE}
          </h2>
          <p style={{ color: 'var(--muted)', fontSize: 'var(--t-sm)' }}>
            This task is not available.
          </p>
          <OutlineButton onClick={onClose}>Back to board</OutlineButton>
        </div>
      ) : (
        <>
        <div className="mb-4 flex items-center gap-3">
          <p className="min-w-0 flex-1 truncate" style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
            {task.projectName ?? 'Project'}
            <span> / </span>
            <span style={{ color: 'var(--fg)' }}>{task.name}</span>
          </p>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(window.location.href);
            }}
            style={{ background: 'none', border: 0, color: 'var(--muted)', cursor: 'pointer', fontSize: 13 }}
          >
            Copy link
          </button>
          <span className="ds-mono" style={{ fontSize: 11, color: 'var(--faint)' }}>Esc</span>
          <button type="button" aria-label="Close" onClick={onClose} style={{ background: 'none', border: 0, color: 'var(--fg)', cursor: 'pointer' }}>✕</button>
        </div>
        <div className={phone ? 'flex flex-col' : 'grid gap-8'} style={phone ? { gap: 24 } : { gridTemplateColumns: 'minmax(0, 1fr) 296px' }}>
          <div className={phone ? undefined : 'flex min-w-0 flex-col gap-4'} style={phone ? { display: 'contents' } : undefined}>
            <h2 ref={titleRef} tabIndex={-1} style={{ fontFamily: 'var(--font-display)', fontSize: phone ? 20 : 28, lineHeight: phone ? '30px' : undefined, outline: 'none', order: phone ? 2 : undefined }}>
              {task.name}
            </h2>
            <div style={{ order: phone ? 5 : undefined }}>
              <TaskDescription task={task} staff={staff} hostSlug={hostSlug} live={live} />
            </div>
            <div style={{ order: phone ? 8 : undefined }}>
              <TaskTimeline task={task} staff={staff} hostSlug={hostSlug} live={live} />
            </div>
            <section style={{ order: phone ? 6 : undefined }}>
              <h3 className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>SUB-TASKS</h3>
              {subtasks.length === 0 ? (
                <p style={{ color: 'var(--muted)', fontSize: 'var(--t-sm)', marginTop: 8 }}>No sub-tasks yet.</p>
              ) : (
                <ul className="mt-2 flex flex-col">
                  {subtasks.map((child) => (
                    <li key={child.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <button
                        type="button"
                        onClick={() => onOpenTask(child.id)}
                        className="flex w-full items-center gap-3 text-left"
                        style={{ background: 'transparent', border: 0, padding: '16px 0', color: 'inherit', cursor: 'pointer' }}
                      >
                        <span style={{ color: 'var(--muted)' }}>
                          <TaskGlyph src={child.isDone ? '/icons/task-check.svg' : '/icons/task-check-open.svg'} size={20} />
                        </span>
                        <span style={{ flex: '1 1 auto', minWidth: 0, fontWeight: 400, fontSize: 15 }}>{child.name}</span>
                        <span className="inline-flex shrink-0 items-center gap-3">
                          <Pill color={taskStatusColor(child.status, child.isDone)}>{child.status}</Pill>
                          {child.category ? (
                            <span className="ds-mono" style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{child.category}</span>
                          ) : null}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {staff ? (
                <button
                  type="button"
                  className="mt-3 flex w-full items-center gap-2 text-left"
                  style={{ border: '1px dashed var(--border)', borderRadius: 18, padding: '10px 12px', color: 'var(--muted)', background: 'transparent' }}
                >
                  + Add sub-task
                </button>
              ) : null}
            </section>
            <section style={{ order: phone ? 7 : undefined }}>
              <div className="flex items-center justify-between gap-2">
                <h3 className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>RESOURCES</h3>
                {staff ? (
                  <OutlineButton onClick={() => setAttach(true)}>Attach</OutlineButton>
                ) : null}
              </div>
              {resources.length === 0 ? (
                <p style={{ color: 'var(--muted)', fontSize: 'var(--t-sm)', marginTop: 8 }}>No resources yet.</p>
              ) : (
                <ul className="mt-2 flex flex-col gap-2">
                  {resources.map((resource) => (
                    <li key={resource.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: '0.7rem 0.85rem' }}>
                      {resource.name}
                      {resource.type ? <span className="ds-mono" style={{ marginLeft: 8, color: 'var(--muted)', fontSize: 'var(--t-xs)' }}>{resource.type}</span> : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
          <aside className={phone ? undefined : 'flex flex-col gap-4'} style={phone ? { display: 'contents' } : undefined}>
            {staff ? (
              <p style={{ margin: 0, order: phone ? 1 : undefined, background: 'var(--surface-2)', borderRadius: 18, padding: '8px 12px', fontSize: 14, fontWeight: 500 }}>
                Staff only · hidden from clients
              </p>
            ) : null}
            <div className="flex flex-col gap-1" style={{ order: phone ? 3 : undefined }}>
            <Field label="Status" row={phone}>
              {staff ? (
                <StatusMenu
                  value={task.status}
                  onChange={(status) => {
                    if (!live || !task.lastEditedTime) return;
                    void moveStatus({
                      hostSlug,
                      taskId: task.id as Id<'tasks'>,
                      status,
                      expectedLastEditedTime: task.lastEditedTime,
                    }).then((result) => {
                      if (!result.ok) setAsideNote(result.error);
                    });
                  }}
                />
              ) : (
                <Pill color={taskStatusColor(task.status, task.isDone)}>{task.status}</Pill>
              )}
            </Field>
            {task.assigneeName ? <Field label="Assignee" row={phone}>{task.assigneeName}</Field> : staff ? <Field label="Assignee" row={phone}>Unassigned</Field> : null}
            <Field label="Due date" row={phone}>
              <span className="inline-flex items-center gap-2" style={{ color: 'var(--fg)' }}>
                <span style={{ color: 'var(--muted)' }}><TaskGlyph src="/icons/task-calendar.svg" size={16} /></span>
                {formatPortalDate(task.date)}
              </span>
            </Field>
            <Field label="Project" row={phone}>
              <span className="inline-flex flex-wrap items-center gap-2">
                <span style={{ color: 'var(--muted)' }}><TaskGlyph src="/icons/task-layers.svg" size={16} /></span>
                {task.projectName ?? '—'}
                {clientName ? (
                  <span className="ds-mono inline-flex items-center gap-1.5" style={{ border: '1px solid var(--border-2, var(--border))', borderRadius: 999, padding: '2px 8px', fontSize: 12, color: 'var(--fg)' }}>
                    <TaskGlyph src="/icons/task-building.svg" size={12} />
                    {clientName}
                  </span>
                ) : null}
              </span>
            </Field>
            </div>
            {staff ? (
              <div className="flex flex-col gap-3" style={{ order: phone ? 4 : undefined }}>
                <div className="flex items-center gap-2">
                  <h3 className="ds-mono" style={{ fontSize: 12, letterSpacing: '2.64px', color: 'var(--fg)', margin: 0 }}>STAGE</h3>
                  <span className="ds-mono" style={{ fontSize: 12, color: 'var(--muted)' }}>visible to client</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {TASK_STAGES.map((stage) => {
                    const visualLock = stage !== 'Idea' && stage !== 'Planning';
                    const current = task.stage === stage;
                    return (
                      <button
                        key={stage}
                        type="button"
                        disabled={visualLock && !current}
                        aria-pressed={current}
                        onClick={() => {
                          if (visualLock) return;
                          if (!live || !task.lastEditedTime) return;
                          void moveStage({
                            hostSlug,
                            taskId: task.id as Id<'tasks'>,
                            stage,
                            expectedLastEditedTime: task.lastEditedTime,
                          }).then((result) => {
                            if (!result.ok) setAsideNote(result.error);
                          });
                        }}
                        className="ds-mono"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 8,
                          border: current
                            ? '1px solid var(--fg)'
                            : visualLock
                              ? '1px dashed var(--border)'
                              : '1px solid var(--border-2, var(--border))',
                          borderRadius: 999,
                          padding: '8px 12px',
                          background: current ? 'var(--fg)' : 'transparent',
                          color: current ? 'var(--bg)' : visualLock ? 'var(--faint, #636363)' : 'var(--fg)',
                          opacity: visualLock && !current ? 0.72 : 1,
                          cursor: visualLock && !current ? 'not-allowed' : 'pointer',
                          fontSize: 13,
                        }}
                      >
                        {stage}
                        {visualLock && !current ? <TaskGlyph src="/icons/task-lock.svg" size={8} /> : null}
                      </button>
                    );
                  })}
                </div>
                <p style={{ fontSize: 12, lineHeight: '17px', color: 'var(--muted)', margin: 0 }}>
                  Admin can set Idea or Planning here. Later stages are set in Notion by staff and shown read-only.
                </p>
              </div>
            ) : (
              <div style={{ order: phone ? 4 : undefined }}>
                <Field label="Stage" row={phone}>{task.stage ?? '—'}</Field>
              </div>
            )}
            {staff ? (
              <button
                type="button"
                disabled
                aria-disabled="true"
                title="Coming soon"
                style={{ order: phone ? 9 : undefined, background: 'transparent', border: 0, color: 'var(--muted)', textAlign: 'left', cursor: 'not-allowed', padding: 0 }}
              >
                Archive task
              </button>
            ) : null}
            {asideNote && asideNote !== 'Nothing was sent.' ? <p role="status" style={{ order: phone ? 10 : undefined, fontSize: 13, color: 'var(--muted)', margin: 0 }}>{asideNote}</p> : null}
          </aside>
        </div>
        </>
      )}
      {attach && task ? (
        <AttachPicker
          task={task}
          resources={projectResources}
          attachedIds={resources.map((resource) => resource.id)}
          hostSlug={hostSlug}
          onClose={() => setAttach(false)}
        />
      ) : null}
    </ModalShell>
  );
}

type TimelineRow = { id: string; at: string; title: string; detail: string; tone: string };

function TaskDescription({
  task,
  staff,
  hostSlug,
  live,
}: {
  task: PortalTask;
  staff: boolean;
  hostSlug?: string;
  live: boolean;
}) {
  const updateDescription = useMutation(api.tasks.updateDescription);
  const [draft, setDraft] = useState(task.description ?? '');
  const [note, setNote] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    setDraft(task.description ?? '');
    setNote(null);
  }, [task.id, task.description]);

  if (!staff && !task.description) return null;
  const locked = staff && taskDescriptionEditMode(task.descriptionSource) === 'notion';

  const save = async () => {
    if (!live || !task.lastEditedTime) {
      setEditing(false);
      setNote('Nothing was sent.');
      return;
    }
    setPending(true);
    try {
      const result = await updateDescription({
        hostSlug,
        taskId: task.id as Id<'tasks'>,
        description: draft,
        expectedLastEditedTime: task.lastEditedTime,
      });
      setNote(result.ok ? 'Queued for Notion.' : result.error);
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'Could not save the description');
    } finally {
      setPending(false);
    }
  };

  return (
    <section>
      <h3 className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>DESCRIPTION</h3>
      {locked ? (
        <div className="mt-2 flex flex-col gap-2">
          {task.description ? (
            <p style={{ fontSize: 'var(--t-sm)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{task.description}</p>
          ) : null}
          <p style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>Edit in Notion</p>
        </div>
      ) : staff && editing ? (
        <div className="mt-2 flex flex-col gap-2">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={4}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
          <div className="flex items-center justify-between gap-2">
            <PrimaryButton onClick={() => void save()} disabled={pending}>
              {pending ? 'Saving…' : 'Save description'}
            </PrimaryButton>
            {note ? <p style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>{note}</p> : null}
          </div>
        </div>
      ) : staff ? (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="mt-2 w-full text-left"
          style={{ background: 'transparent', border: 0, padding: 0, color: 'inherit', cursor: 'text' }}
        >
          <p style={{ fontSize: 'var(--t-sm)', lineHeight: 1.5, whiteSpace: 'pre-wrap', margin: 0 }}>
            {task.description?.trim() ? task.description : 'Add a description'}
          </p>
          {note ? <p style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>{note}</p> : null}
        </button>
      ) : (
        <p style={{ marginTop: 8, fontSize: 'var(--t-sm)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{task.description}</p>
      )}
    </section>
  );
}

function TaskTimeline({
  task,
  staff,
  hostSlug,
  live,
}: {
  task: PortalTask;
  staff: boolean;
  hostSlug?: string;
  live: boolean;
}) {
  const rows = useSafeQuery<TimelineRow[]>(
    staff ? api.tasks.activityForStaff : api.tasks.activityForClient,
    live ? { hostSlug, taskId: task.id as Id<'tasks'> } : 'skip',
  );
  return (
    <section>
      <h3 className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>ACTIVITY</h3>
      {rows.loading ? (
        <p style={{ color: 'var(--muted)', fontSize: 'var(--t-sm)', marginTop: 8 }}>Loading activity…</p>
      ) : null}
      {!rows.loading && (rows.data?.length ?? 0) === 0 ? (
        <p style={{ color: 'var(--muted)', fontSize: 'var(--t-sm)', marginTop: 8 }}>No activity yet.</p>
      ) : null}
      <ul className="mt-2 flex flex-col">
        {(rows.data ?? []).map((row) => (
          <li key={row.id} style={{ padding: '0.7rem 0', borderBottom: '1px solid var(--border)' }}>
            <p style={{ fontSize: 'var(--t-sm)', fontWeight: 600 }}>{row.title}</p>
            {row.detail ? (
              <p style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)', marginTop: 4 }}>{row.detail}</p>
            ) : null}
            <p className="ds-mono" style={{ fontSize: 11, color: 'var(--faint)', marginTop: 4 }}>
              {formatPortalDate(row.at)}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function StatusMenu({ value, onChange }: { value: string; onChange: (status: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Status"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-2"
        style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', color: 'var(--fg)', padding: '0.45rem 0.7rem' }}
      >
        <Pill color={taskStatusColor(value, value === 'Done')}>{value}</Pill>
        <TaskGlyph src="/icons/task-chev-down.svg" />
      </button>
      {open ? (
        <ul
          role="listbox"
          aria-label="Status"
          className="absolute z-10 mt-1 w-full"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 4, boxShadow: '0 12px 32px rgb(0 0 0 / 35%)' }}
        >
          {LIVE_TASK_STATUSES.map((status) => (
            <li key={status} role="option" aria-selected={status === value}>
              <button
                type="button"
                className="w-full text-left"
                style={{
                  padding: '0.45rem 0.6rem',
                  background: status === value ? 'var(--bg)' : 'transparent',
                  color: 'var(--fg)',
                  border: 0,
                  borderRadius: 8,
                  cursor: 'pointer',
                }}
                onClick={() => {
                  onChange(status);
                  setOpen(false);
                }}
              >
                {status}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Field({ label, children, row = false }: { label: string; children: React.ReactNode; row?: boolean }) {
  if (row) {
    return (
      <div className="flex items-center gap-3" style={{ minHeight: 40 }}>
        <p className="ds-mono" style={{ width: 104, flex: '0 0 auto', fontSize: 12, color: 'var(--muted)', margin: 0 }}>{label}</p>
        <div style={{ fontSize: 14, minWidth: 0 }}>{children}</div>
      </div>
    );
  }
  return (
    <div>
      <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--faint)' }}>{label}</p>
      <div style={{ marginTop: 4, fontSize: 'var(--t-sm)' }}>{children}</div>
    </div>
  );
}

export function TaskCreateDialog({
  projectName,
  projectNotionId,
  orgId,
  hostSlug,
  status,
  onClose,
}: {
  projectName: string;
  projectNotionId: string | null;
  orgId: string | null;
  hostSlug?: string;
  status?: string;
  onClose: () => void;
}) {
  const createTask = useMutation(api.tasks.createTask);
  const [name, setName] = useState('');
  const [due, setDue] = useState('');
  const [stage, setStage] = useState('');
  const [taskStatus, setTaskStatus] = useState(status ?? 'To Do');
  const [note, setNote] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setNote('Title is required. Nothing was sent.');
      return;
    }
    if (!orgId || !projectNotionId) {
      setNote('This project is not in Notion yet. Nothing was sent.');
      return;
    }
    setPending(true);
    try {
      const result = await createTask({
        hostSlug,
        orgId: orgId as Id<'clients'>,
        name: name.trim(),
        status: taskStatus,
        projectNotionId,
        externalId: createTaskExternalId(`${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`),
        date: due || undefined,
        stage: stage || undefined,
      });
      if (!result.ok) {
        setNote(result.error);
        return;
      }
      onClose();
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'Could not create the task');
    } finally {
      setPending(false);
    }
  };

  return (
    <ModalShell phone={false} onClose={onClose} label="New task" width={640}>
      <form className="flex flex-col gap-3" onSubmit={onSubmit}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--t-lg)' }}>New task</h2>
        <p style={{ color: 'var(--muted)', fontSize: 'var(--t-sm)' }}>{projectName}</p>
        <label className="flex flex-col gap-1">
          Title
          <input required value={name} onChange={(event) => setName(event.target.value)} style={inputStyle} />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            Status
            <select value={taskStatus} onChange={(event) => setTaskStatus(event.target.value)} style={inputStyle}>
              {LIVE_TASK_STATUSES.map((value) => <option key={value}>{value}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            Stage
            <select value={stage} onChange={(event) => setStage(event.target.value)} style={inputStyle}>
              <option value="">Leave empty</option>
              {TASK_STAGES.filter((value) => value !== 'Building' && value !== 'Shipped' && value !== 'Ready to Ship').map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            Due
            <input type="date" value={due} onChange={(event) => setDue(event.target.value)} style={inputStyle} />
          </label>
        </div>
        {note ? <p role="status" style={{ color: 'var(--fg)' }}>{note}</p> : null}
        <div className="flex justify-end gap-2">
          <OutlineButton onClick={onClose}>Cancel</OutlineButton>
          <PrimaryButton type="submit" disabled={pending || !name.trim()}>{pending ? 'Creating…' : 'Create task'}</PrimaryButton>
        </div>
      </form>
    </ModalShell>
  );
}

function resourceKind(type: string | null): { label: string; icon: string } {
  const value = (type ?? '').toLowerCase();
  if (/granola|meeting|note/.test(value)) return { label: 'Granola', icon: '/icons/resource-mic.svg' };
  if (/link|url/.test(value)) return { label: 'Link', icon: '/icons/resource-link.svg' };
  return { label: /file|pdf|article/.test(value) || !type ? 'Doc' : type, icon: '/icons/resource-doc.svg' };
}

function resourceMeta(resource: ResourceRow): string {
  const kind = resourceKind(resource.type);
  const stamp = resource.updatedAt ?? resource.lastSyncedAt;
  const when = stamp ? formatPortalDate(new Date(stamp).toISOString()) : null;
  const visibility = resource.publishToWarehaus === false ? 'Internal' : 'Client-visible';
  return [kind.label, when && when !== '—' ? when : null, visibility].filter(Boolean).join(' · ');
}

function AttachPicker({
  task,
  resources,
  attachedIds,
  hostSlug,
  onClose,
}: {
  task: PortalTask;
  resources: ResourceRow[];
  attachedIds: string[];
  hostSlug?: string;
  onClose: () => void;
}) {
  const setResources = useMutation(api.tasks.setResources);
  const [query, setQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(true);
  const [filter, setFilter] = useState<'All' | 'Granola' | 'Docs' | 'Links'>('All');
  const [picked, setPicked] = useState<string[]>(attachedIds);
  const [note, setNote] = useState<string | null>(null);
  const initial = useMemo(() => [...attachedIds].sort().join(','), [attachedIds]);
  const dirty = [...picked].sort().join(',') !== initial;
  const visible = resources.filter((resource) => {
    if (query && !resource.name.toLowerCase().includes(query.toLowerCase())) return false;
    const type = (resource.type ?? '').toLowerCase();
    if (filter === 'Granola') return /granola|meeting|note/.test(type);
    if (filter === 'Docs') return /doc|pdf|article/.test(type);
    if (filter === 'Links') return /link|url/.test(type) || (!resource.type && true);
    return true;
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const onSave = async () => {
    if (!task.notionPageId || !task.lastEditedTime) {
      setNote('This task has no Notion edit time yet. Nothing was sent.');
      return;
    }
    const notionIds = resources
      .filter((resource) => picked.includes(resource.id) && resource.notionPageId)
      .map((resource) => resource.notionPageId as string);
    const result = await setResources({
      hostSlug,
      taskId: task.id as Id<'tasks'>,
      resourceNotionIds: notionIds,
      expectedLastEditedTime: task.lastEditedTime,
    });
    if (!result.ok) {
      setNote(result.error);
      return;
    }
    onClose();
  };

  return (
    <div role="presentation" onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgb(0 0 0 / 55%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div role="dialog" aria-modal="true" aria-label="Attach resources" onClick={(event) => event.stopPropagation()} style={{ width: 'min(100%, 560px)', maxHeight: '80dvh', overflow: 'auto', background: 'var(--surface)', borderRadius: 16, padding: 20 }}>
        <div className="mt-3 flex items-center justify-between">
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--t-md)', margin: 0 }}>Attach resources</h2>
          <button type="button" aria-label="Close" onClick={onClose} style={{ background: 'none', border: 0, color: 'var(--fg)', cursor: 'pointer' }}>✕</button>
        </div>
        <label
          className="mt-3 flex items-center gap-2"
          style={{
            borderRadius: 18,
            border: `2px solid ${searchFocused ? 'var(--accent)' : 'var(--border)'}`,
            background: 'var(--surface-2)',
            padding: '10px 12px',
          }}
        >
          <span style={{ color: 'var(--muted)' }}><TaskGlyph src="/icons/resource-search.svg" size={16} /></span>
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            placeholder="Search this project's resources"
            aria-label="Search this project's resources"
            style={{ flex: 1, border: 0, background: 'transparent', color: 'var(--fg)', outline: 'none', fontSize: 14 }}
          />
        </label>
        <div className="mt-3 flex flex-wrap gap-2">
          {(['All', 'Granola', 'Docs', 'Links'] as const).map((chip) => (
            <button key={chip} type="button" aria-pressed={filter === chip} onClick={() => setFilter(chip)} style={{ borderRadius: 999, border: '1px solid var(--border)', padding: '0.3rem 0.7rem', background: filter === chip ? 'var(--fg)' : 'transparent', color: filter === chip ? 'var(--bg)' : 'var(--muted)' }}>
              {chip}
            </button>
          ))}
        </div>
        {visible.length === 0 ? (
          <p style={{ color: 'var(--muted)', marginTop: 16 }}>{query ? 'No results. Clear search.' : 'This project has no resources yet.'}</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {visible.map((resource) => {
              const checked = picked.includes(resource.id);
              const kind = resourceKind(resource.type);
              return (
                <li key={resource.id}>
                  <label className="flex items-center gap-3" style={{ borderRadius: 18, padding: '10px 12px', background: checked ? 'var(--surface-2)' : 'transparent', cursor: 'pointer' }}>
                    <PortalCheckbox
                      checked={checked}
                      onChange={() => setPicked((current) => checked ? current.filter((id) => id !== resource.id) : [...current, resource.id])}
                    />
                    <span className="inline-flex shrink-0 items-center justify-center" style={{ width: 32, height: 32, borderRadius: 18, background: 'var(--surface-2)', color: 'var(--muted)' }}>
                      <TaskGlyph src={kind.icon} size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block" style={{ fontSize: 14, fontWeight: 500 }}>{resource.name}</span>
                      <span className="ds-mono block" style={{ fontSize: 12, color: 'var(--muted)' }}>{resourceMeta(resource)}</span>
                    </span>
                    {attachedIds.includes(resource.id) ? <span className="ds-mono shrink-0" style={{ color: 'var(--muted)', fontSize: 12 }}>Attached</span> : null}
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        {note ? <p role="status">{note}</p> : null}
        <div className="mt-4 flex items-center justify-between gap-3" style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
          <span className="ds-mono" style={{ color: 'var(--muted)', fontSize: 12 }}>
            {picked.length} selected · {picked.filter((id) => !attachedIds.includes(id)).length} new, {picked.filter((id) => attachedIds.includes(id)).length} already attached
          </span>
          <div className="flex gap-2">
            <OutlineButton onClick={onClose}>Cancel</OutlineButton>
            <PrimaryButton disabled={!dirty} onClick={() => void onSave()}>
              {`Save (attach ${picked.filter((id) => !attachedIds.includes(id)).length})`}
            </PrimaryButton>
          </div>
        </div>
      </div>
    </div>
  );
}

function ModalShell({
  phone,
  onClose,
  label,
  width = 840,
  children,
}: {
  phone: boolean;
  onClose: () => void;
  label: string;
  width?: number;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    node?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !node) return;
      const focusable = [...node.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href]')];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus({ preventScroll: true });
    };
  }, [onClose]);
  const dialog = (
    <div className="ds-scope" role="presentation" onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgb(0 0 0 / 55%)', display: 'flex', alignItems: phone ? 'stretch' : 'center', justifyContent: 'center', padding: phone ? 0 : 24 }}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        style={{
          width: phone ? '100%' : `min(100%, ${width}px)`,
          maxHeight: phone ? '100dvh' : 'min(880px, calc(100dvh - 72px))',
          overflow: 'auto',
          background: 'var(--surface)',
          borderRadius: phone ? 0 : 16,
          padding: phone ? 20 : 24,
        }}
      >
        {children}
      </div>
    </div>
  );
  if (typeof document === 'undefined') return dialog;
  return createPortal(dialog, document.body);
}

const inputStyle = {
  width: '100%',
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: 'var(--bg)',
  color: 'var(--fg)',
  padding: '0.55rem 0.7rem',
  fontSize: 'var(--t-sm)',
} as const;
