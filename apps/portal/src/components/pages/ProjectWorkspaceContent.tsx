'use client';

import type { CSSProperties, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  GhostButton,
  Pill,
  PrimaryButton,
  Surface,
} from '@/components/ui/primitives';
import {
  PortalStatGrid,
  PortalTilePane,
  PortalWorkspace,
} from '@/components/layout/PortalWorkspace';
import { usePortalView } from '@/components/providers/PortalViewProvider';
import type {
  Project,
  ProjectLink,
  ProjectTask,
  TaskStatus,
} from '@/lib/data/projects';

const SECTION_TITLE: Record<string, string> = {
  overview: 'Overview',
  client: 'Client',
  tasks: 'Tasks',
  context: 'Context',
  design: 'Design',
  build: 'Build',
  resources: 'Resources',
};

const TASK_STATUS: Record<TaskStatus, { label: string; color: string }> = {
  todo: { label: 'To do', color: 'var(--faint)' },
  doing: { label: 'Doing', color: 'var(--accent)' },
  blocked: { label: 'Blocked', color: 'var(--danger)' },
  done: { label: 'Done', color: 'var(--success)' },
};

const LINK_KIND_LABEL: Record<ProjectLink['kind'], string> = {
  figma: 'Figma',
  repo: 'Repo',
  doc: 'Doc',
  drive: 'Drive',
  notion: 'Notion',
  url: 'Link',
  loom: 'Loom',
  vercel: 'Vercel',
};

