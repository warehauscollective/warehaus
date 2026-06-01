'use client';

import type { CSSProperties } from 'react';
import { Menu, MessageCircle } from 'lucide-react';
import { Bevel } from '@/components/react/ui/Bevel';
import { ROUTE_TAB_SETS } from '@/lib/data/navTabs';
import { BevelController } from './BevelController';
import { Card, DsButton, Eyebrow, Pill, Section, SectionHead, Wrap } from './_shared';

// Maps a tab's Tailwind accent class to a swatch color for the docs.
const TAB_DOT: Record<string, string> = {
  'text-dream': 'var(--dream-primary)',
  'text-design': 'var(--design-primary)',
  'text-develop': 'var(--develop-primary)',
  'text-accent': 'var(--accent)',
};

// Tabs shown in the nav-dock specimen (PORTAL active). The real component is
// route-aware: Dream/Design/Develop on the marketing site, Brand/Website/Portal here.
const NAV_TABS = ['BRAND', 'WEBSITE', 'PORTAL'];

/**
 * Presentational replica of the live BottomNav (src/components/layout/BottomNav.tsx)
 * — the single floating navigation dock used across the website and the portal.
 * Static (no measurement) so it can sit inside a doc surface, but it mirrors the
 * real component's markup, tokens, and geometry exactly.
 */
function NavDockDemo({ active = 2 }: { active?: number }) {
  const btn: CSSProperties = {
    background: 'var(--nav-bg)',
    borderColor: 'var(--nav-border)',
    borderWidth: 1,
    color: 'var(--nav-text)',
  };
  return (
    <div className="flex items-center justify-center gap-2">
      {/* Menu button */}
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl backdrop-blur-2xl" style={btn}>
        <Menu className="w-5 h-5" />
      </div>

      {/* Tab slider */}
      <div
        className="relative flex flex-col items-center rounded-2xl backdrop-blur-2xl p-[3px]"
        style={{ background: 'var(--nav-bg)', borderColor: 'var(--nav-border)', borderWidth: 1, minWidth: 320 }}
      >
        {/* Floating indicators above tabs */}
        <div className="absolute -top-3 left-0 right-0 flex pointer-events-none" style={{ padding: '0 3px' }}>
          {NAV_TABS.map((t, i) => (
            <div key={t} className="flex-1 flex justify-center">
              <div
                className="h-[5px] rounded-full"
                style={{ width: i === active ? 56 : 12, background: i === active ? 'var(--nav-text-active)' : 'var(--nav-text-muted)' }}
              />
            </div>
          ))}
        </div>
        {/* Tab buttons row with sliding pill */}
        <div className="relative flex items-stretch w-full">
          <div
            className="absolute top-0 bottom-0 rounded-xl pointer-events-none"
            style={{ left: `calc(${active} * (100% / 3))`, width: 'calc(100% / 3)', background: 'var(--nav-pill-bg)', borderColor: 'var(--nav-pill-border)', borderWidth: 1 }}
          />
          {NAV_TABS.map((t, i) => (
            <div
              key={t}
              className="relative z-10 flex-1 text-center py-3 text-xs tracking-widest rounded-xl"
              style={{ minWidth: 100, fontFamily: 'var(--font-display)', fontWeight: 700, color: i === active ? 'var(--nav-text-active)' : 'var(--nav-text-muted)' }}
            >
              {t}
            </div>
          ))}
        </div>
      </div>

      {/* Chat button — tinted to the active surface accent */}
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl backdrop-blur-2xl" style={{ ...btn, color: 'var(--accent)' }}>
        <MessageCircle className="w-5 h-5" />
      </div>
    </div>
  );
}

const TABLE_ROWS = [
  { id: 'SH-4821', origin: 'North Bay Hub', dock: 'Dock 3', status: ['On time', 'var(--success)'], pallets: '24', eta: '14:20' },
  { id: 'SH-4822', origin: 'Portland DC', dock: 'Dock 1', status: ['Delayed', 'var(--warn)'], pallets: '18', eta: '15:05' },
  { id: 'SH-4823', origin: 'Reno Cross-dock', dock: '—', status: ['Queued', 'var(--faint)'], pallets: '31', eta: '16:40' },
  { id: 'SH-4824', origin: 'North Bay Hub', dock: 'Dock 7', status: ['On time', 'var(--success)'], pallets: '12', eta: '17:10' },
  { id: 'SH-4825', origin: 'Sparks Yard', dock: 'Dock 2', status: ['Exception', 'var(--danger)'], pallets: '9', eta: '—' },
];

