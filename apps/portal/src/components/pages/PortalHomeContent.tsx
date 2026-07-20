'use client';

import { GhostButton, Pill, PrimaryButton, Surface } from '@/components/ui/primitives';
import {
  PortalStatGrid,
  PortalTilePane,
  PortalWorkspace,
} from '@/components/layout/PortalWorkspace';
import { usePortalView } from '@/components/providers/PortalViewProvider';

const SHIPMENTS = [
  { id: 'SH-4821', origin: 'North Bay Hub', dock: 'Dock 3', status: ['On time', 'var(--success)'], pallets: '24', eta: '14:20' },
  { id: 'SH-4822', origin: 'Portland DC', dock: 'Dock 1', status: ['Delayed', 'var(--warn)'], pallets: '18', eta: '15:05' },
  { id: 'SH-4823', origin: 'Reno Cross-dock', dock: '—', status: ['Queued', 'var(--faint)'], pallets: '31', eta: '16:40' },
  { id: 'SH-4824', origin: 'North Bay Hub', dock: 'Dock 7', status: ['On time', 'var(--success)'], pallets: '12', eta: '17:10' },
  { id: 'SH-4825', origin: 'Sparks Yard', dock: 'Dock 2', status: ['Exception', 'var(--danger)'], pallets: '9', eta: '—' },
];

const SECTION_TITLE: Record<string, string> = {
  overview: 'Overview',
  shipments: 'Shipments',
  'new-shipment': 'New shipment',
};

export function PortalHomeContent() {
  const { activeSection, openDetail, setActiveSection } = usePortalView();
  const title = SECTION_TITLE[activeSection] ?? 'Overview';

  return (
    <PortalWorkspace
      eyebrow="Portal · Dashboard"
      title={title}
      actions={
        activeSection === 'shipments' ? (
          <>
            <GhostButton>Export</GhostButton>
            <PrimaryButton>New shipment</PrimaryButton>
          </>
        ) : activeSection === 'overview' ? (
          <PrimaryButton>New shipment</PrimaryButton>
        ) : undefined
      }
    >
      {activeSection === 'overview' && (
        <PortalTilePane>
          <div className="flex h-full min-h-0 flex-col gap-4">
            <PortalStatGrid
              items={[
                { label: 'On time', value: '38', hint: 'Today' },
                { label: 'In dock', value: '12' },
                { label: 'Exceptions', value: '3', hint: 'Needs attention' },
                { label: 'Queued', value: '9' },
              ]}
            />
            <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-2">
              <Surface style={{ padding: 'var(--s-4)', minHeight: 0 }}>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>
                    Live board
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveSection('shipments')}
                    className="ds-mono"
                    style={{
                      fontSize: 'var(--t-xs)',
                      color: 'var(--accent)',
                      background: 'none',
                      border: 0,
                      cursor: 'pointer',
                    }}
                  >
                    Open shipments →
                  </button>
                </div>
                <div className="flex flex-col gap-2">
                  {SHIPMENTS.slice(0, 4).map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() =>
                        openDetail({
                          id: r.id,
                          title: r.origin,
                          subtitle: `${r.dock} · ETA ${r.eta}`,
                          body: (
                            <ShipmentDetail shipment={r} />
                          ),
                        })
                      }
                      className="flex w-full items-center justify-between gap-3 text-left"
                      style={{
                        padding: '0.65rem 0.75rem',
                        borderRadius: 10,
                        border: '1px solid var(--border)',
                        background: 'var(--bg)',
                        cursor: 'pointer',
                      }}
                    >
                      <span>
                        <span className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--faint)' }}>
                          {r.id}
                        </span>
                        <span className="block" style={{ fontSize: 'var(--t-sm)', fontWeight: 600 }}>
                          {r.origin}
                        </span>
                      </span>
                      <Pill color={r.status[1]}>● {r.status[0]}</Pill>
                    </button>
                  ))}
                </div>
              </Surface>
              <Surface style={{ padding: 'var(--s-4)' }}>
                <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>
                  Quick create
                </p>
                <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', marginTop: 8 }}>
                  Start a shipment without leaving the board. Full form lives in the sidebar view.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <PrimaryButton>New shipment</PrimaryButton>
                  <GhostButton>Invite operator</GhostButton>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveSection('new-shipment')}
                  className="ds-mono mt-4"
                  style={{
                    fontSize: 'var(--t-xs)',
                    color: 'var(--accent)',
                    background: 'none',
                    border: 0,
                    cursor: 'pointer',
                  }}
                >
                  Open full form →
                </button>
              </Surface>
            </div>
          </div>
        </PortalTilePane>
      )}

      {activeSection === 'shipments' && (
        <PortalTilePane>
          <div
            style={{
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              overflow: 'hidden',
              background: 'var(--bg-2)',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              className="flex shrink-0 flex-wrap items-center"
              style={{
                gap: 'var(--s-3)',
                padding: 'var(--s-3) var(--s-4)',
                borderBottom: '1px solid var(--border)',
              }}
            >
              <input
                className="ds-input"
                placeholder="Filter shipments…"
                style={{ flex: 1, minWidth: 160, background: 'var(--bg)' }}
              />
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
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
                    <tr
                      key={r.id}
                      onClick={() =>
                        openDetail({
                          id: r.id,
                          title: r.origin,
                          subtitle: `${r.dock} · ETA ${r.eta}`,
                          body: <ShipmentDetail shipment={r} />,
                        })
                      }
                      style={{ cursor: 'pointer' }}
                    >
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
        </PortalTilePane>
      )}

      {activeSection === 'new-shipment' && (
        <PortalTilePane>
          <Surface style={{ padding: 'var(--s-5)', maxWidth: 720 }}>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex flex-col" style={{ gap: 'var(--s-2)' }}>
                <span style={{ fontSize: 'var(--t-sm)', fontWeight: 500, color: 'var(--muted)' }}>
                  Shipment ID
                </span>
                <input className="ds-input" value="SH-4826" readOnly />
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
                <input className="ds-input" defaultValue="24" />
              </label>
              <label className="flex flex-col" style={{ gap: 'var(--s-2)' }}>
                <span style={{ fontSize: 'var(--t-sm)', fontWeight: 500, color: 'var(--muted)' }}>
                  ETA
                </span>
                <input className="ds-input" defaultValue="15:00" />
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
            <div className="mt-5 flex justify-end gap-2">
              <GhostButton>Cancel</GhostButton>
              <PrimaryButton>Create shipment</PrimaryButton>
            </div>
          </Surface>
        </PortalTilePane>
      )}
    </PortalWorkspace>
  );
}

function ShipmentDetail({
  shipment,
}: {
  shipment: (typeof SHIPMENTS)[number];
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        {[
          ['Status', shipment.status[0]],
          ['Dock', shipment.dock],
          ['Pallets', shipment.pallets],
          ['ETA', shipment.eta],
        ].map(([k, v]) => (
          <div key={k}>
            <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--faint)' }}>
              {k}
            </p>
            <p style={{ fontSize: 'var(--t-sm)', fontWeight: 600, marginTop: 2 }}>{v}</p>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>
        Select a row to inspect without leaving the board. Actions stay in this panel.
      </p>
      <div className="flex flex-wrap gap-2">
        <PrimaryButton>Assign dock</PrimaryButton>
        <GhostButton>Message yard</GhostButton>
      </div>
    </div>
  );
}
