import { Eyebrow, GhostButton, PrimaryButton, Section, Surface } from '@/components/ui/primitives';

const TEAM = [
  { name: 'Peter Roquemore', role: 'Admin', email: 'peter@warehaus.co' },
  { name: 'M. Chen', role: 'Operator', email: 'm.chen@northbay.co' },
  { name: 'A. Okonkwo', role: 'Operator', email: 'a.okonkwo@northbay.co' },
];

export function AccountContent() {
  return (
    <div style={{ maxWidth: 'var(--maxw)' }}>
      <Section id="overview" style={{ paddingTop: 'clamp(3rem, 2rem + 5vw, 5rem)' }}>
        <Eyebrow>Portal · Account</Eyebrow>
        <h1
          className="type-display"
          style={{ fontSize: 'var(--t-3xl)', marginTop: 'var(--s-4)', maxWidth: '14ch' }}
        >
          Account
        </h1>
        <p className="ds-lead" style={{ marginTop: 'var(--s-5)' }}>
          Profile, team, and preferences. Auth will gate this surface — the shell is ready first.
        </p>
      </Section>

      <Section id="profile">
        <Eyebrow>Profile</Eyebrow>
        <h2 className="type-heading" style={{ fontSize: 'var(--t-2xl)', marginTop: 'var(--s-3)' }}>
          Your details
        </h2>
        <Surface style={{ marginTop: 'var(--s-6)' }}>
          <div className="grid gap-5 md:grid-cols-2">
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
          <div className="flex justify-end" style={{ marginTop: 'var(--s-6)', gap: 'var(--s-3)' }}>
            <GhostButton>Discard</GhostButton>
            <PrimaryButton>Save profile</PrimaryButton>
          </div>
        </Surface>
      </Section>

      <Section id="team">
        <Eyebrow>Team</Eyebrow>
        <h2 className="type-heading" style={{ fontSize: 'var(--t-2xl)', marginTop: 'var(--s-3)' }}>
          People
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
                <th>Name</th>
                <th>Role</th>
                <th>Email</th>
              </tr>
            </thead>
            <tbody>
              {TEAM.map((m) => (
                <tr key={m.email}>
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
      </Section>

      <Section id="preferences">
        <Eyebrow>Preferences</Eyebrow>
        <h2 className="type-heading" style={{ fontSize: 'var(--t-2xl)', marginTop: 'var(--s-3)' }}>
          Workspace
        </h2>
        <Surface style={{ marginTop: 'var(--s-6)' }}>
          <label className="flex flex-col" style={{ gap: 'var(--s-2)' }}>
            <span style={{ fontSize: 'var(--t-sm)', fontWeight: 500, color: 'var(--muted)' }}>
              Default location
            </span>
            <input className="ds-input" defaultValue="North Bay Hub" />
          </label>
          <label className="flex flex-col" style={{ gap: 'var(--s-2)', marginTop: 'var(--s-5)' }}>
            <span style={{ fontSize: 'var(--t-sm)', fontWeight: 500, color: 'var(--muted)' }}>
              Density
            </span>
            <input className="ds-input" defaultValue="Comfortable" />
            <span style={{ fontSize: 'var(--t-xs)', color: 'var(--faint)' }}>
              Compact mode lands with the data-table controls.
            </span>
          </label>
          <div className="flex justify-end" style={{ marginTop: 'var(--s-6)' }}>
            <PrimaryButton>Save preferences</PrimaryButton>
          </div>
        </Surface>
      </Section>
    </div>
  );
}
