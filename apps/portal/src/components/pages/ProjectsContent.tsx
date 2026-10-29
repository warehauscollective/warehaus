'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useMutation } from 'convex/react';
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
import { FIXTURE_CLIENTS, FIXTURE_DOCS, FIXTURE_PROJECTS, FIXTURE_RESOURCES, FIXTURE_TASKS } from '@/lib/data/fixtures';
import {
  attachKnownSync,
  formatPortalDate,
  projectStatusColor,
  type PortalProject,
  type PortalTask,
} from '@/lib/data/view-models';
import { PublishChip, SyncChip } from '@/components/sync/SyncChip';
import { ClientLink } from '@/components/nav/ClientLink';
import { NavBreadcrumb } from '@/components/nav/NavBreadcrumb';
import { clearSearchParam } from '@/lib/nav/clearSearchParam';
import { portalNavDetail } from '@/lib/nav/openPortalHref';
import { resolveBoardRoute } from '@/lib/nav/boardRoute';
import { DocsBlock, type DocRow } from '@/components/docs/DocsBlock';
import { NewProjectControl } from '@/components/projects/NewProjectControl';
import { TaskBoard, type BoardRules } from '@/components/tasks/TaskBoard';
import { TaskCreateDialog, TaskDetailModal } from '@/components/tasks/TaskDetailModal';
import { StatusTable } from '@/components/tasks/StatusKanban';
import { LIVE_TASK_STATUSES, TASK_STAGES, WRITEBACK_OFF_ERROR, createTaskExternalId, stageMoveRule, statusMoveRule } from '@warehaus/portal-sync';
import type { Id } from '@convex/_generated/dataModel';

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
  const { sectionFor, openLinkedClient } = usePortalView();
  const { data, loading, error } = usePortalData();
  const { portalSession } = usePortalAuth();
  const hostSlug =
    typeof window !== 'undefined' ? getHostSlugFromLocation() ?? undefined : undefined;
  const activeSection = sectionFor('projects');
  const isStaff = Boolean(portalSession?.isStaff);
  const [internalOnly, setInternalOnly] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [taskView, setTaskView] = useState<'board' | 'table'>('board');
  const [creating, setCreating] = useState(false);
  const [fixtureTaskId, setFixtureTaskId] = useState<string | null>(null);
  const pathname = usePathname() || '';
  const router = useRouter();
  const moveStatus = useMutation(api.tasks.moveStatus);
  const moveStage = useMutation(api.tasks.moveStage);
  const createTask = useMutation(api.tasks.createTask);
  const rules = useSafeQuery<BoardRules>(
    api.tasks.moveRules,
    !fixtures && configured ? { hostSlug } : 'skip',
  );

  useEffect(() => {
    const apply = (event?: Event) => {
      const detail = event ? portalNavDetail(event) : null;
      const params = new URLSearchParams(window.location.search);
      const project = detail ? detail.project : params.get('project');
      const task = detail ? detail.task : params.get('task');
      if (project) setOpenId(project);
      if (fixtures && (detail || task)) setFixtureTaskId(task);
    };
    apply();
    window.addEventListener('wh-portal-nav', apply);
    return () => window.removeEventListener('wh-portal-nav', apply);
  }, [fixtures]);

  const staff = useStaffCrossOrg(!fixtures && configured && isStaff, hostSlug);
  const directory = useSafeQuery<Array<{ id: string; name: string }>>(
    api.clients.listDirectory,
    !fixtures && configured && isStaff ? { hostSlug } : 'skip',
  );
  const clientDocsState = useSafeQuery<DocRow[]>(
    api.clientDocs.listForClient,
    !fixtures && configured && !isStaff && data.tenant.ok ? { hostSlug } : 'skip',
  );

  const projects = useMemo(() => {
    const rows = (
      fixtures ? FIXTURE_PROJECTS : isStaff ? staff.projects ?? [] : data.projects
    ) as ProjectRow[];
    return attachKnownSync(rows, data.projects);
  }, [fixtures, isStaff, staff.projects, data.projects]);
  const tasks = (
    fixtures
      ? FIXTURE_TASKS.filter((task) => isStaff || (task.publishToWarehaus && !task.syncHidden))
      : isStaff
        ? staff.tasks ?? data.tasks
        : data.tasks
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

  const accessibleProjectIds = useMemo(
    () => projects.filter((project) => isStaff || !project.internal).map((project) => project.id),
    [projects, isStaff],
  );
  const route = resolveBoardRoute({
    pathname: fixtures && fixtureTaskId ? `/tasks/${fixtureTaskId}` : pathname,
    tasks,
    visibleProjectIds: accessibleProjectIds,
  });
  const selectedId = route.view === 'board' ? route.projectId : openId;
  const openProject = selectedId ? projects.find((project) => project.id === selectedId) ?? null : null;
  const routeTaskId = route.view === 'board' ? route.taskId : null;

  const closeProject = () => {
    setOpenId(null);
    setFixtureTaskId(null);
    clearSearchParam('project');
    if (!fixtures && (/^\/projects\/[^/]+/.test(pathname) || pathname.startsWith('/tasks/'))) {
      router.push('/projects');
    }
  };

  const closeTask = () => {
    if (fixtures) {
      setFixtureTaskId(null);
      clearSearchParam('task');
      return;
    }
    if (openProject) router.push(`/projects/${openProject.id}`);
    else router.push('/projects');
  };

  const deepLink = /^\/(?:projects|tasks)\/[^/]+/.test(pathname);
  if (!fixtures && projectsLoading && deepLink) {
    return (
      <PortalWorkspace eyebrow={tenantEyebrow(data.tenant, 'Projects')} title="Projects">
        <PortalTilePane>
          <div className="flex flex-col gap-2" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="animate-pulse"
                style={{ height: 72, borderRadius: 12, background: 'var(--bg)', border: '1px solid var(--border)' }}
              />
            ))}
          </div>
        </PortalTilePane>
      </PortalWorkspace>
    );
  }

  if (route.view === 'unavailable') {
    return (
      <PortalWorkspace eyebrow={tenantEyebrow(data.tenant, 'Projects')} title="Projects">
        <PortalTilePane>
          <Surface style={{ padding: 'var(--s-5)' }}>
            <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>{route.message}</p>
          </Surface>
        </PortalTilePane>
      </PortalWorkspace>
    );
  }

  const loadError = error || staff.projectsError
    ? isStaff
      ? error || staff.projectsError
      : 'We could not load your projects'
    : null;

  if (openProject) {
    const projectTasks = tasks.filter((task) => task.projectId === openProject.id);
    const projectDocs = docs.filter((doc) => {
      if (doc.projectId !== openProject.id) return false;
      if (isStaff) return true;
      return doc.publishToWarehaus !== false && doc.status !== 'Draft';
    });
    const boardActions = (
      <>
        <ViewToggle view={taskView} onChange={setTaskView} />
        {isStaff ? (
          <button type="button" className="ds-mono" onClick={() => setCreating(true)} style={newTaskButton}>
            New task
          </button>
        ) : null}
      </>
    );
    return (
      <PortalWorkspace
        eyebrow={tenantEyebrow(data.tenant, 'Project')}
        title={openProject.name}
        breadcrumb={
          <NavBreadcrumb
            back="always"
            onBack={closeProject}
            parent={{ label: 'Projects', onClick: closeProject }}
            current={openProject.name}
          />
        }
        actions={<div className="hidden flex-wrap items-center gap-2 md:flex">{boardActions}</div>}
      >
        <PortalTilePane>
          <div className="flex h-full min-h-0 min-w-0 flex-col gap-4 overflow-y-auto" data-testid="project-detail" style={{ scrollbarGutter: 'stable' }}>
            <div className="flex flex-col" style={{ gap: 12 }}>
            <div className="flex flex-wrap items-center gap-2">
              {openProject.internal ? <InternalTag /> : (
                <ClientLink
                  name={openProject.clientName}
                  orgId={openProject.orgId}
                  onOpen={openLinkedClient}
                />
              )}
              <Pill color={projectStatusColor(openProject.status)}>{openProject.status}</Pill>
              <span className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>
                Progress {formatProgress(openProject.progress)}
              </span>
              {isStaff && !openProject.internal && openProject.publishToWarehaus != null ? (
                <PublishChip published={openProject.publishToWarehaus} />
              ) : null}
              <SyncChip
                audience={isStaff ? 'staff' : 'client'}
                notionPageId={openProject.notionPageId}
                syncHidden={openProject.syncHidden}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 md:hidden">{boardActions}</div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <h2 style={{ fontSize: 'var(--t-md)', fontWeight: 600 }}>Tasks</h2>
            </div>
            {taskView === 'board' ? (
              <TaskBoard
                tasks={projectTasks}
                staff={isStaff}
                loading={projectsLoading}
                rules={
                  fixtures
                    ? isStaff
                      ? fixtureStaffRules
                      : clientDeniedRules
                    : rules.data ?? (isStaff ? null : clientDeniedRules)
                }
                onOpen={(task) => {
                  setOpenId(openProject.id);
                  if (fixtures) setFixtureTaskId(task.id);
                  else router.push(`/tasks/${task.id}`);
                }}
                onMove={async (request) => {
                  if (fixtures) {
                    if (request.mode === 'stage') return { ok: true, pending: true };
                    return { ok: false, error: WRITEBACK_OFF_ERROR };
                  }
                  if (!request.task.lastEditedTime) {
                    return { ok: false, error: 'This task has no Notion edit time yet. Nothing was sent.' };
                  }
                  const result = request.mode === 'stage'
                    ? await moveStage({
                        hostSlug,
                        taskId: request.task.id as Id<'tasks'>,
                        stage: request.value,
                        expectedLastEditedTime: request.task.lastEditedTime,
                        pullRequestLink: request.pullRequestLink,
                      })
                    : await moveStatus({
                        hostSlug,
                        taskId: request.task.id as Id<'tasks'>,
                        status: request.value,
                        expectedLastEditedTime: request.task.lastEditedTime,
                      });
                  if (!result.ok) return { ok: false, error: result.error };
                  return { ok: true, pending: result.pending === true };
                }}
                onQuickAdd={async ({ name, status, stage }) => {
                  if (fixtures) return { ok: false, error: 'Fixture preview does not send tasks to Notion.' };
                  if (!openProject.notionPageId || !openProject.orgId) {
                    return { ok: false, error: 'This project is not in Notion yet. Nothing was sent.' };
                  }
                  const result = await createTask({
                    hostSlug,
                    orgId: openProject.orgId as Id<'clients'>,
                    name,
                    status,
                    stage,
                    projectNotionId: openProject.notionPageId,
                    externalId: createTaskExternalId(`${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`),
                  });
                  return result.ok ? { ok: true } : { ok: false, error: result.error };
                }}
              />
            ) : (
              <StatusTable
                tasks={projectTasks}
                loading={projectsLoading}
                staff={isStaff}
                onOpen={(task) => {
                  if (fixtures) setFixtureTaskId(task.id);
                  else router.push(`/tasks/${task.id}`);
                }}
              />
            )}
            <DocsBlock docs={projectDocs} staff={isStaff} loading={projectsLoading && projectDocs.length === 0} />
          </div>
        </PortalTilePane>
        {routeTaskId ? (
          <ProjectTaskOverlay
            taskId={routeTaskId}
            tasks={tasks}
            staff={isStaff}
            hostSlug={hostSlug}
            fixtures={fixtures}
            clientName={openProject.internal ? null : openProject.clientName ?? null}
            resources={(fixtures ? FIXTURE_RESOURCES : staff.resources ?? []) as ResourceOption[]}
            onClose={closeTask}
            onOpenTask={(id) => {
              if (fixtures) setFixtureTaskId(id);
              else router.push(`/tasks/${id}`);
            }}
          />
        ) : null}
        {creating ? (
          <TaskCreateDialog
            projectName={openProject.name}
            projectNotionId={openProject.notionPageId ?? null}
            orgId={openProject.orgId ?? null}
            hostSlug={hostSlug}
            onClose={() => setCreating(false)}
          />
        ) : null}
      </PortalWorkspace>
    );
  }

  return (
    <PortalWorkspace
      eyebrow={tenantEyebrow(data.tenant, 'Projects')}
      title={activeSection === 'all' ? 'Projects' : (SECTION_TITLE[activeSection] ?? 'Projects')}
      actions={
        isStaff && process.env.NODE_ENV !== 'production' ? (
          <NewProjectControl
            clients={(fixtures ? FIXTURE_CLIENTS : directory.data ?? []).map((client) => ({
              id: client.id,
              name: client.name,
            }))}
            fixtures={fixtures}
            hostSlug={hostSlug}
          />
        ) : null
      }
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
                    <h3 className="flex min-w-0 flex-wrap items-center gap-2" style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--t-md)', fontWeight: 600, overflowWrap: 'anywhere' }}>
                      {project.name}
                      {project.internal ? <InternalTag /> : null}
                    </h3>
                    <Pill color={projectStatusColor(project.status)}>{project.status}</Pill>
                  </div>
                  <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', marginTop: 6 }}>
                    {project.internal ? null : (project.clientName ?? data.tenant.clientName ?? '—')}
                    {project.description ? ` · ${project.description}` : ''}
                    {project.stack?.length ? ` · ${project.stack.join(', ')}` : ''}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--faint)' }}>
                      {formatProgress(project.progress)} · {project.taskCount ?? tasks.filter((t) => t.projectId === project.id).length} tasks · End {formatPortalDate(project.endDate)}
                    </span>
                    {isStaff && !project.internal && project.publishToWarehaus != null ? (
                      <PublishChip published={project.publishToWarehaus} />
                    ) : null}
                    <SyncChip audience={isStaff ? 'staff' : 'client'} notionPageId={project.notionPageId} syncHidden={project.syncHidden} />
                  </div>
                </Surface>
              </button>
            ))
          )}
        </div>
      </PortalTilePane>
      {routeTaskId ? (
        <ProjectTaskOverlay
          taskId={routeTaskId}
          tasks={tasks}
          staff={isStaff}
          hostSlug={hostSlug}
          fixtures={fixtures}
          clientName={(() => {
            const openTask = tasks.find((item) => item.id === routeTaskId);
            const project = projects.find((item) => item.id === openTask?.projectId);
            return project && !project.internal ? project.clientName ?? null : null;
          })()}
          resources={(fixtures ? FIXTURE_RESOURCES : staff.resources ?? []) as ResourceOption[]}
          onClose={closeTask}
          onOpenTask={(id) => {
            if (fixtures) setFixtureTaskId(id);
            else router.push(`/tasks/${id}`);
          }}
        />
      ) : null}
    </PortalWorkspace>
  );
}

