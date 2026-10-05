'use client';

import { useEffect, useMemo, useState } from 'react';
import { Pill, Surface } from '@/components/ui/primitives';
import { PortalTilePane, PortalWorkspace } from '@/components/layout/PortalWorkspace';
import { usePortalView } from '@/components/providers/PortalViewProvider';
import { tenantEyebrow, usePortalData } from '@/hooks/usePortalData';
import { usePortalAuth } from '@/hooks/usePortalAuth';
import { getHostSlugFromLocation } from '@/lib/auth/host-slug';
import { isConvexConfigured } from '@/lib/convex/client';
import { useFixturePreview } from '@/components/providers/FixturePreviewProvider';
import { useSafeQuery } from '@/hooks/useSafeQuery';
import { useStaffCrossOrg } from '@/hooks/useStaffCrossOrg';
import { api } from '@convex/_generated/api';
import { FIXTURE_DOCS, FIXTURE_PROJECTS, FIXTURE_TASKS } from '@/lib/data/fixtures';
import {
  formatPortalDate,
  projectStatusColor,
  taskStatusColor,
  type PortalProject,
  type PortalTask,
} from '@/lib/data/view-models';
import { PublishChip, SyncChip } from '@/components/sync/SyncChip';
import { DocsBlock, type DocRow } from '@/components/docs/DocsBlock';
import { NewTaskControl } from '@/components/tasks/NewTaskControl';
import { StatusKanban, StatusTable } from '@/components/tasks/StatusKanban';
import { TaskResponseSheet } from '@/components/pages/TasksContent';

const SECTION_TITLE: Record<string, string> = {
  all: 'All projects',
  active: 'Active',
  shipped: 'Shipped',
};

type ProjectRow = PortalProject & {
  clientName?: string | null;
  internal?: boolean;
  taskCount?: number;
  publishToWarehaus?: boolean;
};

function isShipped(status: string): boolean {
  return /ship|done/i.test(status);
}

