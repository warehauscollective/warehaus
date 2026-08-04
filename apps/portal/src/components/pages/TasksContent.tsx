'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { Pill, PrimaryButton } from '@/components/ui/primitives';
import {
  PortalTilePane,
  PortalWorkspace,
} from '@/components/layout/PortalWorkspace';
import { usePortalView } from '@/components/providers/PortalViewProvider';
import { tenantEyebrow, usePortalData } from '@/hooks/usePortalData';
import { getHostSlugFromLocation } from '@/lib/auth/host-slug';
import {
  TASK_BOARD_COLUMNS,
  formatPortalDate,
  taskBoardColumnKey,
  taskStatusColor,
  type PortalTask,
  type TaskResponseType,
} from '@/lib/data/view-models';
import { Bevel } from '@warehaus/ui';
import { PORTAL_PANEL_GAP_VAR, PORTAL_SURFACE_RADIUS } from '@/lib/design/portal-chrome';

const SECTION_TITLE: Record<string, string> = {
  overview: 'Board',
  list: 'List',
};

/** Client portal Tasks — read-only board/list + TaskResponse composer (never edits task fields). */
export function TasksContent() {
  const { sectionFor, setSectionFor, openDetail } = usePortalView();
  const { data, loading } = usePortalData();
  const activeSection = sectionFor('projects');
  const view = activeSection === 'list' ? 'list' : 'overview';
  const title = SECTION_TITLE[view] ?? 'Board';
  const tasks = data.tasks;

  const openTask = (task: PortalTask) => {
    openDetail({
      id: task.id,
      title: task.name,
      subtitle: `${task.status} · ${task.projectName ?? 'Project'}`,
      body: <TaskResponseSheet task={task} />,
    });
  };

  return (
    <PortalWorkspace
      eyebrow={tenantEyebrow(data.tenant, 'Tasks')}
      title={title}
      actions={
        <ViewToggle view={view} onChange={(key) => setSectionFor('projects', key)} />
      }
    >
      {view === 'overview' && (
        <PortalTilePane>
          <KanbanBoard tasks={tasks} loading={loading} onOpen={openTask} />
        </PortalTilePane>
      )}

      {view === 'list' && (
        <PortalTilePane>
          <TaskListView tasks={tasks} loading={loading} onOpen={openTask} />
        </PortalTilePane>
      )}
    </PortalWorkspace>
  );
}