type ResourceOption = {
  id: string;
  name: string;
  type: string | null;
  projectId?: string | null;
  notionPageId?: string | null;
  publishToWarehaus?: boolean;
  updatedAt?: number | null;
  lastSyncedAt?: number | null;
  attachedCount?: number | null;
};

const clientDeniedRules: BoardRules = { actor: 'client', statuses: [], stages: [] };

const fixtureStaffRules: BoardRules = {
  actor: 'staff',
  statuses: LIVE_TASK_STATUSES.map((status) => ({ status, rule: statusMoveRule('staff', status) })),
  stages: TASK_STAGES.map((stage) => ({ stage, rule: stageMoveRule('staff', stage) })),
};

const newTaskButton = {
  border: '1px solid var(--border)',
  borderRadius: 12,
  background: 'var(--fg)',
  color: 'var(--bg)',
  height: 40,
  boxSizing: 'border-box' as const,
  display: 'inline-flex',
  alignItems: 'center',
  padding: '0 0.85rem',
  fontSize: 'var(--t-xs)',
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
  fontWeight: 600,
  lineHeight: 1,
} as const;

function InternalTag() {
  return (
    <span className="ds-mono inline-flex items-center gap-1" style={{ fontSize: 'var(--t-xs)', letterSpacing: '0.08em', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 999, padding: '0.15rem 0.45rem' }}>
      <span aria-hidden>◌</span> INTERNAL
    </span>
  );
}

