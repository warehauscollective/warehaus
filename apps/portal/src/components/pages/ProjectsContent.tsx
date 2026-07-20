'use client';

import { useRouter } from 'next/navigation';
import { Pill, PrimaryButton, Surface } from '@/components/ui/primitives';
import {
  PortalStatGrid,
  PortalTilePane,
  PortalWorkspace,
} from '@/components/layout/PortalWorkspace';
import { usePortalView } from '@/components/providers/PortalViewProvider';
import {
  countByPhase,
  getProjectBySlug,
  PROJECT_PIPELINE,
  PROJECTS,
  projectHref,
  type Project,
} from '@/lib/data/projects';
import { ProjectWorkspaceContent } from '@/components/pages/ProjectWorkspaceContent';

const SECTION_TITLE: Record<string, string> = {
  overview: 'Projects',
  active: 'In flight',
  pipeline: 'Pipeline',
};

export function ProjectsContent() {
  const router = useRouter();
  const { activeSection, openDetail, setActiveSection, projectSlug } = usePortalView();

  if (projectSlug) {
    const project = getProjectBySlug(projectSlug);
    if (project) return <ProjectWorkspaceContent project={project} />;
  }

  const title = SECTION_TITLE[activeSection] ?? 'Projects';

  return (
    <PortalWorkspace
      eyebrow="Portal · Projects"
      title={title}
      actions={<PrimaryButton>New project</PrimaryButton>}
    >
      {activeSection === 'overview' && (
        <PortalTilePane>
          <div className="flex h-full min-h-0 flex-col gap-4">
            <PortalStatGrid
              items={[
                { label: 'Active', value: String(PROJECTS.length) },
                { label: 'Build', value: String(countByPhase('Build')) },
                { label: 'Design', value: String(countByPhase('Design')) },
                { label: 'Discovery', value: String(countByPhase('Discovery')) },
              ]}
            />
            <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-2">
              {PROJECTS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => router.push(projectHref(p))}
                  className="text-left"
                >
                  <Surface style={{ padding: 'var(--s-4)', height: '100%' }}>
                    <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--faint)' }}>
                      {p.id} · {p.client.name}
                    </p>
                    <h3 style={{ fontSize: 'var(--t-md)', fontWeight: 600, marginTop: 6 }}>
                      {p.name}
                    </h3>
                    <p
                      className="line-clamp-2"
                      style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)', marginTop: 6 }}
                    >
                      {p.summary}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Pill>{p.phase}</Pill>
                      <span style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>
                        Due {p.due}
                      </span>
                    </div>
                  </Surface>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setActiveSection('active')}
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
              <table className="ds-data" style={{ minWidth: 640 }}>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Name</th>
                    <th>Client</th>
                    <th>Phase</th>
                    <th>Owner</th>
                    <th className="num">Due</th>
                  </tr>
                </thead>
                <tbody>
                  {PROJECTS.map((p) => (
                    <tr
                      key={p.id}
                      onClick={() =>
                        openDetail({
                          id: p.id,
                          title: p.name,
                          subtitle: `${p.client.name} · ${p.phase}`,
                          body: (
                            <ProjectPreview project={p} onOpen={() => router.push(projectHref(p))} />
                          ),
                        })
                      }
                      style={{ cursor: 'pointer' }}
                    >
                      <td className="ds-mono">{p.id}</td>
                      <td>{p.name}</td>
                      <td>{p.client.name}</td>
                      <td>
                        <Pill>{p.phase}</Pill>
                      </td>
                      <td>{p.owner}</td>
                      <td className="num">{p.due}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </PortalTilePane>
      )}

      {activeSection === 'pipeline' && (
        <PortalTilePane>
          <div
            className="grid h-full gap-3"
            style={{
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(180px, 100%), 1fr))',
              alignContent: 'start',
            }}
          >
            {PROJECT_PIPELINE.map((s) => (
              <Surface key={s.n} style={{ padding: 'var(--s-5)' }}>
                <span className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--accent)' }}>
                  {s.n}
                </span>
                <h3 style={{ fontSize: 'var(--t-md)', fontWeight: 600, marginTop: 6 }}>{s.h}</h3>
                <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', marginTop: 6 }}>{s.p}</p>
              </Surface>
            ))}
          </div>
        </PortalTilePane>
      )}
    </PortalWorkspace>
  );
}

function ProjectPreview({
  project,
  onOpen,
}: {
  project: Project;
  onOpen: () => void;
}) {
  const openTasks = project.tasks.filter((t) => t.status !== 'done').length;
  return (
    <div className="flex flex-col gap-4">
      <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', lineHeight: 1.5 }}>
        {project.summary}
      </p>
      <div className="grid grid-cols-2 gap-3">
        {[
          ['Phase', project.phase],
          ['Owner', project.owner],
          ['Due', project.due],
          ['Open tasks', String(openTasks)],
          ['Client', project.client.name],
          ['Design files', String(project.design.files.length)],
        ].map(([k, v]) => (
          <div key={k}>
            <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--faint)' }}>
              {k}
            </p>
            <p style={{ fontSize: 'var(--t-sm)', fontWeight: 600, marginTop: 2 }}>{v}</p>
          </div>
        ))}
      </div>
      <PrimaryButton onClick={onOpen}>Open workspace</PrimaryButton>
    </div>
  );
}