export function ProjectsContent() {
  const fixtures = useFixturePreview();
  const configured = isConvexConfigured();
  const { sectionFor, openDetail } = usePortalView();
  const { data, loading, error } = usePortalData();
  const { portalSession } = usePortalAuth();
  const hostSlug =
    typeof window !== 'undefined' ? getHostSlugFromLocation() ?? undefined : undefined;
  const activeSection = sectionFor('projects');
  const isStaff = Boolean(portalSession?.isStaff);
  const [internalOnly, setInternalOnly] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [taskView, setTaskView] = useState<'board' | 'table'>('board');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const project = params.get('project');
    if (project) setOpenId(project);
  }, []);

  const staff = useStaffCrossOrg(!fixtures && configured && isStaff, hostSlug);
  const clientDocsState = useSafeQuery<DocRow[]>(
    api.clientDocs.listForClient,
    !fixtures && configured && !isStaff && data.tenant.ok ? { hostSlug } : 'skip',
  );

  const projects = useMemo(
    () =>
      (fixtures ? FIXTURE_PROJECTS : isStaff ? staff.projects ?? [] : data.projects) as ProjectRow[],
    [fixtures, isStaff, staff.projects, data.projects],
  );
  const tasks = (
    fixtures ? FIXTURE_TASKS : isStaff ? staff.tasks ?? data.tasks : data.tasks
  ) as PortalTask[];
  const docs = (
    fixtures ? FIXTURE_DOCS : isStaff ? staff.docs ?? [] : clientDocsState.data ?? []
  ) as DocRow[];
  const projectsLoading = !fixtures && (loading || (isStaff && staff.projectsLoading));

  const visible = useMemo(() => {
    return projects.filter((project) => {
      if (!isStaff && project.internal) return false;
      if (internalOnly && !project.internal) return false;
      if (activeSection === 'shipped') return isShipped(project.status);
      if (activeSection === 'active') return !isShipped(project.status);
      return true;
    });
  }, [projects, isStaff, internalOnly, activeSection]);

  const openProject = visible.find((project) => project.id === openId) ?? projects.find((p) => p.id === openId) ?? null;

  const loadError = error || staff.projectsError
    ? isStaff
      ? error || staff.projectsError
      : 'We could not load your projects'
    : null;

  if (openProject) {
    const projectTasks = tasks.filter((task) => task.projectId === openProject.id);
    const projectDocs = docs.filter((doc) => doc.projectId === openProject.id);
    return (
      <PortalWorkspace
        eyebrow={tenantEyebrow(data.tenant, 'Project')}
        title={openProject.name}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ViewToggle view={taskView} onChange={setTaskView} />
            {isStaff ? <NewTaskControl projectName={openProject.name} /> : null}
          </div>
        }
      >
        <PortalTilePane>
          <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setOpenId(null)}
                className="ds-mono"
                style={{
                  fontSize: 'var(--t-xs)',
                  color: 'var(--accent)',
                  background: 'none',
                  border: 0,
                  cursor: 'pointer',
                }}
              >
                All projects
              </button>
              {openProject.clientName ? <Pill>{openProject.clientName}</Pill> : null}
              <Pill color={projectStatusColor(openProject.status)}>{openProject.status}</Pill>
              <span className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>
                Progress {formatProgress(openProject.progress)}
              </span>
              {isStaff && openProject.publishToWarehaus != null ? (
                <PublishChip published={openProject.publishToWarehaus} />
              ) : null}
              <SyncChip
                notionPageId={openProject.notionPageId}
                syncHidden={openProject.syncHidden}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <h2 style={{ fontSize: 'var(--t-md)', fontWeight: 600 }}>Tasks</h2>
            </div>
            {taskView === 'board' ? (
              <StatusKanban
                tasks={projectTasks}
                loading={projectsLoading}
                onOpen={(task) =>
                  openDetail({
                    id: task.id,
                    title: task.name,
                    subtitle: task.status,
                    body: isStaff ? (
                      <StaffTaskFields task={task} />
                    ) : (
                      <TaskResponseSheet task={task} />
                    ),
                  })
                }
              />
            ) : (
              <StatusTable
                tasks={projectTasks}
                loading={projectsLoading}
                onOpen={(task) =>
                  openDetail({
                    id: task.id,
                    title: task.name,
                    subtitle: task.status,
                    body: isStaff ? <StaffTaskFields task={task} /> : <TaskResponseSheet task={task} />,
                  })
                }
              />
            )}
            <DocsBlock docs={projectDocs} staff={isStaff} />
          </div>
        </PortalTilePane>
      </PortalWorkspace>
    );
  }

  return (
    <PortalWorkspace
      eyebrow={tenantEyebrow(data.tenant, 'Projects')}
      title={SECTION_TITLE[activeSection] ?? 'Projects'}
    >
      <PortalTilePane>
        <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto" data-testid="projects-list">
          {loadError ? (
            <p style={{ color: 'var(--danger)', fontSize: 'var(--t-sm)' }}>{loadError}</p>
          ) : null}
          {!isStaff ? (
            <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>
              You only see what is shared with you.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {isStaff ? (
              <FilterChip active={internalOnly} onClick={() => setInternalOnly((value) => !value)}>
                Internal
              </FilterChip>
            ) : null}
          </div>
          {projectsLoading ? (
            <div className="flex flex-col gap-2" aria-busy="true">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="animate-pulse"
                  style={{ height: 72, borderRadius: 12, background: 'var(--bg)', border: '1px solid var(--border)' }}
                />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <Surface style={{ padding: 'var(--s-5)' }}>
              <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>
                {isStaff
                  ? 'No projects match these filters.'
                  : 'Nothing shared yet. Warehaus will publish projects here when they are ready for you.'}
              </p>
            </Surface>
          ) : (
            visible.map((project) => (
              <button
                key={project.id}
                type="button"
                onClick={() => {
                  setTaskView('board');
                  setOpenId(project.id);
                }}
                className="text-left"
              >
                <Surface style={{ padding: 'var(--s-4)' }}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 style={{ fontSize: 'var(--t-md)', fontWeight: 600, overflowWrap: 'anywhere' }}>
                      {project.name}
                    </h3>
                    <Pill color={projectStatusColor(project.status)}>{project.status}</Pill>
                  </div>
                  <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', marginTop: 6 }}>
                    {project.clientName ?? data.tenant.clientName ?? '—'}
                    {project.description ? ` · ${project.description}` : ''}
                    {project.stack?.length ? ` · ${project.stack.join(', ')}` : ''}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--faint)' }}>
                      {formatProgress(project.progress)} · {project.taskCount ?? tasks.filter((t) => t.projectId === project.id).length} tasks · End {formatPortalDate(project.endDate)}
                    </span>
                    {isStaff && project.publishToWarehaus != null ? (
                      <PublishChip published={project.publishToWarehaus} />
                    ) : null}
                    <SyncChip notionPageId={project.notionPageId} syncHidden={project.syncHidden} />
                  </div>
                </Surface>
              </button>
            ))
          )}
        </div>
      </PortalTilePane>
    </PortalWorkspace>
  );
}