export function ProjectWorkspaceContent({ project }: { project: Project }) {
  const router = useRouter();
  const { activeSection, setActiveSection, openDetail } = usePortalView();
  const title = SECTION_TITLE[activeSection] ?? project.name;
  const openTasks = project.tasks.filter((t) => t.status !== 'done').length;

  return (
    <PortalWorkspace
      eyebrow={`Projects · ${project.id}`}
      title={title}
      actions={
        <>
          <GhostButton onClick={() => router.push('/projects')}>All projects</GhostButton>
          <PrimaryButton>Share</PrimaryButton>
        </>
      }
    >
      {activeSection === 'overview' && (
        <PortalTilePane>
          <div className="flex h-full min-h-0 flex-col gap-4">
            <div>
              <h2
                className="type-display"
                style={{ fontSize: 'clamp(1.25rem, 1rem + 0.8vw, 1.65rem)', lineHeight: 1.15 }}
              >
                {project.name}
              </h2>
              <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', marginTop: 8, maxWidth: '42rem' }}>
                {project.summary}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Pill>{project.phase}</Pill>
                <span style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>
                  {project.client.name} · Owner {project.owner} · Due {project.due}
                </span>
              </div>
            </div>

            <PortalStatGrid
              items={[
                { label: 'Phase', value: project.phase },
                { label: 'Open tasks', value: String(openTasks) },
                { label: 'Design', value: project.design.files.length ? String(project.design.files.length) : '—' },
                { label: 'Repos', value: project.build.repos.length ? String(project.build.repos.length) : '—' },
              ]}
            />

            <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-2">
              <JumpTile
                label="Client"
                title={project.client.name}
                hint={project.client.primaryContact}
                onClick={() => setActiveSection('client')}
              />
              <JumpTile
                label="Tasks"
                title={`${openTasks} open`}
                hint={project.tasks[0]?.title ?? 'No tasks yet'}
                onClick={() => setActiveSection('tasks')}
              />
              <JumpTile
                label="Context"
                title="Brief & constraints"
                hint={project.context.outcome}
                onClick={() => setActiveSection('context')}
              />
              <JumpTile
                label="Design"
                title={project.design.latest}
                hint={`${project.design.files.length} files`}
                onClick={() => setActiveSection('design')}
              />
              <JumpTile
                label="Build"
                title={project.build.stack.join(' · ') || 'Stack TBD'}
                hint={`${project.build.repos.length} repos`}
                onClick={() => setActiveSection('build')}
              />
              <JumpTile
                label="Resources"
                title={`${project.resources.length} items`}
                hint={project.resources[0]?.title ?? 'Add a resource'}
                onClick={() => setActiveSection('resources')}
              />
            </div>
          </div>
        </PortalTilePane>
      )}

      {activeSection === 'client' && (
        <PortalTilePane>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <Surface style={{ padding: 'var(--s-5)' }}>
              <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>
                Client
              </p>
              <h3 style={{ fontSize: 'var(--t-xl)', fontWeight: 600, marginTop: 8 }}>
                {project.client.name}
              </h3>
              <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', marginTop: 6 }}>
                {project.client.industry}
              </p>
              <dl className="mt-6 grid gap-4 sm:grid-cols-2">
                <Field label="Primary contact" value={project.client.primaryContact} />
                <Field label="Role" value={project.client.role} />
                <Field label="Email" value={project.client.email} />
                <Field label="Slack" value={project.client.slack ?? '—'} />
              </dl>
            </Surface>
            <Surface style={{ padding: 'var(--s-5)' }}>
              <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>
                Engagement
              </p>
              <dl className="mt-4 grid gap-4">
                <Field label="Phase" value={project.phase} />
                <Field label="Warehaus owner" value={project.owner} />
                <Field label="Target" value={project.due} />
                <Field label="Project ID" value={project.id} />
              </dl>
            </Surface>
          </div>
        </PortalTilePane>
      )}

      {activeSection === 'tasks' && (
        <PortalTilePane>
          <div
            style={{
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              overflow: 'hidden',
              height: '100%',
              minHeight: 280,
            }}
          >
            <div className="h-full overflow-auto">
              <table className="ds-data" style={{ minWidth: 560 }}>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Task</th>
                    <th>Status</th>
                    <th>Owner</th>
                    <th className="num">Due</th>
                  </tr>
                </thead>
                <tbody>
                  {project.tasks.map((task) => {
                    const st = TASK_STATUS[task.status];
                    return (
                      <tr
                        key={task.id}
                        onClick={() =>
                          openDetail({
                            id: task.id,
                            title: task.title,
                            subtitle: `${st.label} · ${task.owner}`,
                            body: <TaskDetail task={task} />,
                          })
                        }
                        style={{ cursor: 'pointer' }}
                      >
                        <td className="ds-mono">{task.id}</td>
                        <td>{task.title}</td>
                        <td>
                          <Pill color={st.color}>● {st.label}</Pill>
                        </td>
                        <td>{task.owner}</td>
                        <td className="num">{task.due}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </PortalTilePane>
      )}

      {activeSection === 'context' && (
        <PortalTilePane>
          <div className="grid gap-4 lg:grid-cols-2">
            <Surface style={{ padding: 'var(--s-5)' }}>
              <Label>Problem</Label>
              <p style={{ fontSize: 'var(--t-sm)', marginTop: 8, lineHeight: 1.55 }}>
                {project.context.problem}
              </p>
            </Surface>
            <Surface style={{ padding: 'var(--s-5)' }}>
              <Label>Outcome</Label>
              <p style={{ fontSize: 'var(--t-sm)', marginTop: 8, lineHeight: 1.55 }}>
                {project.context.outcome}
              </p>
            </Surface>
            <Surface style={{ padding: 'var(--s-5)' }}>
              <Label>Audience</Label>
              <p style={{ fontSize: 'var(--t-sm)', marginTop: 8, lineHeight: 1.55 }}>
                {project.context.audience}
              </p>
            </Surface>
            <Surface style={{ padding: 'var(--s-5)' }}>
              <Label>Constraints</Label>
              <ul className="mt-3 flex flex-col gap-2" style={{ paddingLeft: 0, listStyle: 'none' }}>
                {project.context.constraints.map((c) => (
                  <li
                    key={c}
                    style={{
                      fontSize: 'var(--t-sm)',
                      padding: '0.55rem 0.75rem',
                      borderRadius: 10,
                      border: '1px solid var(--border)',
                      background: 'var(--bg)',
                    }}
                  >
                    {c}
                  </li>
                ))}
              </ul>
            </Surface>
            <Surface style={{ padding: 'var(--s-5)', gridColumn: '1 / -1' }}>
              <Label>Working notes</Label>
              <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', marginTop: 8, lineHeight: 1.55 }}>
                {project.context.notes}
              </p>
            </Surface>
          </div>
        </PortalTilePane>
      )}

      {activeSection === 'design' && (
        <PortalTilePane>
          <div className="flex h-full min-h-0 flex-col gap-4">
            <Surface style={{ padding: 'var(--s-5)' }}>
              <Label>Latest</Label>
              <p style={{ fontSize: 'var(--t-md)', fontWeight: 600, marginTop: 8 }}>
                {project.design.latest}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {project.design.systems.map((s) => (
                  <Pill key={s}>{s}</Pill>
                ))}
              </div>
            </Surface>
            <LinkGrid links={project.design.files} empty="No design files linked yet." />
          </div>
        </PortalTilePane>
      )}

      {activeSection === 'build' && (
        <PortalTilePane>
          <div className="flex h-full min-h-0 flex-col gap-4">
            <Surface style={{ padding: 'var(--s-5)' }}>
              <Label>Stack</Label>
              <div className="mt-3 flex flex-wrap gap-2">
                {project.build.stack.map((s) => (
                  <Pill key={s}>{s}</Pill>
                ))}
              </div>
            </Surface>
            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <Label style={{ marginBottom: 12, display: 'block' }}>Repositories</Label>
                <LinkGrid links={project.build.repos} empty="No repos linked yet." />
              </div>
              <div>
                <Label style={{ marginBottom: 12, display: 'block' }}>Environments</Label>
                <LinkGrid links={project.build.environments} empty="No environments yet." />
              </div>
            </div>
          </div>
        </PortalTilePane>
      )}

      {activeSection === 'resources' && (
        <PortalTilePane>
          {project.resources.length === 0 ? (
            <EmptyHint>No resources yet — add briefs, recordings, and shared drives here.</EmptyHint>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {project.resources.map((r) => (
                <Surface key={r.id} style={{ padding: 'var(--s-4)' }}>
                  <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--faint)' }}>
                    {r.type} · {r.updated}
                  </p>
                  <h3 style={{ fontSize: 'var(--t-md)', fontWeight: 600, marginTop: 6 }}>{r.title}</h3>
                  {r.href ? (
                    <a
                      href={r.href}
                      className="ds-mono mt-3 inline-block"
                      style={{ fontSize: 'var(--t-xs)', color: 'var(--accent)' }}
                    >
                      Open →
                    </a>
                  ) : null}
                </Surface>
              ))}
            </div>
          )}
        </PortalTilePane>
      )}
    </PortalWorkspace>
  );
}

function JumpTile({
  label,
  title,
  hint,
  onClick,
}: {
  label: string;
  title: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className="text-left">
      <Surface style={{ padding: 'var(--s-4)', height: '100%' }}>
        <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--faint)' }}>
          {label}
        </p>
        <h3 style={{ fontSize: 'var(--t-md)', fontWeight: 600, marginTop: 6 }}>{title}</h3>
        <p
          className="line-clamp-2"
          style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)', marginTop: 6 }}
        >
          {hint}
        </p>
      </Surface>
    </button>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--faint)' }}>
        {label}
      </dt>
      <dd style={{ fontSize: 'var(--t-sm)', fontWeight: 600, marginTop: 2 }}>{value}</dd>
    </div>
  );
}

