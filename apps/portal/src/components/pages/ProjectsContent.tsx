'use client';

import { useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { GhostButton, Pill, PrimaryButton, Surface } from '@/components/ui/primitives';
import {
  PortalStatGrid,
  PortalTilePane,
  PortalWorkspace,
} from '@/components/layout/PortalWorkspace';
import { usePortalView } from '@/components/providers/PortalViewProvider';
import { tenantEyebrow, usePortalData } from '@/hooks/usePortalData';
import { usePortalAuth } from '@/hooks/usePortalAuth';
import { getHostSlugFromLocation } from '@/lib/auth/host-slug';
import { isConvexConfigured } from '@/lib/convex/client';
import {
  formatPortalDate,
  projectStatusColor,
  type PortalProject,
  type PortalTask,
} from '@/lib/data/view-models';

const SECTION_TITLE: Record<string, string> = {
  overview: 'Projects',
  active: 'In flight',
  pipeline: 'Pipeline',
};

const PIPELINE_COLUMNS: {
  key: 'inbox' | 'planned' | 'progress' | 'done';
  n: string;
  h: string;
}[] = [
  { key: 'inbox', n: '01', h: 'Inbox' },
  { key: 'planned', n: '02', h: 'Planned' },
  { key: 'progress', n: '03', h: 'In progress' },
  { key: 'done', n: '04', h: 'Done' },
];

const STATUS_OPTIONS = ['Inbox', 'Planned', 'In progress', 'Done'] as const;

type StaffProject = PortalProject & {
  orgId?: string;
  clientName?: string | null;
  clientSlug?: string | null;
};

function statusBucket(status: string): 'progress' | 'planned' | 'inbox' | 'done' {
  const s = status.toLowerCase();
  if (s.includes('done') || s.includes('ship')) return 'done';
  if (s.includes('progress')) return 'progress';
  if (s.includes('plan')) return 'planned';
  return 'inbox';
}

function formatProgress(value: number | null | undefined): string {
  if (value == null) return '—';
  const pct = value <= 1 ? Math.round(value * 100) : Math.round(value);
  return `${Math.min(100, Math.max(0, pct))}%`;
}

const inputStyle: CSSProperties = {
  width: '100%',
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: 'var(--bg)',
  color: 'var(--fg)',
  padding: '0.55rem 0.7rem',
  fontSize: 'var(--t-sm)',
  fontFamily: 'var(--font-body)',
};

export function ProjectsContent() {
  const configured = isConvexConfigured();
  const { sectionFor, setSectionFor, openDetail } = usePortalView();
  const { data, loading } = usePortalData();
  const { portalSession } = usePortalAuth();
  const hostSlug =
    typeof window !== 'undefined' ? getHostSlugFromLocation() ?? undefined : undefined;
  const activeSection = sectionFor('projects');
  const isTeam = data.tenant.mode === 'team';
  const isStaff = Boolean(portalSession?.isStaff);

  const staffProjects = useQuery(
    api.projects.listPublishedForStaff,
    configured && isTeam && isStaff ? { hostSlug } : 'skip',
  );

  const projects: StaffProject[] = useMemo(() => {
    if (isTeam && isStaff && staffProjects) return staffProjects;
    return data.projects;
  }, [isTeam, isStaff, staffProjects, data.projects]);

  const projectsLoading =
    loading || (isTeam && isStaff && staffProjects === undefined);

  const title =
    !isTeam && activeSection === 'active'
      ? 'Your projects'
      : (SECTION_TITLE[activeSection] ?? 'Projects');

  const inProgress = projects.filter((p) => statusBucket(p.status) === 'progress').length;
  const planned = projects.filter((p) => statusBucket(p.status) === 'planned').length;
  const inbox = projects.filter((p) => statusBucket(p.status) === 'inbox').length;

  const [dialogOpen, setDialogOpen] = useState(false);

  const openProject = (p: StaffProject) => {
    openDetail({
      id: p.id,
      title: p.name,
      subtitle: p.clientName ? `${p.status} · ${p.clientName}` : p.status,
      body: (
        <ProjectDetail
          project={p}
          tasks={data.tasks.filter((t) => t.projectId === p.id)}
          clientName={p.clientName ?? data.tenant.clientName}
        />
      ),
    });
  };

  return (
    <PortalWorkspace
      eyebrow={tenantEyebrow(data.tenant, 'Projects')}
      title={title}
      actions={
        isTeam && isStaff ? (
          <PrimaryButton onClick={() => setDialogOpen(true)}>New project</PrimaryButton>
        ) : undefined
      }
    >
      {activeSection === 'overview' && (
        <PortalTilePane>
          <div className="flex h-full min-h-0 flex-col gap-4">
            <PortalStatGrid
              items={[
                { label: 'Active', value: projectsLoading ? '…' : String(projects.length) },
                { label: 'In progress', value: String(inProgress) },
                { label: 'Planned', value: String(planned) },
                { label: 'Inbox', value: String(inbox) },
              ]}
            />
            {!projectsLoading && projects.length === 0 ? (
              <Surface style={{ padding: 'var(--s-5)' }}>
                <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>
                  No published projects yet. Projects with Publish to Warehaus appear here.
                </p>
              </Surface>
            ) : (
              <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-2">
                {projects.slice(0, 4).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => openProject(p)}
                    className="text-left"
                  >
                    <Surface style={{ padding: 'var(--s-4)', height: '100%' }}>
                      <h3 style={{ fontSize: 'var(--t-md)', fontWeight: 600 }}>{p.name}</h3>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Pill color={projectStatusColor(p.status)}>{p.status}</Pill>
                        <span style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>
                          End {formatPortalDate(p.endDate)}
                        </span>
                      </div>
                      {p.clientName ? (
                        <p
                          className="ds-mono mt-2"
                          style={{ fontSize: 'var(--t-xs)', color: 'var(--faint)' }}
                        >
                          {p.clientName}
                        </p>
                      ) : null}
                      {p.progress != null ? (
                        <p
                          className="ds-mono mt-2"
                          style={{ fontSize: 'var(--t-xs)', color: 'var(--faint)' }}
                        >
                          Progress {formatProgress(p.progress)}
                        </p>
                      ) : null}
                    </Surface>
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => setSectionFor('projects', 'active')}
              className="ds-mono self-start"
              style={{
                fontSize: 'var(--t-xs)',
                color: 'var(--accent)',
                background: 'none',
                border: 0,
                cursor: 'pointer',
              }}
            >
              Open full list →
            </button>
          </div>
        </PortalTilePane>
      )}

      {activeSection === 'active' && (
        <PortalTilePane>
          <div
            style={{
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              overflow: 'hidden',
              height: '100%',
            }}
          >
            <div className="h-full overflow-auto">
              {!projectsLoading && projects.length === 0 ? (
                <p
                  style={{
                    fontSize: 'var(--t-sm)',
                    color: 'var(--muted)',
                    padding: 'var(--s-5)',
                  }}
                >
                  No published projects in this workspace.
                </p>
              ) : (
                <table className="ds-data" style={{ minWidth: 520 }}>
                  <thead>
                    <tr>
                      <th>Name</th>
                      {isTeam ? <th>Client</th> : null}
                      <th>Status</th>
                      <th className="num">Progress</th>
                      <th className="num">End</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projects.map((p) => (
                      <tr
                        key={p.id}
                        onClick={() => openProject(p)}
                        style={{ cursor: 'pointer' }}
                      >
                        <td>{p.name}</td>
                        {isTeam ? (
                          <td style={{ color: 'var(--muted)' }}>{p.clientName ?? '—'}</td>
                        ) : null}
                        <td>
                          <Pill color={projectStatusColor(p.status)}>{p.status}</Pill>
                        </td>
                        <td className="num">{formatProgress(p.progress)}</td>
                        <td className="num">{formatPortalDate(p.endDate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </PortalTilePane>
      )}

      {activeSection === 'pipeline' && (
        <PortalTilePane>
          {!projectsLoading && projects.length === 0 ? (
            <Surface style={{ padding: 'var(--s-5)' }}>
              <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>
                Pipeline is empty until published projects exist.
              </p>
            </Surface>
          ) : (
            <div
              className="grid h-full gap-3"
              style={{
                gridTemplateColumns: 'repeat(auto-fit, minmax(min(180px, 100%), 1fr))',
                alignContent: 'start',
              }}
            >
              {PIPELINE_COLUMNS.map((col) => {
                const bucket = projects.filter((p) => statusBucket(p.status) === col.key);
                return (
                  <Surface key={col.key} style={{ padding: 'var(--s-5)' }}>
                    <span
                      className="ds-mono"
                      style={{ fontSize: 'var(--t-xs)', color: 'var(--accent)' }}
                    >
                      {col.n}
                    </span>
                    <h3 style={{ fontSize: 'var(--t-md)', fontWeight: 600, marginTop: 6 }}>
                      {col.h}
                    </h3>
                    <p
                      className="ds-mono"
                      style={{ fontSize: 'var(--t-xs)', color: 'var(--faint)', marginTop: 4 }}
                    >
                      {bucket.length} project{bucket.length === 1 ? '' : 's'}
                    </p>
                    <div className="mt-3 flex flex-col gap-2">
                      {bucket.slice(0, 4).map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => openProject(p)}
                          className="text-left"
                          style={{
                            padding: '0.45rem 0.55rem',
                            borderRadius: 8,
                            border: '1px solid var(--border)',
                            background: 'var(--bg)',
                            cursor: 'pointer',
                          }}
                        >
                          <span style={{ fontSize: 'var(--t-sm)', fontWeight: 600 }}>
                            {p.name}
                          </span>
                          {p.clientName ? (
                            <span
                              className="ds-mono block"
                              style={{
                                fontSize: 'var(--t-xs)',
                                color: 'var(--faint)',
                                marginTop: 2,
                              }}
                            >
                              {p.clientName}
                            </span>
                          ) : null}
                        </button>
                      ))}
                      {bucket.length === 0 ? (
                        <p style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>None</p>
                      ) : null}
                    </div>
                  </Surface>
                );
              })}
            </div>
          )}
        </PortalTilePane>
      )}

      {dialogOpen ? (
        <NewProjectDialog
          hostSlug={hostSlug}
          defaultOrgId={data.clients[0]?.id}
          onClose={() => setDialogOpen(false)}
          onCreated={(project) => {
            setDialogOpen(false);
            setSectionFor('projects', 'active');
            openProject(project);
          }}
        />
      ) : null}
    </PortalWorkspace>
  );
}

function ProjectDetail({
  project,
  tasks,
  clientName,
}: {
  project: StaffProject;
  tasks: PortalTask[];
  clientName: string | null;
}) {
  const rows: [string, string][] = [
    ['Status', project.status],
    ['Progress', formatProgress(project.progress)],
    ['Start', formatPortalDate(project.startDate)],
    ['End', formatPortalDate(project.endDate)],
  ];
  if (clientName) rows.push(['Client', clientName]);
  if (project.stack.length) rows.push(['Stack', project.stack.join(', ')]);
  if (project.liveUrl) rows.push(['Live', project.liveUrl]);

  const openTasks = tasks.filter((t) => !t.isDone);

  return (
    <div className="flex flex-col gap-4">
      {project.description ? (
        <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', lineHeight: 1.5 }}>
          {project.description}
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        {rows.map(([k, v]) => (
          <div key={k}>
            <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--faint)' }}>
              {k}
            </p>
            <p style={{ fontSize: 'var(--t-sm)', fontWeight: 600, marginTop: 2 }}>{v}</p>
          </div>
        ))}
      </div>
      <div>
        <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--faint)' }}>
          Open tasks
        </p>
        {openTasks.length === 0 ? (
          <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', marginTop: 6 }}>
            No open published tasks on this project.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {openTasks.slice(0, 8).map((t) => (
              <li
                key={t.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 8,
                  fontSize: 'var(--t-sm)',
                }}
              >
                <span>{t.name}</span>
                <Pill color={projectStatusColor(t.status)}>{t.status}</Pill>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function NewProjectDialog({
  hostSlug,
  defaultOrgId,
  onClose,
  onCreated,
}: {
  hostSlug?: string;
  defaultOrgId?: string;
  onClose: () => void;
  onCreated: (project: StaffProject) => void;
}) {
  const directory = useQuery(api.clients.listDirectory, { hostSlug });
  const createProject = useMutation(api.projects.createForStaff);

  const [orgId, setOrgId] = useState(defaultOrgId ?? '');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<string>('Inbox');
  const [endDate, setEndDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolvedOrgId =
    orgId ||
    defaultOrgId ||
    directory?.find((c) => c.portalAccess === 'Enabled')?.id ||
    directory?.[0]?.id ||
    '';

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!resolvedOrgId || !name.trim()) {
      setError('Name and client are required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await createProject({
        orgId: resolvedOrgId as Id<'clients'>,
        name: name.trim(),
        description: description.trim() || undefined,
        status,
        endDate: endDate || undefined,
        hostSlug,
      });
      const client = directory?.find((c) => c.id === resolvedOrgId);
      onCreated({
        id: result.id,
        name: name.trim(),
        description: description.trim() || null,
        status,
        progress: 0,
        startDate: null,
        endDate: endDate || null,
        liveUrl: null,
        figmaLink: null,
        docsUrl: null,
        stack: [],
        orgId: resolvedOrgId,
        clientName: client?.name ?? null,
        clientSlug: client?.slug ?? null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create project');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="New project"
      onClick={onClose}
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
      <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(100%, 480px)' }}>
        <Surface style={{ padding: 'var(--s-5)' }}>
          <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>
            New project
          </p>
          <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', marginTop: 8 }}>
            Creates a published portal project in Convex. It appears immediately; Notion can claim
            it later via the synthetic page id.
          </p>
          <form className="mt-4 flex flex-col gap-3" onSubmit={(e) => void onSubmit(e)}>
            <label className="flex flex-col gap-1">
              <span style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>Client</span>
              <select
                style={inputStyle}
                value={resolvedOrgId}
                onChange={(e) => setOrgId(e.target.value)}
                required
              >
                {directory === undefined ? <option value="">Loading clients…</option> : null}
                {directory?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.portalAccess === 'Enabled' ? '' : ' (portal off)'}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>Name</span>
              <input
                style={inputStyle}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Project name"
                required
              />
            </label>
            <label className="flex flex-col gap-1">
              <span style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>Description</span>
              <textarea
                style={inputStyle}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Optional"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>Status</span>
                <select
                  style={inputStyle}
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>End date</span>
                <input
                  style={inputStyle}
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </label>
            </div>
            {error ? (
              <p style={{ fontSize: 'var(--t-sm)', color: 'var(--danger)' }}>{error}</p>
            ) : null}
            <div className="mt-2 flex justify-end gap-2">
              <GhostButton onClick={onClose}>Cancel</GhostButton>
              <PrimaryButton type="submit" disabled={saving || !resolvedOrgId}>
                {saving ? 'Creating…' : 'Create project'}
              </PrimaryButton>
            </div>
          </form>
        </Surface>
      </div>
    </div>
  );
}