function ProjectTaskOverlay({
  taskId,
  tasks,
  staff,
  hostSlug,
  fixtures,
  resources,
  clientName = null,
  onClose,
  onOpenTask,
}: {
  taskId: string;
  tasks: PortalTask[];
  staff: boolean;
  hostSlug?: string;
  fixtures: boolean;
  resources: ResourceOption[];
  clientName?: string | null;
  onClose: () => void;
  onOpenTask: (id: string) => void;
}) {
  const task = tasks.find((item) => item.id === taskId) ?? null;
  const taskKey = !fixtures && task ? (task.id as Id<'tasks'>) : null;
  const clientSubs = useSafeQuery<PortalTask[]>(
    api.tasks.listSubtasksForClient,
    taskKey && !staff ? { hostSlug, taskId: taskKey } : 'skip',
  );
  const staffAttached = useSafeQuery<ResourceOption[]>(
    api.sharedResources.listAttachedForStaff,
    taskKey && staff ? { hostSlug, taskId: taskKey } : 'skip',
  );
  const clientAttached = useSafeQuery<ResourceOption[]>(
    api.sharedResources.listAttachedForClient,
    taskKey && !staff ? { hostSlug, taskId: taskKey } : 'skip',
  );
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const apply = () => setPhone(media.matches);
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, []);
  const subtasks = staff
    ? tasks.filter((item) => item.parentTaskId === taskId)
    : (clientSubs.data ?? []).filter((item) => item.publishToWarehaus !== false);
  const fixtureAttached = fixtures && task
    ? resources.filter((resource) => {
        if (resource.projectId !== task.projectId) return false;
        if (staff) return true;
        return resource.publishToWarehaus !== false;
      })
    : [];
  const attached = staff
    ? fixtures ? fixtureAttached : staffAttached.data ?? []
    : clientAttached.data ?? [];
  return (
    <TaskDetailModal
      task={task}
      staff={staff}
      phone={phone}
      unavailable={!task}
      subtasks={subtasks}
      resources={attached}
      projectResources={resources.filter((resource) => !task?.projectId || resource.projectId === task.projectId)}
      clientName={clientName}
      hostSlug={hostSlug}
      live={!fixtures}
      onClose={onClose}
      onOpenTask={onOpenTask}
    />
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