function StaffTaskFields({ task }: { task: PortalTask }) {
  const rows: [string, string][] = [
    ['Status', task.status],
    ['Date', formatPortalDate(task.date)],
    ['Project', task.projectName ?? '—'],
    ['Estimate', task.estimate ?? '—'],
    ['Priority', task.priority ?? '—'],
    ['Source', task.source ?? '—'],
    ['Done', task.isDone ? 'Yes' : 'No'],
  ];
  return (
    <div className="flex flex-col gap-3">
      {rows.map(([label, value]) => (
        <div key={label}>
          <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--faint)' }}>
            {label}
          </p>
          <p style={{ fontSize: 'var(--t-sm)', fontWeight: 600, marginTop: 2, overflowWrap: 'anywhere' }}>
            {label === 'Status' ? (
              <Pill color={taskStatusColor(task.status, task.isDone)}>{value}</Pill>
            ) : (
              value
            )}
          </p>
        </div>
      ))}
      {task.publishToWarehaus != null ? <PublishChip published={task.publishToWarehaus} /> : null}
      <SyncChip notionPageId={task.notionPageId} syncHidden={task.syncHidden} syncState={task.syncState} />
    </div>
  );
}

function ViewToggle({
  view,
  onChange,
}: {
  view: 'board' | 'table';
  onChange: (view: 'board' | 'table') => void;
}) {
  return (
    <div role="tablist" aria-label="Task view" className="inline-flex" style={{ padding: 3, borderRadius: 12, border: '1px solid var(--border)' }}>
      {([
        ['board', 'Board'],
        ['table', 'Table'],
      ] as const).map(([key, label]) => {
        const active = view === key;
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(key)}
            className="ds-mono"
            style={{
              fontSize: 'var(--t-xs)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              padding: '0.45rem 0.85rem',
              borderRadius: 9,
              border: 0,
              cursor: 'pointer',
              fontWeight: key === 'table' ? 500 : 600,
              color: active ? 'var(--fg)' : 'var(--muted)',
              background: active ? 'color-mix(in oklab, var(--fg) 10%, transparent)' : 'transparent',
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="ds-mono"
      style={{
        fontSize: 'var(--t-xs)',
        padding: '0.35rem 0.7rem',
        borderRadius: 999,
        border: '1px solid var(--border)',
        background: active ? 'var(--fg)' : 'transparent',
        color: active ? 'var(--bg)' : 'var(--muted)',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

function formatProgress(value: number | null | undefined): string {
  if (value == null) return '—';
  const pct = value <= 1 ? Math.round(value * 100) : Math.round(value);
  return `${Math.min(100, Math.max(0, pct))}%`;
}
