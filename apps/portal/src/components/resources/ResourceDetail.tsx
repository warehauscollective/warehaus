'use client';

import type { ReactNode } from 'react';
import { Pill, Surface } from '@/components/ui/primitives';
import { PublishChip } from '@/components/sync/SyncChip';
import { notionNotesHref, resourceMeta, usedInTasksSubtitle } from '@/lib/data/resourceDetail';
import { taskStatusColor } from '@/lib/data/view-models';

export type ResourceTaskRow = {
  id: string;
  name: string;
  status: string;
  stage?: string | null;
  projectName?: string | null;
  date?: string | null;
  publishToWarehaus?: boolean;
};

export type ResourceDetailModel = {
  id: string;
  name: string;
  description?: string | null;
  type?: string | null;
  url?: string | null;
  projectName?: string | null;
  clientName?: string | null;
  updatedAt?: number | null;
  staff: boolean;
  publishToWarehaus?: boolean;
  notionPageId?: string | null;
};

function LockedButton({ label, testId }: { label: string; testId: string }) {
  return (
    <button
      type="button"
      disabled
      aria-disabled="true"
      data-testid={testId}
      title="Not available yet"
      style={{
        fontSize: 14,
        fontWeight: 500,
        padding: '12px 16px',
        borderRadius: 9,
        border: '1px solid var(--border)',
        background: 'transparent',
        color: 'var(--muted)',
        cursor: 'not-allowed',
      }}
    >
      {label}
    </button>
  );
}

function Section({
  title,
  subtitle,
  testId,
  children,
}: {
  title: string;
  subtitle: string;
  testId: string;
  children: ReactNode;
}) {
  return (
    <Surface style={{ padding: '2rem', borderRadius: '2.25rem' }}>
      <section data-testid={testId}>
        <h2 style={{ fontSize: 20, fontWeight: 600, lineHeight: '26px' }}>{title}</h2>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4, lineHeight: '19px' }}>{subtitle}</p>
        <div className="mt-6">{children}</div>
      </section>
    </Surface>
  );
}

function formatDue(date: string | null | undefined): string | null {
  if (!date) return null;
  const parsed = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed)) return date;
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(parsed);
}

