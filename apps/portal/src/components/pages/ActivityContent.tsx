import { Eyebrow, Pill, Section, Surface } from '@/components/ui/primitives';

const FEED = [
  { t: '14:18', h: 'SH-4821 docked', p: 'North Bay Hub · Dock 3', tone: 'var(--success)' },
  { t: '14:05', h: 'SH-4822 delayed', p: 'Portland DC · ETA +45m', tone: 'var(--warn)' },
  { t: '13:42', h: 'Team invite sent', p: 'operator@northbay.co', tone: 'var(--accent)' },
  { t: '12:10', h: 'Location connected', p: 'Sparks Yard', tone: 'var(--success)' },
];

const EXCEPTIONS = [
  { id: 'EX-07', h: 'Missing pallet count', p: 'SH-4825 · Sparks Yard', status: 'Open' },
  { id: 'EX-06', h: 'Dock conflict', p: 'Dock 1 double-booked 15:00', status: 'Open' },
  { id: 'EX-03', h: 'Stale ETA', p: 'SH-4810 · no update in 2h', status: 'Watching' },
];

export function ActivityContent() {
  return (
    <div style={{ maxWidth: 'var(--maxw)' }}>
      <Section id="overview" style={{ paddingTop: 'clamp(3rem, 2rem + 5vw, 5rem)' }}>
        <Eyebrow>Portal · Activity</Eyebrow>
        <h1
          className="type-display"
          style={{ fontSize: 'var(--t-3xl)', marginTop: 'var(--s-4)', maxWidth: '14ch' }}
        >
          Activity
        </h1>
        <p className="ds-lead" style={{ marginTop: 'var(--s-5)' }}>
          A feed of what moved — built for scan-and-act density. Exceptions surface first when they
          matter.
        </p>
      </Section>

      <Section id="feed">
        <Eyebrow>Feed</Eyebrow>
        <h2 className="type-heading" style={{ fontSize: 'var(--t-2xl)', marginTop: 'var(--s-3)' }}>
          Today
        </h2>
        <div className="flex flex-col" style={{ marginTop: 'var(--s-6)', gap: 'var(--s-3)' }}>
          {FEED.map((item) => (
            <Surface key={item.t + item.h} style={{ padding: 'var(--s-5)' }}>
              <div className="flex gap-4">
                <span
                  className="ds-mono"
                  style={{ fontSize: 'var(--t-xs)', color: 'var(--faint)', minWidth: '3.5rem' }}
                >
                  {item.t}
                </span>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 999,
                        background: item.tone,
                        flex: 'none',
                      }}
                    />
                    <h3 style={{ fontSize: 'var(--t-md)', fontWeight: 600 }}>{item.h}</h3>
                  </div>
                  <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', marginTop: 4 }}>
                    {item.p}
                  </p>
                </div>
              </div>
            </Surface>
          ))}
        </div>
      </Section>

      <Section id="exceptions">
        <Eyebrow>Exceptions</Eyebrow>
        <h2 className="type-heading" style={{ fontSize: 'var(--t-2xl)', marginTop: 'var(--s-3)' }}>
          Needs attention
        </h2>
        <div
          style={{
            marginTop: 'var(--s-6)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            overflow: 'hidden',
          }}
        >
          <table className="ds-data" style={{ minWidth: 480 }}>
            <thead>
              <tr>
                <th>ID</th>
                <th>Issue</th>
                <th>Context</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {EXCEPTIONS.map((e) => (
                <tr key={e.id}>
                  <td className="ds-mono">{e.id}</td>
                  <td>{e.h}</td>
                  <td style={{ color: 'var(--muted)' }}>{e.p}</td>
                  <td>
                    <Pill color={e.status === 'Open' ? 'var(--danger)' : 'var(--warn)'}>
                      {e.status}
                    </Pill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
