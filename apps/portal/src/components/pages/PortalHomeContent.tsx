import { Eyebrow, GhostButton, Pill, PrimaryButton, Section, Surface } from '@/components/ui/primitives';

const SHIPMENTS = [
  { id: 'SH-4821', origin: 'North Bay Hub', dock: 'Dock 3', status: ['On time', 'var(--success)'], pallets: '24', eta: '14:20' },
  { id: 'SH-4822', origin: 'Portland DC', dock: 'Dock 1', status: ['Delayed', 'var(--warn)'], pallets: '18', eta: '15:05' },
  { id: 'SH-4823', origin: 'Reno Cross-dock', dock: '—', status: ['Queued', 'var(--faint)'], pallets: '31', eta: '16:40' },
  { id: 'SH-4824', origin: 'North Bay Hub', dock: 'Dock 7', status: ['On time', 'var(--success)'], pallets: '12', eta: '17:10' },
  { id: 'SH-4825', origin: 'Sparks Yard', dock: 'Dock 2', status: ['Exception', 'var(--danger)'], pallets: '9', eta: '—' },
];

export function PortalHomeContent() {
  return (
    <div style={{ maxWidth: 'var(--maxw)' }}>
      <Section id="overview" style={{ paddingTop: 'clamp(3rem, 2rem + 5vw, 5rem)' }}>
        <Eyebrow>Portal</Eyebrow>
        <h1
          className="type-display"
          style={{ fontSize: 'var(--t-3xl)', marginTop: 'var(--s-4)', maxWidth: '16ch' }}
        >
          Overview
        </h1>
        <p className="ds-lead" style={{ marginTop: 'var(--s-5)' }}>
          Where the work actually happens — dense tables, inline forms, and flows tuned for
          operators who live in this surface all day.
        </p>
        <div className="flex flex-wrap gap-2" style={{ marginTop: 'var(--s-5)' }}>
          {['App Shell', 'Data & Forms', 'Flows'].map((t) => (
            <Pill key={t}>{t}</Pill>
          ))}
        </div>
        <div
          className="grid gap-4"
          style={{
            marginTop: 'var(--s-7)',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(180px, 100%), 1fr))',
          }}
        >
          {[
            { label: 'On time', value: '38' },
            { label: 'In dock', value: '12' },
            { label: 'Exceptions', value: '3' },
            { label: 'Queued', value: '9' },
          ].map((stat) => (
            <Surface key={stat.label} style={{ padding: 'var(--s-5)' }}>
              <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>
                {stat.label}
              </p>
              <p
                className="ds-mono"
                style={{ fontSize: 'var(--t-2xl)', marginTop: 'var(--s-2)', color: 'var(--fg)' }}
              >
                {stat.value}
              </p>
            </Surface>
          ))}
        </div>
      </Section>

      <Section id="shipments">
        <Eyebrow>Data</Eyebrow>
        <h2 className="type-heading" style={{ fontSize: 'var(--t-2xl)', marginTop: 'var(--s-3)' }}>
          Shipments
        </h2>
        <p className="ds-lead" style={{ marginTop: 'var(--s-4)' }}>
          Dense, scannable, tabular. Status at a glance — the pattern from the style guide, live in
          the portal shell.
        </p>
        <div
          style={{
            marginTop: 'var(--s-6)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            overflow: 'hidden',
          }}
        >
          <div
            className="flex flex-wrap items-center"
            style={{
              gap: 'var(--s-3)',
              padding: 'var(--s-4)',
              borderBottom: '1px solid var(--border)',
              background: 'var(--bg-2)',
            }}
          >
            <input
              className="ds-input"
              placeholder="Filter shipments…"
              style={{ flex: 1, minWidth: 160, background: 'var(--bg)' }}
            />
            <GhostButton>Export</GhostButton>
            <PrimaryButton>New shipment</PrimaryButton>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="ds-data" style={{ minWidth: 560 }}>
              <thead>
                <tr>
                  <th>Shipment</th>
                  <th>Origin</th>
                  <th>Dock</th>
                  <th>Status</th>
                  <th className="num">Pallets</th>
                  <th className="num">ETA</th>
                </tr>
              </thead>
              <tbody>
                {SHIPMENTS.map((r) => (
                  <tr key={r.id}>
                    <td>{r.id}</td>
                    <td>{r.origin}</td>
                    <td>{r.dock}</td>
                    <td>
                      <Pill color={r.status[1]}>● {r.status[0]}</Pill>
                    </td>
                    <td className="num">{r.pallets}</td>
                    <td className="num">{r.eta}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Section>

      <Section id="new-shipment">
        <Eyebrow>Form</Eyebrow>
        <h2 className="type-heading" style={{ fontSize: 'var(--t-2xl)', marginTop: 'var(--s-3)' }}>
          New shipment
        </h2>
        <p className="ds-lead" style={{ marginTop: 'var(--s-4)' }}>
          Inline validation on blur. One primary action. Comfort here means speed, not space.
        </p>
        <Surface style={{ marginTop: 'var(--s-6)' }}>
          <Eyebrow>Create</Eyebrow>
          <div className="grid gap-5 md:grid-cols-2" style={{ marginTop: 'var(--s-5)' }}>
            <label className="flex flex-col" style={{ gap: 'var(--s-2)' }}>
              <span style={{ fontSize: 'var(--t-sm)', fontWeight: 500, color: 'var(--muted)' }}>
                Shipment ID
              </span>
              <input className="ds-input" value="SH-4826" readOnly />
              <span style={{ fontSize: 'var(--t-xs)', color: 'var(--faint)' }}>
                Auto-generated · read only
              </span>
            </label>
            <label className="flex flex-col" style={{ gap: 'var(--s-2)' }}>
              <span style={{ fontSize: 'var(--t-sm)', fontWeight: 500, color: 'var(--muted)' }}>
                Origin
              </span>
              <input className="ds-input" placeholder="Select a location…" />
            </label>
            <label className="flex flex-col" style={{ gap: 'var(--s-2)' }}>
              <span style={{ fontSize: 'var(--t-sm)', fontWeight: 500, color: 'var(--muted)' }}>
                Pallet count
              </span>
              <input className="ds-input" defaultValue="24" style={{ borderColor: 'var(--success)' }} />
              <span style={{ fontSize: 'var(--t-xs)', color: 'var(--faint)' }}>
                Within dock capacity
              </span>
            </label>
            <label className="flex flex-col" style={{ gap: 'var(--s-2)' }}>
              <span style={{ fontSize: 'var(--t-sm)', fontWeight: 500, color: 'var(--muted)' }}>
                ETA
              </span>
              <input
                className="ds-input"
                defaultValue="25:00"
                style={{
                  borderColor: 'var(--danger)',
                  boxShadow: '0 0 0 3px color-mix(in oklch, var(--danger) 22%, transparent)',
                }}
              />
              <span style={{ color: 'var(--danger)', fontSize: 'var(--t-xs)' }}>
                Enter a valid 24-hour time (HH:MM).
              </span>
            </label>
            <label className="flex flex-col md:col-span-2" style={{ gap: 'var(--s-2)' }}>
              <span style={{ fontSize: 'var(--t-sm)', fontWeight: 500, color: 'var(--muted)' }}>
                Notes
              </span>
              <textarea
                className="ds-textarea"
                rows={3}
                placeholder="Anything the receiving team should know…"
              />
            </label>
          </div>
          <div
            className="flex flex-wrap justify-end"
            style={{ marginTop: 'var(--s-6)', gap: 'var(--s-3)' }}
          >
            <GhostButton>Cancel</GhostButton>
            <PrimaryButton>Create shipment</PrimaryButton>
          </div>
        </Surface>
      </Section>
    </div>
  );
}
