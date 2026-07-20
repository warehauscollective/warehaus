'use client';

import { Pill, Surface } from '@/components/ui/primitives';
import {
  PortalStatGrid,
  PortalTilePane,
  PortalWorkspace,
} from '@/components/layout/PortalWorkspace';
import { usePortalView } from '@/components/providers/PortalViewProvider';

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

const SECTION_TITLE: Record<string, string> = {
  overview: 'Activity',
  feed: 'Today',
  exceptions: 'Exceptions',
};

export function ActivityContent() {
  const { activeSection, openDetail } = usePortalView();
  const title = SECTION_TITLE[activeSection] ?? 'Activity';

  return (
    <PortalWorkspace eyebrow="Portal · Activity" title={title}>
      {activeSection === 'overview' && (
        <PortalTilePane>
          <div className="flex h-full min-h-0 flex-col gap-4">
            <PortalStatGrid
              items={[
                { label: 'Events', value: String(FEED.length), hint: 'Today' },
                { label: 'Open', value: '2', hint: 'Exceptions' },
                { label: 'Watching', value: '1' },
              ]}
            />
            <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-2">
              <Surface style={{ padding: 'var(--s-4)', minHeight: 0 }}>
                <p className="ds-mono mb-3" style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>
                  Latest
                </p>
                <div className="flex flex-col gap-2">
                  {FEED.slice(0, 3).map((item) => (
                    <button
                      key={item.t + item.h}
                      type="button"
                      onClick={() =>
                        openDetail({
                          id: item.t,
                          title: item.h,
                          subtitle: item.p,
                          body: (
                            <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>
                              Event at {item.t}. Use the Exceptions view for items that need action.
                            </p>
                          ),
                        })
                      }
                      className="flex w-full gap-3 text-left"
                      style={{
                        padding: '0.55rem 0.65rem',
                        borderRadius: 10,
                        border: '1px solid var(--border)',
                        background: 'var(--bg)',
                      }}
                    >
                      <span
                        className="ds-mono"
                        style={{ fontSize: 'var(--t-xs)', color: 'var(--faint)', minWidth: '3rem' }}
                      >
                        {item.t}
                      </span>
                      <span>
                        <span className="flex items-center gap-2">
                          <span
                            style={{
                              width: 7,
                              height: 7,
                              borderRadius: 999,
                              background: item.tone,
                            }}
                          />
                          <span style={{ fontSize: 'var(--t-sm)', fontWeight: 600 }}>{item.h}</span>
                        </span>
                        <span
                          className="block"
                          style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)', marginTop: 2 }}
                        >
                          {item.p}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </Surface>
              <Surface style={{ padding: 'var(--s-4)' }}>
                <p className="ds-mono mb-3" style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>
                  Needs attention
                </p>
                <div className="flex flex-col gap-2">
                  {EXCEPTIONS.map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() =>
                        openDetail({
                          id: e.id,
                          title: e.h,
                          subtitle: e.p,
                          body: (
                            <div className="flex flex-col gap-3">
                              <Pill color={e.status === 'Open' ? 'var(--danger)' : 'var(--warn)'}>
                                {e.status}
                              </Pill>
                              <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>
                                Resolve from the inspector — keep the feed above the fold.
                              </p>
                            </div>
                          ),
                        })
                      }
                      className="flex w-full items-center justify-between gap-2 text-left"
                      style={{
                        padding: '0.55rem 0.65rem',
                        borderRadius: 10,
                        border: '1px solid var(--border)',
                        background: 'var(--bg)',
                      }}
                    >
                      <span>
                        <span className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--faint)' }}>
                          {e.id}
                        </span>
                        <span className="block" style={{ fontSize: 'var(--t-sm)', fontWeight: 600 }}>
                          {e.h}
                        </span>
                      </span>
                      <Pill color={e.status === 'Open' ? 'var(--danger)' : 'var(--warn)'}>
                        {e.status}
                      </Pill>
                    </button>
                  ))}
                </div>
              </Surface>
            </div>
          </div>
        </PortalTilePane>
      )}

      {activeSection === 'feed' && (
        <PortalTilePane>
          <div className="flex flex-col gap-2">
            {FEED.map((item) => (
              <Surface key={item.t + item.h} style={{ padding: 'var(--s-4)' }}>
                <div className="flex gap-4">
                  <span
                    className="ds-mono"
                    style={{ fontSize: 'var(--t-xs)', color: 'var(--faint)', minWidth: '3.5rem' }}
                  >
                    {item.t}
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 999,
                          background: item.tone,
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
        </PortalTilePane>
      )}

      {activeSection === 'exceptions' && (
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
                    <tr
                      key={e.id}
                      onClick={() =>
                        openDetail({
                          id: e.id,
                          title: e.h,
                          subtitle: e.p,
                          body: (
                            <Pill color={e.status === 'Open' ? 'var(--danger)' : 'var(--warn)'}>
                              {e.status}
                            </Pill>
                          ),
                        })
                      }
                      style={{ cursor: 'pointer' }}
                    >
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
          </div>
        </PortalTilePane>
      )}
    </PortalWorkspace>
  );
}
