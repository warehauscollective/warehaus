import { Eyebrow, Pill, PrimaryButton, Section, Surface } from '@/components/ui/primitives';

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

export function ProjectsContent() {
  return (
    <div style={{ maxWidth: 'var(--maxw)' }}>
      <Section id="overview" style={{ paddingTop: 'clamp(3rem, 2rem + 5vw, 5rem)' }}>
        <Eyebrow>Portal · Projects</Eyebrow>
        <h1
          className="type-display"
          style={{ fontSize: 'var(--t-3xl)', marginTop: 'var(--s-4)', maxWidth: '14ch' }}
        >
          Projects
        </h1>
        <p className="ds-lead" style={{ marginTop: 'var(--s-5)' }}>
          Active workstreams and deliverables — the same density rules as shipments, applied to
          engagements.
        </p>
      </Section>

      <Section id="active">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Eyebrow>Active</Eyebrow>
            <h2 className="type-heading" style={{ fontSize: 'var(--t-2xl)', marginTop: 'var(--s-3)' }}>
              In flight
            </h2>
          </div>
          <PrimaryButton>New project</PrimaryButton>
        </div>
        <div
          style={{
            marginTop: 'var(--s-6)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            overflow: 'hidden',
          }}
        >
          <div style={{ overflowX: 'auto' }}>
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
                  <tr key={p.id}>
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
      </Section>

      <Section id="pipeline">
        <Eyebrow>Pipeline</Eyebrow>
        <h2 className="type-heading" style={{ fontSize: 'var(--t-2xl)', marginTop: 'var(--s-3)' }}>
          From brief to done
        </h2>
        <div
          className="grid gap-4"
          style={{
            marginTop: 'var(--s-6)',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))',
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
      </Section>
    </div>
  );
}