export function ResourceDetail({
  resource,
  tasks,
  tasksLoading,
  onOpenTask,
}: {
  resource: ResourceDetailModel;
  tasks: ResourceTaskRow[];
  tasksLoading: boolean;
  onOpenTask: (taskId: string) => void;
}) {
  const notesHref = resource.staff ? notionNotesHref(resource.notionPageId) : null;
  const published = resource.publishToWarehaus === true;
  const recap = resource.description?.trim() || null;

  return (
    <div className="flex h-full min-h-0 flex-col gap-6 overflow-y-auto" data-testid="resource-detail">
      <Surface style={{ padding: '2rem', borderRadius: '2.25rem' }}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h2 style={{ fontSize: 26, fontWeight: 600, lineHeight: '32px', overflowWrap: 'anywhere' }}>{resource.name}</h2>
            <p style={{ fontSize: 14, color: 'var(--muted)', marginTop: 6 }}>
              {resourceMeta(resource.type, resource.updatedAt)}
              {resource.projectName ? ` · ${resource.projectName}` : ''}
            </p>
          </div>
          {resource.staff ? <LockedButton label="Edit recap" testId="edit-recap" /> : null}
        </div>
        {resource.staff && resource.publishToWarehaus != null ? (
          <div className="mt-4">
            <PublishChip published={published} />
          </div>
        ) : null}
        {!resource.staff ? (
          <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 12 }}>A recap, not a transcript.</p>
        ) : null}
      </Surface>

      {resource.staff ? (
        <Section
          title="Publish to client"
          subtitle="Off by default. Only the recap below becomes visible, never the transcript."
          testId="publish-recap-panel"
        >
          <div className="flex items-center justify-between gap-4">
            <p style={{ fontSize: 14 }}>
              Publish recap{resource.clientName ? ` to ${resource.clientName}` : ''}
            </p>
            <button
              type="button"
              role="switch"
              aria-checked={published}
              aria-disabled="true"
              disabled
              data-testid="publish-recap"
              title="Publishing stays off until write-back is enabled"
              style={{
                width: 44,
                height: 26,
                borderRadius: 999,
                border: '1px solid var(--border)',
                background: published ? 'var(--fg)' : 'var(--bg)',
                position: 'relative',
                cursor: 'not-allowed',
                flex: '0 0 auto',
              }}
            >
              <span
                aria-hidden
                style={{
                  position: 'absolute',
                  top: 3,
                  left: published ? 21 : 3,
                  width: 18,
                  height: 18,
                  borderRadius: 999,
                  background: published ? 'var(--bg)' : 'var(--muted)',
                }}
              />
            </button>
          </div>
        </Section>
      ) : null}

      <Section
        title="Where this lives"
        subtitle={resource.staff ? 'Item, resource, then the full page in Notion' : 'Item, then this resource'}
        testId="where-this-lives"
      >
        <ul className="flex flex-col gap-3">
          {tasks.map((task) => (
            <li key={task.id}>
              <button
                type="button"
                onClick={() => onOpenTask(task.id)}
                className="flex w-full items-center gap-3 text-left"
                style={{
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderRadius: 18,
                  padding: '14px 16px',
                  color: 'inherit',
                  cursor: 'pointer',
                }}
              >
                <span className="ds-mono" style={{ fontSize: 11, color: 'var(--faint)', width: 72 }}>ITEM</span>
                <span className="min-w-0 flex-1" style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{task.name}</span>
              </button>
            </li>
          ))}
          <li
            className="flex items-center gap-3"
            style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 18, padding: '14px 16px' }}
          >
            <span className="ds-mono" style={{ fontSize: 11, color: 'var(--faint)', width: 72 }}>RESOURCE</span>
            <span className="min-w-0 flex-1">
              <span className="block" style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{resource.name}</span>
              <span className="block" style={{ fontSize: 13, color: 'var(--muted)' }}>{resource.type ?? 'Shared resource'}</span>
            </span>
          </li>
          {resource.staff ? (
            <li
              className="flex flex-wrap items-center gap-3"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 18, padding: '14px 16px' }}
            >
              <span className="ds-mono" style={{ fontSize: 11, color: 'var(--faint)', width: 72 }}>FULL NOTES</span>
              <span className="min-w-0 flex-1">
                <span className="block" style={{ fontWeight: 600 }}>Notion page</span>
                <span className="block" style={{ fontSize: 13, color: 'var(--muted)' }}>
                  {notesHref ? 'Open the page in Notion' : 'No Notion page on this resource'}
                </span>
              </span>
              {notesHref ? (
                <a href={notesHref} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--fg)', fontSize: 14 }}>
                  Open full notes in Notion
                </a>
              ) : (
                <LockedButton label="Open full notes in Notion" testId="open-notes" />
              )}
            </li>
          ) : null}
        </ul>
      </Section>

      <Section
        title="Client-safe recap"
        subtitle={resource.staff ? 'This is exactly what the client can open' : 'A recap, not a transcript'}
        testId="client-safe-recap"
      >
        <p style={{ fontSize: 14, lineHeight: '22px', overflowWrap: 'anywhere', color: recap ? 'var(--fg)' : 'var(--muted)' }}>
          {recap ?? 'No recap yet.'}
        </p>
        {resource.url ? (
          <a href={resource.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--fg)', fontSize: 14, display: 'inline-block', marginTop: 12 }}>
            Open
          </a>
        ) : null}
      </Section>

      <Section title="Used in tasks" subtitle={tasksLoading ? 'Loading tasks…' : usedInTasksSubtitle(tasks.length)} testId="used-in-tasks">
        {tasksLoading ? null : tasks.length === 0 ? (
          <div
            style={{
              border: '1px dashed var(--border)',
              borderRadius: 18,
              padding: '20px 16px',
            }}
          >
            <p style={{ fontSize: 14, fontWeight: 500 }}>Not used in any task yet</p>
            <p style={{ fontSize: 14, color: 'var(--muted)', marginTop: 6 }}>
              {resource.staff
                ? 'Open a task and use Attach to link this resource.'
                : 'Warehaus will show a task here when this resource is shared on it.'}
            </p>
          </div>
        ) : (
          <ul>
            {tasks.map((task) => {
              const due = formatDue(task.date);
              return (
                <li key={task.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <button
                    type="button"
                    onClick={() => onOpenTask(task.id)}
                    className="flex w-full flex-wrap items-center gap-2 text-left"
                    style={{ background: 'none', border: 0, padding: '1rem 0', color: 'inherit', cursor: 'pointer' }}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block" style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{task.name}</span>
                      <span className="block" style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>
                        {[task.projectName, due ? `Due ${due}` : null].filter(Boolean).join(' · ') || 'Task'}
                      </span>
                    </span>
                    {task.stage === 'Awaiting Go' ? <Pill color="var(--danger)">Awaiting Go</Pill> : task.stage ? <Pill>{task.stage}</Pill> : null}
                    <Pill color={taskStatusColor(task.status, false)}>{task.status}</Pill>
                    {resource.staff && task.publishToWarehaus != null ? (
                      <PublishChip published={task.publishToWarehaus} />
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </div>
  );
}
