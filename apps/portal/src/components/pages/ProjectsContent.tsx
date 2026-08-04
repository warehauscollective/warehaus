'use client';

import { Pill, PrimaryButton, Surface } from '@/components/ui/primitives';
import {
  PortalStatGrid,
  PortalTilePane,
  PortalWorkspace,
} from '@/components/layout/PortalWorkspace';
import { usePortalView } from '@/components/providers/PortalViewProvider';
import { tenantEyebrow, usePortalData } from '@/hooks/usePortalData';
import {
  formatPortalDate,
  projectStatusColor,
  type PortalProject,
} from '@/lib/data/view-models';

const PIPELINE = [
  { n: '01', h: 'Brief', p: 'Scope lands from Dream. One owner, one outcome.' },
  { n: '02', h: 'Design', p: 'Surfaces and flows — empty/error first.' },
  { n: '03', h: 'Build', p: 'Ship into the portal. End inside real work.' },
];

const SECTION_TITLE: Record<string, string> = {
  overview: 'Projects',
  active: 'In flight',
  pipeline: 'Pipeline',
};

function statusBucket(status: string): 'progress' | 'planned' | 'inbox' | 'done' {
  const s = status.toLowerCase();
  if (s.includes('done') || s.includes('ship')) return 'done';
  if (s.includes('progress')) return 'progress';
  if (s.includes('plan')) return 'planned';
  return 'inbox';
}

export function ProjectsContent() {
  const { sectionFor, setSectionFor, openDetail } = usePortalView();
  const { data, loading } = usePortalData();
  const activeSection = sectionFor('projects');
  const projects = data.projects;
  const title =
    data.tenant.mode === 'client' && activeSection === 'active'
      ? 'Your projects'
      : (SECTION_TITLE[activeSection] ?? 'Projects');

  const inProgress = projects.filter((p) => statusBucket(p.status) === 'progress').length;
  const planned = projects.filter((p) => statusBucket(p.status) === 'planned').length;
  const inbox = projects.filter((p) => statusBucket(p.status) === 'inbox').length;

  return (
    <PortalWorkspace
      eyebrow={tenantEyebrow(data.tenant, 'Projects')}
      title={title}
      actions={data.tenant.mode === 'team' ? <PrimaryButton>New project</PrimaryButton> : undefined}
    >
      {activeSection === 'overview' && (
        <PortalTilePane>
          <div className="flex h-full min-h-0 flex-col gap-4">
            <PortalStatGrid
              items={[
                { label: 'Active', value: loading ? '…' : String(projects.length) },
                { label: 'In progress', value: String(inProgress) },
                { label: 'Planned', value: String(planned) },
                { label: 'Inbox', value: String(inbox) },
              ]}
            />
            <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-2">
              {projects.slice(0, 4).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() =>
                    openDetail({
                      id: p.id,
                      title: p.name,
                      subtitle: p.status,
                      body: <ProjectDetail project={p} />,
                    })
                  }
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
                    {p.progress != null && (
                      <p
                        className="ds-mono mt-2"
                        style={{ fontSize: 'var(--t-xs)', color: 'var(--faint)' }}
                      >
                        Progress {Math.round(p.progress * 100)}%
                      </p>
                    )}
                  </Surface>
                </button>
              ))}
            </div>
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
              <table className="ds-data" style={{ minWidth: 520 }}>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Status</th>
                    <th className="num">Progress</th>
                    <th className="num">End</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map((p) => (
                    <tr
                      key={p.id}
                      onClick={() =>
                        openDetail({
                          id: p.id,
                          title: p.name,
                          subtitle: p.status,
                          body: <ProjectDetail project={p} />,
                        })
                      }
                      style={{ cursor: 'pointer' }}
                    >
                      <td>{p.name}</td>
                      <td>
                        <Pill color={projectStatusColor(p.status)}>{p.status}</Pill>
                      </td>
                      <td className="num">
                        {p.progress != null ? `${Math.round(p.progress * 100)}%` : '—'}
                      </td>
                      <td className="num">{formatPortalDate(p.endDate)}</td>
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
            {PIPELINE.map((s) => (
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

function ProjectDetail({ project }: { project: PortalProject }) {
  const rows: [string, string][] = [
    ['Status', project.status],
    ['Progress', project.progress != null ? `${Math.round(project.progress * 100)}%` : '—'],
    ['Start', formatPortalDate(project.startDate)],
    ['End', formatPortalDate(project.endDate)],
  ];
  if (project.stack.length) rows.push(['Stack', project.stack.join(', ')]);
  if (project.liveUrl) rows.push(['Live', project.liveUrl]);

  return (
    <div className="flex flex-col gap-4">
      {project.description && (
        <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', lineHeight: 1.5 }}>
          {project.description}
        </p>
      )}
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
    </div>
  );
}