const FLOW_CREATE = [
  { n: '01', h: 'Start', p: 'Operator hits “New shipment” from the overview. Form opens with an auto-generated ID.', done: false },
  { n: '02', h: 'Fill', p: 'Origin, pallet count, ETA. Fields validate on blur; capacity is checked live against the chosen dock.', done: false },
  { n: '03', h: 'Confirm', p: 'A summary surface with the cut. Primary action is the only accent. Edit returns to step 2 in place.', done: false },
  { n: '04', h: 'Done', p: 'Success state, then the new row animates into the shipments table. One undo toast for 8 seconds.', done: true },
];

const FLOW_ONBOARD = [
  { n: '01', h: 'Connect a location', p: 'Empty portal asks for the first warehouse. One field, one action — nothing else on screen.' },
  { n: '02', h: 'Invite the team', p: 'Optional, skippable. Roles preset to Operator; admin can change later in Settings.' },
  { n: '03', h: 'First shipment', p: 'Drops the operator straight into the create-shipment flow above. Onboarding ends inside real work.' },
];

export function PortalPanel() {
  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      {/* ──── Hero ──── */}
      <Section id="portal-hero" pad={false} style={{ paddingBlock: 'clamp(3.5rem, 2rem + 8vw, 7rem)' }}>
        <Wrap>
          <Eyebrow>03 / Portal</Eyebrow>
          <h1 className="font-display" style={{ fontSize: 'var(--t-3xl)', lineHeight: 'var(--lh-tight)', letterSpacing: 'var(--ls-display)', maxWidth: '20ch', marginTop: 'var(--s-4)' }}>
            Where the work actually happens.
          </h1>
          <p className="ds-lead" style={{ marginTop: 'var(--s-5)', maxWidth: '62ch' }}>
            Behind the login, the rules change. The portal trades marketing air for information density — an app shell that frames everything, data tables and forms tuned for repetition, and the user flows that carry an operator from empty state to done.
          </p>
          <div className="flex flex-wrap gap-2" style={{ marginTop: 'var(--s-6)' }}>
            {['App Shell', 'Data & Forms', 'Flows'].map((t) => <Pill key={t}>{t}</Pill>)}
          </div>
        </Wrap>
      </Section>

      {/* ──── App Shell — the navigation dock ──── */}
      <Section id="portal-shell">
        <Wrap>
          <Eyebrow>Portal · App Shell</Eyebrow>
          <h2 className="font-display" style={{ fontSize: 'var(--t-2xl)', marginTop: 'var(--s-3)' }}>One nav, every surface</h2>
          <p className="ds-lead" style={{ marginTop: 'var(--s-4)', maxWidth: '66ch' }}>
            Warehaus doesn’t bolt a separate chrome onto the logged-in product. The same floating dock — a menu button, a sliding tab switcher, and the chat button — persists across the marketing website <em>and</em> the portal. It is the single navigation component and the source of truth for both; only its tab set changes per surface.
          </p>
          <p className="ds-mono" style={{ marginTop: 'var(--s-4)', fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>
            Component · src/components/layout/BottomNav.tsx
          </p>

          {/* Live-styled replica of the real navigation dock */}
          <Bevel
            corners="br"
            cut={2.5}
            shoulder={0.875}
            fill="var(--bg-2)"
            stroke="var(--border)"
            style={{ marginTop: 'var(--s-6)', minHeight: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'clamp(1.25rem, 4vw, var(--s-7))' }}
          >
            {/* Scrolls horizontally on narrow screens so the specimen keeps its true size */}
            <div style={{ maxWidth: '100%', overflowX: 'auto', display: 'flex', justifyContent: 'center', padding: '0.75rem 2px' }}>
              <NavDockDemo active={2} />
            </div>
          </Bevel>

          {/* Anatomy — the three controls */}
          <div style={{ marginTop: 'var(--s-7)' }}>
            <SectionHead title="Anatomy" pill="menu · tabs · chat" />
            <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))' }}>
              {[
                { n: '01 · Menu', h: 'Full navigation', p: 'A 44px button that opens the menu overlay — every route, grouped. The hamburger crossfades and rotates into a close icon while open.' },
                { n: '02 · Tabs', h: 'Sliding switcher', p: 'Three route-aware tabs in a pill. The active pill slides 300ms and the indicator bar above it morphs from a dot to a 56px bar.' },
                { n: '03 · Chat', h: 'Assistant, anywhere', p: 'A 44px button that opens the chat overlay from any screen. Its icon tints to the active surface’s accent and swaps to a chevron when open.' },
              ].map((a) => (
                <div key={a.n}>
                  <span className="ds-mono" style={{ color: 'var(--accent)', fontSize: 'var(--t-xs)' }}>{a.n}</span>
                  <h3 style={{ fontSize: 'var(--t-md)', fontWeight: 600, marginTop: 4 }}>{a.h}</h3>
                  <p style={{ color: 'var(--muted)', fontSize: 'var(--t-sm)', marginTop: 2 }}>{a.p}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Route-aware tab sets — driven straight from navTabs.ts */}
          <div style={{ marginTop: 'var(--s-7)' }}>
            <SectionHead title="Route-aware tabs" pill="up to 6 per route" />
            <p className="ds-lead" style={{ maxWidth: '64ch', marginBottom: 'var(--s-5)' }}>
              The same dock adapts its tabs to the current route while the page’s main content stays mounted. Each route defines its own set of up to six tabs in <code className="ds-mono">navTabs.ts</code> — these are the surfaces wired today:
            </p>
            <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))' }}>
              {ROUTE_TAB_SETS.map((r) => (
                <Card key={r.path} cut={1.75} shoulder={0.625}>
                  <div className="flex items-baseline justify-between gap-3 flex-wrap">
                    <Eyebrow>{r.routeLabel}</Eyebrow>
                    <span className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--faint)' }}>{r.path}</span>
                  </div>
                  <div className="flex flex-wrap" style={{ gap: 'var(--s-2)', marginTop: 'var(--s-4)' }}>
                    {r.tabs.map((t) => (
                      <span key={`${r.path}-${t.value}`} className="ds-pill">
                        <span style={{ width: 7, height: 7, borderRadius: 999, background: TAB_DOT[t.colorClass] ?? 'var(--accent)', flex: 'none' }} />
                        {t.label}
                      </span>
                    ))}
                  </div>
                  <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--faint)', marginTop: 'var(--s-4)' }}>
                    {r.tabs.length} tab{r.tabs.length === 1 ? '' : 's'}
                  </p>
                </Card>
              ))}
            </div>
          </div>

          <Card cut={2.75} shoulder={1} style={{ marginTop: 'var(--s-7)' }}>
            <Eyebrow>Behavior</Eyebrow>
            <div className="grid gap-4 md:grid-cols-2" style={{ marginTop: 'var(--s-4)', color: 'var(--muted)' }}>
              <ul style={{ paddingLeft: '1.1rem', lineHeight: 1.9 }}>
                <li>Fixed bottom-center, floating above content with a 40px backdrop blur.</li>
                <li>Theme-aware through the <code className="ds-mono">--nav-*</code> tokens — background, border, text, and pill all invert with light/dark.</li>
                <li>Menu and chat are 44px <code className="ds-mono">rounded-2xl</code> buttons; tabs sit in a matching pill.</li>
              </ul>
              <ul style={{ paddingLeft: '1.1rem', lineHeight: 1.9 }}>
                <li>The active pill and indicator animate at 300ms / 200ms on tab change.</li>
                <li>The chat button carries the active tab’s accent color.</li>
                <li>On mobile the whole dock slides away when the chat overlay opens.</li>
              </ul>
            </div>
          </Card>
        </Wrap>
      </Section>

      {/* ──── Data & Forms ──── */}
      <Section id="portal-data">
        <Wrap>
          <Eyebrow>Portal · Data &amp; Forms</Eyebrow>
          <h2 className="font-display" style={{ fontSize: 'var(--t-2xl)', marginTop: 'var(--s-3)' }}>Built for repetition</h2>
          <p className="ds-lead" style={{ marginTop: 'var(--s-4)', maxWidth: '64ch' }}>
            Operators look at these surfaces hundreds of times a day. Tables are dense and scannable, numbers line up, status reads at a glance, and forms tell you the moment something’s wrong. Comfort here means speed, not space.
          </p>

          <div style={{ marginTop: 'var(--s-6)' }}>
            <SectionHead title="Data table" pill="dense · tabular · status" />
            <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
              <div className="flex items-center flex-wrap" style={{ gap: 'var(--s-3)', padding: 'var(--s-4)', borderBottom: '1px solid var(--border)', background: 'var(--bg-2)' }}>
                <input className="ds-input" placeholder="Filter shipments…" style={{ flex: 1, minWidth: 160, background: 'var(--bg)' }} />
                <div className="inline-flex" style={{ border: '1px solid var(--border)', borderRadius: 9, overflow: 'hidden' }}>
                  <button style={{ background: 'var(--accent)', border: 0, color: 'var(--accent-fg)', fontFamily: 'var(--font-body)', fontSize: 'var(--t-sm)', padding: '0.5rem 0.9rem', cursor: 'pointer' }}>Comfortable</button>
                  <button style={{ background: 'transparent', border: 0, color: 'var(--muted)', fontFamily: 'var(--font-body)', fontSize: 'var(--t-sm)', padding: '0.5rem 0.9rem', cursor: 'pointer' }}>Compact</button>
                </div>
                <DsButton variant="secondary" as="span">Export</DsButton>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="ds-data" style={{ minWidth: 560 }}>
                  <thead><tr><th>Shipment</th><th>Origin</th><th>Dock</th><th>Status</th><th className="num">Pallets</th><th className="num">ETA</th></tr></thead>
                  <tbody>
                    {TABLE_ROWS.map((r) => (
                      <tr key={r.id}>
                        <td>{r.id}</td><td>{r.origin}</td><td>{r.dock}</td>
                        <td><Pill color={r.status[1]}>● {r.status[0]}</Pill></td>
                        <td className="num">{r.pallets}</td><td className="num">{r.eta}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <p style={{ color: 'var(--muted)', marginTop: 'var(--s-4)', fontSize: 'var(--t-sm)' }}>
              Row hover, mono right-aligned numerics, hairline borders, no zebra striping. Status pills use only the three status colors.
            </p>
          </div>

          {/* Form */}
          <div style={{ marginTop: 'var(--s-7)' }}>
            <SectionHead title="Form" pill="inline validation" />
            <Card cut={2.75} shoulder={1}>
              <Eyebrow>New shipment</Eyebrow>
              <div className="grid gap-5 md:grid-cols-2" style={{ marginTop: 'var(--s-5)' }}>
                <div className="flex flex-col" style={{ gap: 'var(--s-2)' }}>
                  <label style={{ fontSize: 'var(--t-sm)', fontWeight: 500, color: 'var(--muted)' }}>Shipment ID</label>
                  <input className="ds-input" value="SH-4826" readOnly />
                  <span style={{ fontSize: 'var(--t-xs)', color: 'var(--faint)' }}>Auto-generated · read only</span>
                </div>
                <div className="flex flex-col" style={{ gap: 'var(--s-2)' }}>
                  <label style={{ fontSize: 'var(--t-sm)', fontWeight: 500, color: 'var(--muted)' }}>Origin</label>
                  <input className="ds-input" placeholder="Select a location…" />
                </div>
                <div className="flex flex-col" style={{ gap: 'var(--s-2)' }}>
                  <label style={{ fontSize: 'var(--t-sm)', fontWeight: 500, color: 'var(--muted)' }}>Pallet count</label>
                  <input className="ds-input" defaultValue="24" style={{ borderColor: 'var(--success)' }} />
                  <span style={{ fontSize: 'var(--t-xs)', color: 'var(--faint)' }}>Within dock capacity</span>
                </div>
                <div className="flex flex-col" style={{ gap: 'var(--s-2)' }}>
                  <label style={{ fontSize: 'var(--t-sm)', fontWeight: 500, color: 'var(--muted)' }}>ETA</label>
                  <input className="ds-input" defaultValue="25:00" style={{ borderColor: 'var(--danger)', boxShadow: '0 0 0 3px color-mix(in oklch, var(--danger) 22%, transparent)' }} />
                  <span style={{ color: 'var(--danger)', fontSize: 'var(--t-xs)' }}>Enter a valid 24-hour time (HH:MM).</span>
                </div>
                <div className="flex flex-col md:col-span-2" style={{ gap: 'var(--s-2)' }}>
                  <label style={{ fontSize: 'var(--t-sm)', fontWeight: 500, color: 'var(--muted)' }}>Notes</label>
                  <textarea className="ds-textarea" rows={3} placeholder="Anything the receiving team should know…" />
                </div>
              </div>
              <div className="flex flex-wrap justify-end" style={{ marginTop: 'var(--s-6)', gap: 'var(--s-3)' }}>
                <DsButton variant="ghost" as="span">Cancel</DsButton>
                <DsButton variant="primary" as="span">Create shipment</DsButton>
              </div>
            </Card>
          </div>

          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', marginTop: 'var(--s-7)' }}>
            {[
              { e: 'States', p: 'Every input has rest, focus, filled, error, and disabled. Validate on blur, not keystroke.' },
              { e: 'Numbers', p: 'Tabular figures, right-aligned in tables. Units in muted text, never inside the number.' },
              { e: 'Empty & loading', p: 'A table with no rows shows a one-line reason + a primary action, never a blank box.' },
            ].map((c) => (
              <Card key={c.e} cut={1.75} shoulder={0.625}>
                <Eyebrow>{c.e}</Eyebrow>
                <p style={{ color: 'var(--muted)', fontSize: 'var(--t-sm)', marginTop: 'var(--s-2)' }}>{c.p}</p>
              </Card>
            ))}
          </div>
        </Wrap>
      </Section>

      {/* ──── User Flows ──── */}
      <Section id="portal-flows">
        <Wrap>
          <Eyebrow>Portal · User Flows</Eyebrow>
          <h2 className="font-display" style={{ fontSize: 'var(--t-2xl)', marginTop: 'var(--s-3)' }}>From empty to done</h2>
          <p className="ds-lead" style={{ marginTop: 'var(--s-4)', maxWidth: '64ch' }}>
            A flow is more than its happy path. Each one is mapped as a sequence of screens, and every screen carries its full set of states — loading, empty, error, success — so an operator is never left staring at a blank rectangle.
          </p>

          <div style={{ marginTop: 'var(--s-6)' }}>
            <SectionHead title="Flow · Create a shipment" pill="4 steps" />
            <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}>
              {FLOW_CREATE.map((s) => (
                <Card key={s.n} cut={1.5} shoulder={0.5625}>
                  <span className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--accent)' }}>{s.n}</span>
                  <h3 style={{ fontSize: 'var(--t-md)', fontWeight: 600, marginTop: 6 }}>{s.h}</h3>
                  <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', marginTop: 6 }}>{s.p}</p>
                  <div className="flex items-center justify-center" style={{ height: 80, marginTop: 'var(--s-4)', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 999, background: s.done ? 'var(--accent)' : 'var(--surface-2)' }} />
                  </div>
                </Card>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 'var(--s-7)' }}>
            <SectionHead title="Flow · First-run onboarding" pill="3 steps" />
            <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' }}>
              {FLOW_ONBOARD.map((s) => (
                <Card key={s.n} cut={1.5} shoulder={0.5625}>
                  <span className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--accent)' }}>{s.n}</span>
                  <h3 style={{ fontSize: 'var(--t-md)', fontWeight: 600, marginTop: 6 }}>{s.h}</h3>
                  <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', marginTop: 6 }}>{s.p}</p>
                </Card>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 'var(--s-7)' }}>
            <SectionHead title="The four states" pill="every screen, no exceptions" />
            <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}>
              <Card cut={1.75} shoulder={0.625} style={{ minHeight: 170, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 'var(--s-3)' }}>
                <span style={{ width: 34, height: 34, borderRadius: 9, border: '2px solid var(--border-2)', borderTopColor: 'var(--accent)', animation: 'spin 0.9s linear infinite' }} />
                <span style={{ fontWeight: 600 }}>Loading</span>
                <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>Skeleton rows, never a spinner alone on data screens.</p>
              </Card>
              <Card cut={1.75} shoulder={0.625} style={{ minHeight: 170, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 'var(--s-3)' }}>
                <span style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--surface-2)' }} />
                <span style={{ fontWeight: 600 }}>Empty</span>
                <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>One-line reason + a primary action. Explain, then offer the fix.</p>
              </Card>
              <Card cut={1.75} shoulder={0.625} style={{ minHeight: 170, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 'var(--s-3)' }}>
                <span className="grid place-items-center" style={{ width: 34, height: 34, borderRadius: 9, background: 'color-mix(in oklch, var(--danger) 22%, transparent)', color: 'var(--danger)', fontWeight: 700 }}>!</span>
                <span style={{ fontWeight: 600 }}>Error</span>
                <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>What failed, in plain words, and a retry. No codes the operator can’t act on.</p>
              </Card>
              <Card cut={1.75} shoulder={0.625} style={{ minHeight: 170, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 'var(--s-3)' }}>
                <span className="grid place-items-center" style={{ width: 34, height: 34, borderRadius: 9, background: 'color-mix(in oklch, var(--success) 22%, transparent)', color: 'var(--success)', fontWeight: 700 }}>✓</span>
                <span style={{ fontWeight: 600 }}>Success</span>
                <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>Brief confirmation, then return to the work — with an undo where it matters.</p>
              </Card>
            </div>
          </div>

          <Card cut={2.75} shoulder={1} style={{ marginTop: 'var(--s-7)' }}>
            <Eyebrow>Flow principles</Eyebrow>
            <ul style={{ color: 'var(--muted)', marginTop: 'var(--s-4)', paddingLeft: '1.1rem', lineHeight: 1.9 }}>
              <li>End every flow inside real work, not on a congratulations screen.</li>
              <li>One primary action per step — the accent points at it and nothing else.</li>
              <li>Make every step reversible; pair destructive actions with an undo where possible.</li>
              <li>Design the empty and error states first — they’re what new and unlucky users actually see.</li>
            </ul>
          </Card>

        </Wrap>
      </Section>

      {/* ──── Chamfer System ──── */}
      <Section id="portal-chamfer">
        <Wrap>
          <Eyebrow>System</Eyebrow>
          <h2 className="font-display" style={{ fontSize: 'var(--t-2xl)', marginTop: 'var(--s-3)' }}>The chamfer system</h2>
          <p className="ds-lead" style={{ marginTop: 'var(--s-4)', maxWidth: '66ch' }}>
            Every beveled surface in Warehaus is one component — <code className="ds-mono">&lt;Bevel&gt;</code>. It paints the signature 45° cut as an inline SVG behind your content, sized to the element’s true pixels, so the hairline traces the cut — the move <code className="ds-mono">clip-path</code> and <code className="ds-mono">corner-shape</code> can’t do. It’s fully tweakable, per corner, and re-resolves live on a theme change.
          </p>

          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', marginTop: 'var(--s-6)' }}>
            <Card cut={1.75} shoulder={0.625}>
              <Eyebrow>01 · Rounded shoulders</Eyebrow>
              <p style={{ color: 'var(--muted)', fontSize: 'var(--t-sm)', marginTop: 'var(--s-2)' }}>
                Kept corners are quadratic curves (<code className="ds-mono">Q</code>). The cut’s two shoulders are filleted by <code className="ds-mono">shoulder</code>, so the flat face eases in and out instead of meeting at a sharp point.
              </p>
            </Card>
            <Card cut={1.75} shoulder={0.625}>
              <Eyebrow>02 · The 45° face</Eyebrow>
              <p style={{ color: 'var(--muted)', fontSize: 'var(--t-sm)', marginTop: 'var(--s-2)' }}>
                The cut itself is a straight line (<code className="ds-mono">L</code>) across the corner. <code className="ds-mono">cut</code> sets how deep it bites along each edge; pick any of the four corners independently.
              </p>
            </Card>
            <Card cut={1.75} shoulder={0.625}>
              <Eyebrow>03 · Painted, not clipped</Eyebrow>
              <p style={{ color: 'var(--muted)', fontSize: 'var(--t-sm)', marginTop: 'var(--s-2)' }}>
                The path is drawn as fill <em>and</em> hairline stroke at the element’s real size, so the border follows the cut. Fills use live tokens, so light/dark re-resolves with no repaint.
              </p>
            </Card>
          </div>

          <div style={{ marginTop: 'var(--s-7)' }}>
            <SectionHead title="Try it" pill="live playground" pillAccent />
            <BevelController />
          </div>

          <div className="flex" style={{ marginTop: 'var(--s-7)', gap: 'var(--s-3)' }}>
            <DsButton variant="secondary" as="span" onClick={() => document.querySelector('[data-section="portal-hero"]')?.scrollIntoView({ behavior: 'smooth' })}>Back to top</DsButton>
          </div>
        </Wrap>
      </Section>
    </div>
  );
}