function ViewToggle({
  view,
  onChange,
}: {
  view: 'overview' | 'list';
  onChange: (key: string) => void;
}) {
  const options = [
    { key: 'overview', label: 'Board' },
    { key: 'list', label: 'List' },
  ] as const;

  return (
    <div
      role="tablist"
      aria-label="Task views"
      className="inline-flex items-center"
      style={{
        padding: 3,
        borderRadius: 12,
        border: '1px solid var(--border)',
        background: 'color-mix(in oklab, var(--bg) 55%, transparent)',
      }}
    >
      {options.map((opt) => {
        const active = view === opt.key;
        return (
          <button
            key={opt.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.key)}
            className="ds-mono"
            style={{
              fontSize: 'var(--t-xs)',
              fontWeight: active ? 600 : 500,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              padding: '0.45rem 0.85rem',
              borderRadius: 9,
              border: 0,
              cursor: 'pointer',
              color: active ? 'var(--fg)' : 'var(--muted)',
              background: active
                ? 'color-mix(in oklab, var(--fg) 10%, transparent)'
                : 'transparent',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function KanbanBoard({
  tasks,
  loading,
  onOpen,
}: {
  tasks: PortalTask[];
  loading: boolean;
  onOpen: (task: PortalTask) => void;
}) {
  return (
    <div
      className="flex h-full min-h-0 gap-3 overflow-x-auto pb-1"
      style={{ gap: PORTAL_PANEL_GAP_VAR }}
    >
      {TASK_BOARD_COLUMNS.map((col) => {
        const items = tasks.filter((t) => taskBoardColumnKey(t) === col.key);
        return (
          <Bevel
            key={col.key}
            corners="br"
            radius={PORTAL_SURFACE_RADIUS}
            cut={1.5}
            shoulder={0.55}
            fill="var(--surface)"
            stroke="var(--border)"
            className="flex min-h-0 w-[min(280px,78vw)] shrink-0 flex-col"
            style={{ padding: 0 }}
          >
            <div
              className="flex shrink-0 items-center justify-between gap-2"
              style={{
                padding: '0.85rem 1rem',
                borderBottom: '1px solid var(--border)',
              }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{
                    background: taskStatusColor(
                      col.key === 'done' ? 'Done' : col.label,
                      col.key === 'done',
                    ),
                  }}
                />
                <p style={{ fontSize: 'var(--t-sm)', fontWeight: 600 }}>{col.label}</p>
              </div>
              <span
                className="ds-mono"
                style={{ fontSize: 'var(--t-xs)', color: 'var(--faint)' }}
              >
                {loading ? '…' : items.length}
              </span>
            </div>
            <div
              className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto"
              style={{ padding: '0.75rem' }}
            >
              {items.map((task) => (
                <KanbanCard key={task.id} task={task} onOpen={() => onOpen(task)} />
              ))}
              {!loading && items.length === 0 && (
                <p
                  style={{
                    fontSize: 'var(--t-xs)',
                    color: 'var(--faint)',
                    padding: '0.5rem 0.25rem',
                  }}
                >
                  No tasks
                </p>
              )}
            </div>
          </Bevel>
        );
      })}
    </div>
  );
}

function KanbanCard({ task, onOpen }: { task: PortalTask; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-left transition-colors"
      style={{
        padding: '0.75rem 0.85rem',
        borderRadius: 14,
        border: '1px solid var(--border)',
        background: 'color-mix(in oklab, var(--bg) 55%, transparent)',
        cursor: 'pointer',
      }}
    >
      <p style={{ fontSize: 'var(--t-sm)', fontWeight: 600, lineHeight: 1.35 }}>
        {task.name}
      </p>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <PropChip tone="muted">{formatPortalDate(task.date)}</PropChip>
      </div>
      <p
        className="ds-mono mt-2 truncate"
        style={{ fontSize: 'var(--t-xs)', color: 'var(--faint)' }}
      >
        {task.projectName ?? '—'}
      </p>
    </button>
  );
}

function TaskListView({
  tasks,
  loading,
  onOpen,
}: {
  tasks: PortalTask[];
  loading: boolean;
  onOpen: (task: PortalTask) => void;
}) {
  return (
    <Bevel
      corners="br"
      radius={PORTAL_SURFACE_RADIUS}
      cut={1.75}
      shoulder={0.6}
      fill="var(--surface)"
      stroke="var(--border)"
      className="flex h-full min-h-0 flex-col overflow-hidden"
      style={{ padding: 0 }}
    >
      <div
        className="grid shrink-0 items-center gap-3 ds-mono"
        style={{
          gridTemplateColumns: 'minmax(0, 2.4fr) 8rem 7rem 8rem',
          padding: '0.7rem 1.1rem',
          borderBottom: '1px solid var(--border)',
          fontSize: 'var(--t-xs)',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: 'var(--faint)',
        }}
      >
        <span>Task</span>
        <span>Status</span>
        <span>Date</span>
        <span>Project</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tasks.map((task) => (
          <button
            key={task.id}
            type="button"
            onClick={() => onOpen(task)}
            className="grid w-full items-center gap-3 text-left transition-colors"
            style={{
              gridTemplateColumns: 'minmax(0, 2.4fr) 8rem 7rem 8rem',
              padding: '0.85rem 1.1rem',
              borderBottom: '1px solid color-mix(in oklab, var(--border) 70%, transparent)',
              background: 'transparent',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background =
                'color-mix(in oklab, var(--fg) 4%, transparent)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <span
              className="block truncate"
              style={{ fontSize: 'var(--t-sm)', fontWeight: 600 }}
            >
              {task.name}
            </span>
            <span>
              <Pill color={taskStatusColor(task.status, task.isDone)}>{task.status}</Pill>
            </span>
            <span style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>
              {formatPortalDate(task.date)}
            </span>
            <span
              className="truncate"
              style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}
            >
              {task.projectName ?? '—'}
            </span>
          </button>
        ))}
        {!loading && tasks.length === 0 && (
          <p style={{ padding: '1.25rem', fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>
            No published tasks yet.
          </p>
        )}
      </div>
    </Bevel>
  );
}

function TaskResponseSheet({ task }: { task: PortalTask }) {
  const hostSlug =
    typeof window !== 'undefined' ? getHostSlugFromLocation() ?? undefined : undefined;
  const createResponse = useMutation(api.taskResponses.create);
  const responses = useQuery(api.taskResponses.listForTask, {
    taskId: task.id as Id<'tasks'>,
    hostSlug,
  });

  const [type, setType] = useState<TaskResponseType>('comment');
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const props: { label: string; value: ReactNode }[] = [
    {
      label: 'Status',
      value: <Pill color={taskStatusColor(task.status, task.isDone)}>{task.status}</Pill>,
    },
    { label: 'Date', value: formatPortalDate(task.date) },
    { label: 'Project', value: task.projectName ?? '—' },
    ...(task.projectStatus
      ? [{ label: 'Project status', value: task.projectStatus }]
      : []),
    ...(task.projectEndDate
      ? [{ label: 'Project end', value: formatPortalDate(task.projectEndDate) }]
      : []),
  ];

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await createResponse({
        taskId: task.id as Id<'tasks'>,
        type,
        body: body.trim() || undefined,
        hostSlug,
      });
      setBody('');
      if (type !== 'comment') setType('comment');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send response');
    } finally {
      setSubmitting(false);
    }
  };

  const needsBody = type === 'comment' || type === 'request-change';

  return (
    <div className="flex h-full min-h-0 flex-col gap-5">
      <div className="flex flex-col gap-1">
        {props.map((row) => (
          <div
            key={row.label}
            className="grid items-center gap-3"
            style={{
              gridTemplateColumns: '7.5rem minmax(0, 1fr)',
              minHeight: 36,
              padding: '0.2rem 0',
            }}
          >
            <span
              className="ds-mono"
              style={{ fontSize: 'var(--t-xs)', color: 'var(--faint)' }}
            >
              {row.label}
            </span>
            <span style={{ fontSize: 'var(--t-sm)', fontWeight: 500, color: 'var(--fg)' }}>
              {row.value}
            </span>
          </div>
        ))}
      </div>

      <form
        onSubmit={onSubmit}
        className="flex flex-col gap-3"
        style={{ paddingTop: 14, borderTop: '1px solid var(--border)' }}
      >
        <p
          className="ds-mono"
          style={{
            fontSize: 'var(--t-xs)',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--faint)',
          }}
        >
          Your response
        </p>
        <p style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)', lineHeight: 1.45 }}>
          Tasks are read-only. Approve, request a change, or leave a comment — we handle
          the rest in the team workspace.
        </p>

        <div className="flex flex-wrap gap-2" role="group" aria-label="Response type">
          {(
            [
              ['approve', 'Approve'],
              ['request-change', 'Request change'],
              ['comment', 'Comment'],
            ] as const
          ).map(([key, label]) => {
            const active = type === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setType(key)}
                className="ds-mono"
                style={{
                  fontSize: 'var(--t-xs)',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  padding: '0.4rem 0.7rem',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  cursor: 'pointer',
                  color: active ? 'var(--fg)' : 'var(--muted)',
                  background: active
                    ? 'color-mix(in oklab, var(--fg) 10%, transparent)'
                    : 'transparent',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        {(needsBody || body) && (
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            required={needsBody}
            rows={3}
            placeholder={
              type === 'approve'
                ? 'Optional note'
                : type === 'request-change'
                  ? 'What needs to change?'
                  : 'Add a comment…'
            }
            style={{
              width: '100%',
              resize: 'vertical',
              padding: '0.65rem 0.75rem',
              borderRadius: 10,
              border: '1px solid var(--border)',
              background: 'color-mix(in oklab, var(--bg) 60%, transparent)',
              color: 'var(--fg)',
              fontSize: 'var(--t-sm)',
              lineHeight: 1.45,
            }}
          />
        )}

        {error && (
          <p style={{ fontSize: 'var(--t-xs)', color: 'var(--danger)' }}>{error}</p>
        )}

        <PrimaryButton type="submit" disabled={submitting}>
          {submitting
            ? 'Sending…'
            : type === 'approve'
              ? 'Approve task'
              : type === 'request-change'
                ? 'Request change'
                : 'Post comment'}
        </PrimaryButton>
      </form>

      <div className="min-h-0 flex-1 overflow-y-auto" style={{ marginTop: 4 }}>
        <p
          className="ds-mono"
          style={{
            fontSize: 'var(--t-xs)',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--faint)',
            marginBottom: 10,
          }}
        >
          History
        </p>
        {responses === undefined && (
          <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>Loading…</p>
        )}
        {responses?.length === 0 && (
          <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>
            No responses yet.
          </p>
        )}
        <ul className="flex flex-col gap-3">
          {responses?.map((r) => (
            <li
              key={r.id}
              style={{
                padding: '0.65rem 0.75rem',
                borderRadius: 10,
                border: '1px solid var(--border)',
                background: 'color-mix(in oklab, var(--bg) 45%, transparent)',
              }}
            >
              <div className="flex flex-wrap items-center gap-2">
                <Pill
                  color={
                    r.type === 'approve'
                      ? 'var(--success)'
                      : r.type === 'request-change'
                        ? 'var(--warn)'
                        : 'var(--muted)'
                  }
                >
                  {r.type}
                </Pill>
                <span
                  className="ds-mono"
                  style={{ fontSize: 'var(--t-xs)', color: 'var(--faint)' }}
                >
                  {r.contactName} ·{' '}
                  {new Date(r.createdAt).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
              {r.body && (
                <p
                  style={{
                    fontSize: 'var(--t-sm)',
                    color: 'var(--fg)',
                    marginTop: 8,
                    lineHeight: 1.45,
                  }}
                >
                  {r.body}
                </p>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function PropChip({
  children,
  tone = 'default',
}: {
  children: ReactNode;
  tone?: 'default' | 'muted';
}) {
  return (
    <span
      className="ds-mono inline-flex items-center"
      style={{
        fontSize: 'var(--t-xs)',
        padding: '0.15rem 0.45rem',
        borderRadius: 6,
        border: '1px solid var(--border)',
        color: tone === 'muted' ? 'var(--faint)' : 'var(--muted)',
        background: 'color-mix(in oklab, var(--bg) 40%, transparent)',
      }}
    >
      {children}
    </span>
  );
}
