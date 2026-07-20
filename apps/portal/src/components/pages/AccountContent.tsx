'use client';

import { GhostButton, PrimaryButton, Surface } from '@/components/ui/primitives';
import {
  PortalStatGrid,
  PortalTilePane,
  PortalWorkspace,
} from '@/components/layout/PortalWorkspace';
import { usePortalView } from '@/components/providers/PortalViewProvider';

const TEAM = [
  { name: 'Peter Roquemore', role: 'Admin', email: 'peter@warehaus.co' },
  { name: 'M. Chen', role: 'Operator', email: 'm.chen@northbay.co' },
  { name: 'A. Okonkwo', role: 'Operator', email: 'a.okonkwo@northbay.co' },
];

const SECTION_TITLE: Record<string, string> = {
  overview: 'Account',
  profile: 'Profile',
  team: 'Team',
  preferences: 'Preferences',
};

export function AccountContent() {
  const { activeSection, openDetail } = usePortalView();
  const title = SECTION_TITLE[activeSection] ?? 'Account';

  return (
    <PortalWorkspace eyebrow="Portal · Account" title={title}>
      {activeSection === 'overview' && (
        <PortalTilePane>
          <div className="flex h-full min-h-0 flex-col gap-4">
            <PortalStatGrid
              items={[
                { label: 'Role', value: 'Admin' },
                { label: 'Team', value: String(TEAM.length) },
                { label: 'Location', value: 'North Bay' },
              ]}
            />
            <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-2">
              <Surface style={{ padding: 'var(--s-5)' }}>
                <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>
                  Signed in
                </p>
                <h3 style={{ fontSize: 'var(--t-md)', fontWeight: 600, marginTop: 8 }}>
                  Peter Roquemore
                </h3>
                <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', marginTop: 4 }}>
                  peter@warehaus.co
                </p>
              </Surface>
              <Surface style={{ padding: 'var(--s-5)' }}>
                <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>
                  Team snapshot
                </p>
                <div className="mt-3 flex flex-col gap-2">
                  {TEAM.map((m) => (
                    <button
                      key={m.email}
                      type="button"
                      onClick={() =>
                        openDetail({
                          id: m.email,
                          title: m.name,
                          subtitle: m.role,
                          body: (
                            <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>
                              {m.email}
                            </p>
                          ),
                        })
                      }
                      className="flex w-full items-center justify-between text-left"
                      style={{
                        padding: '0.45rem 0',
                        borderBottom: '1px solid var(--border)',
                        background: 'none',
                        borderLeft: 0,
                        borderRight: 0,
                        borderTop: 0,
                        cursor: 'pointer',
                      }}
                    >
                      <span style={{ fontSize: 'var(--t-sm)', fontWeight: 600 }}>{m.name}</span>
                      <span style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>{m.role}</span>
                    </button>
                  ))}
                </div>
              </Surface>
            </div>
          </div>
        </PortalTilePane>
      )}

      {activeSection === 'profile' && (
        <PortalTilePane>
          <Surface style={{ padding: 'var(--s-5)', maxWidth: 640 }}>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex flex-col" style={{ gap: 'var(--s-2)' }}>
                <span style={{ fontSize: 'var(--t-sm)', fontWeight: 500, color: 'var(--muted)' }}>
                  Display name
                </span>
                <input className="ds-input" defaultValue="Peter Roquemore" />
              </label>
              <label className="flex flex-col" style={{ gap: 'var(--s-2)' }}>
                <span style={{ fontSize: 'var(--t-sm)', fontWeight: 500, color: 'var(--muted)' }}>
                  Email
                </span>
                <input className="ds-input" defaultValue="peter@warehaus.co" />
              </label>
              <label className="flex flex-col md:col-span-2" style={{ gap: 'var(--s-2)' }}>
                <span style={{ fontSize: 'var(--t-sm)', fontWeight: 500, color: 'var(--muted)' }}>
                  Role
                </span>
                <input className="ds-input" value="Admin" readOnly />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <GhostButton>Discard</GhostButton>
              <PrimaryButton>Save profile</PrimaryButton>
            </div>
          </Surface>
        </PortalTilePane>
      )}

      {activeSection === 'team' && (
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
                    <th>Name</th>
                    <th>Role</th>
                    <th>Email</th>
                  </tr>
                </thead>
                <tbody>
                  {TEAM.map((m) => (
                    <tr
                      key={m.email}
                      onClick={() =>
                        openDetail({
                          id: m.email,
                          title: m.name,
                          subtitle: m.role,
                          body: (
                            <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>
                              {m.email}
                            </p>
                          ),
                        })
                      }
                      style={{ cursor: 'pointer' }}
                    >
                      <td>{m.name}</td>
                      <td>{m.role}</td>
                      <td className="ds-mono" style={{ fontSize: 'var(--t-sm)' }}>
                        {m.email}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </PortalTilePane>
      )}

      {activeSection === 'preferences' && (
        <PortalTilePane>
          <Surface style={{ padding: 'var(--s-5)', maxWidth: 560 }}>
            <label className="flex flex-col" style={{ gap: 'var(--s-2)' }}>
              <span style={{ fontSize: 'var(--t-sm)', fontWeight: 500, color: 'var(--muted)' }}>
                Default location
              </span>
              <input className="ds-input" defaultValue="North Bay Hub" />
            </label>
            <label className="flex flex-col" style={{ gap: 'var(--s-2)', marginTop: 'var(--s-4)' }}>
              <span style={{ fontSize: 'var(--t-sm)', fontWeight: 500, color: 'var(--muted)' }}>
                Density
              </span>
              <input className="ds-input" defaultValue="Comfortable" />
            </label>
            <div className="mt-5 flex justify-end">
              <PrimaryButton>Save preferences</PrimaryButton>
            </div>
          </Surface>
        </PortalTilePane>
      )}
    </PortalWorkspace>
  );
}
