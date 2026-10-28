'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { TASK_STAGES, TASK_UNAVAILABLE, createTaskExternalId, taskDescriptionEditMode } from '@warehaus/portal-sync';
import { Pill } from '@/components/ui/primitives';
import { useSafeQuery } from '@/hooks/useSafeQuery';
import { LIVE_TASK_STATUSES, formatPortalDate, taskStatusColor, type PortalTask } from '@/lib/data/view-models';

type ResourceRow = {
  id: string;
  name: string;
  type: string | null;
  notionPageId?: string | null;
  publishToWarehaus?: boolean;
  projectId?: string | null;
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
  hostSlug?: string;
  /** Convex task id. Fixture rows skip the timeline query. */
  live?: boolean;
}) {
  const [attach, setAttach] = useState(false);
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
          <button type="button" onClick={onClose}>Back to board</button>
        </div>
      ) : (
        <div className={phone ? 'flex flex-col gap-4' : 'grid gap-8'} style={phone ? undefined : { gridTemplateColumns: 'minmax(0, 1fr) 296px' }}>
          <div className="flex min-w-0 flex-col gap-4">
            <h2 ref={titleRef} tabIndex={-1} style={{ fontFamily: 'var(--font-display)', fontSize: 28, outline: 'none' }}>
              {task.name}
            </h2>
            <TaskDescription task={task} staff={staff} hostSlug={hostSlug} />
            <TaskTimeline task={task} staff={staff} hostSlug={hostSlug} live={live} />
            <section>
              <h3 className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>SUB-TASKS</h3>
              {subtasks.length === 0 ? (
                <p style={{ color: 'var(--muted)', fontSize: 'var(--t-sm)', marginTop: 8 }}>{staff ? 'No sub-tasks yet.' : 'No sub-tasks yet.'}</p>
              ) : (
                <ul className="mt-2 flex flex-col gap-2">
                  {subtasks.map((child) => (
                    <li key={child.id}>
                      <button type="button" onClick={() => onOpenTask(child.id)} className="w-full text-left" style={{ border: '1px solid var(--border)', borderRadius: 12, padding: '0.7rem 0.85rem', background: 'var(--bg)' }}>
                        <span style={{ fontWeight: 600 }}>{child.name}</span>
                        <span className="ds-mono" style={{ marginLeft: 8, color: 'var(--muted)', fontSize: 'var(--t-xs)' }}>{child.stage ?? 'No stage'} · {child.status}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section>
              <div className="flex items-center justify-between gap-2">
                <h3 className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>RESOURCES</h3>
                {staff ? (
                  <button type="button" onClick={() => setAttach(true)} style={{ color: 'var(--accent)' }}>Attach</button>
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
          <aside className="flex flex-col gap-3" style={{ background: 'var(--bg)', borderRadius: 12, padding: 16 }}>
            <Field label="Status"><Pill color={taskStatusColor(task.status, task.isDone)}>{task.status}</Pill></Field>
            <Field label="Stage">{task.stage ?? '—'}</Field>
            {staff ? <Field label="Due">{formatPortalDate(task.date)}</Field> : null}
            {staff ? <Field label="Project">{task.projectName ?? '—'}</Field> : null}
          </aside>
        </div>
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
}: {
  task: PortalTask;
  staff: boolean;
  hostSlug?: string;
}) {
  const updateDescription = useMutation(api.tasks.updateDescription);
  const [draft, setDraft] = useState(task.description ?? '');
  const [note, setNote] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    setDraft(task.description ?? '');
    setNote(null);
  }, [task.id, task.description]);

  if (!staff && !task.description) return null;
  const locked = staff && taskDescriptionEditMode(task.descriptionSource) === 'notion';

  const save = async () => {
    if (!task.lastEditedTime) {
      setNote('This task has not been read from Notion yet. Nothing was sent.');
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
      ) : staff ? (
        <div className="mt-2 flex flex-col gap-2">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={4}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
          <div className="flex items-center justify-between gap-2">
            <button type="button" onClick={() => void save()} disabled={pending}>
              {pending ? 'Saving…' : 'Save description'}
            </button>
            {note ? <p style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>{note}</p> : null}
          </div>
        </div>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
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
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" disabled={pending || !name.trim()}>{pending ? 'Creating…' : 'Create task'}</button>
        </div>
      </form>
    </ModalShell>
  );
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
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--t-md)' }}>Attach resources</h2>
        <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" aria-label="Search resources" style={{ ...inputStyle, marginTop: 12 }} />
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
              return (
                <li key={resource.id}>
                  <label className="flex items-center gap-2" style={{ minHeight: 44 }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => setPicked((current) => checked ? current.filter((id) => id !== resource.id) : [...current, resource.id])}
                    />
                    <span>{resource.name}</span>
                    {attachedIds.includes(resource.id) ? <span className="ds-mono" style={{ color: 'var(--muted)', fontSize: 'var(--t-xs)' }}>Attached</span> : null}
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        {note ? <p role="status">{note}</p> : null}
        <div className="mt-4 flex items-center justify-between">
          <span className="ds-mono" style={{ color: 'var(--muted)', fontSize: 'var(--t-xs)' }}>{dirty ? 'Unsaved changes' : 'No changes'}</span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose}>Cancel</button>
            <button type="button" disabled={!dirty} onClick={() => void onSave()}>Save</button>
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
    node?.focus();
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
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div role="presentation" onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgb(0 0 0 / 55%)', display: 'flex', alignItems: phone ? 'stretch' : 'center', justifyContent: 'center', padding: phone ? 0 : 24 }}>
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
          padding: phone ? 16 : 24,
        }}
      >
        <div className="mb-3 flex justify-end">
          <button type="button" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
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
} as const;