function Label({
  children,
  style,
}: {
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <p
      className="ds-mono"
      style={{
        fontSize: 'var(--t-xs)',
        textTransform: 'uppercase',
        letterSpacing: '0.14em',
        color: 'var(--muted)',
        ...style,
      }}
    >
      {children}
    </p>
  );
}

function LinkGrid({ links, empty }: { links: ProjectLink[]; empty: string }) {
  if (!links.length) return <EmptyHint>{empty}</EmptyHint>;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {links.map((link) => (
        <a key={`${link.kind}-${link.label}`} href={link.href} className="block">
          <Surface style={{ padding: 'var(--s-4)', height: '100%' }}>
            <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--accent)' }}>
              {LINK_KIND_LABEL[link.kind]}
            </p>
            <h3 style={{ fontSize: 'var(--t-md)', fontWeight: 600, marginTop: 6 }}>{link.label}</h3>
            <p className="ds-mono mt-3" style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>
              Open →
            </p>
          </Surface>
        </a>
      ))}
    </div>
  );
}

function EmptyHint({ children }: { children: ReactNode }) {
  return (
    <Surface style={{ padding: 'var(--s-5)' }}>
      <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>{children}</p>
    </Surface>
  );
}

function TaskDetail({ task }: { task: ProjectTask }) {
  const st = TASK_STATUS[task.status];
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        {[
          ['Status', st.label],
          ['Owner', task.owner],
          ['Due', task.due],
          ['ID', task.id],
        ].map(([k, v]) => (
          <div key={k}>
            <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--faint)' }}>
              {k}
            </p>
            <p style={{ fontSize: 'var(--t-sm)', fontWeight: 600, marginTop: 2 }}>{v}</p>
          </div>
        ))}
      </div>
      <PrimaryButton>Mark next status</PrimaryButton>
    </div>
  );
}
