'use client';

import { Pill, PrimaryButton, Surface } from '@/components/ui/primitives';
import {
  PortalStatGrid,
  PortalTilePane,
  PortalWorkspace,
} from '@/components/layout/PortalWorkspace';
import { usePortalView } from '@/components/providers/PortalViewProvider';

const PROJECTS = [
  { id: 'PRJ-104', name: 'North Bay retrofit', phase: 'Build', owner: 'M. Chen', due: 'Apr 12' },
  { id: 'PRJ-108', name: 'Portal chatroom v1', phase: 'Design', owner: 'A. Okonkwo', due: 'Apr 18' },
  { id: 'PRJ-111', name: 'Dock capacity model', phase: 'Discovery', owner: 'J. Park', due: 'May 02' },
  { id: 'PRJ-115', name: 'Operator onboarding', phase: 'Build', owner: 'S. Rivera', due: 'May 09' },
];

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

export function ProjectsContent() {
  const { activeSection, openDetail, setActiveSection } = usePortalView();
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
                { label: 'Build', value: '2' },
                { label: 'Design', value: '1' },
                { label: 'Discovery', value: '1' },
              ]}
            />
            <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-2">
              {PROJECTS.slice(0, 4).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() =>
                    openDetail({
                      id: p.id,
                      title: p.name,
                      subtitle: `${p.phase} · ${p.owner}`,
                      body: <ProjectDetail project={p} />,
                    })
                  }
                  className="text-left"
                >
                  <Surface style={{ padding: 'var(--s-4)', height: '100%' }}>
                    <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--faint)' }}>
                      {p.id}
                    </p>
                    <h3 style={{ fontSize: 'var(--t-md)', fontWeight: 600, marginTop: 6 }}>
                      {p.name}
                    </h3>
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
              <table className="ds-data" style={{ minWidth: 520 }}>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Name</th>
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
                          subtitle: `${p.phase} · ${p.owner}`,
                          body: <ProjectDetail project={p} />,
                        })
                      }
                      style={{ cursor: 'pointer' }}
                    >
                      <td className="ds-mono">{p.id}</td>
                      <td>{p.name}</td>
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

function ProjectDetail({ project }: { project: (typeof PROJECTS)[number] }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        {[
          ['Phase', project.phase],
          ['Owner', project.owner],
          ['Due', project.due],
          ['ID', project.id],
        ].map(([k, v]) => (
          <div key={k}>
            <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--faint)' }}>
              {k}
            </p>
            <p style={{ fontSize: 'var(--t-sm)', fontWeight: 600, marginTop: 2 }}>{v}</p>
          </div>
        ))}
      </div>
      <PrimaryButton>Open workspace</PrimaryButton>
    </div>
  );
}
