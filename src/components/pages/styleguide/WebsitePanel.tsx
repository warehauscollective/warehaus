'use client';

import { Bevel } from '@/components/react/ui/Bevel';
import { Card, DsButton, Eyebrow, Pill, Section, SectionHead, Wrap } from './_shared';

const BREAKPOINTS = [
  { name: 'Mobile', w: '360–520px', shift: 'Single column, stacked bento' },
  { name: 'Large mobile', w: '520–860px', shift: 'Bento → 2 tracks' },
  { name: 'Tablet', w: '860–1180px', shift: 'Full bento, grids expand' },
  { name: 'Laptop', w: '1180–1440px', shift: 'Container approaches max' },
  { name: 'Desktop / wide', w: '1440px+', shift: 'Container locked, gutters grow' },
];

const SPACE_SCALE = [
  { h: 8, l: 's-2 · 8' }, { h: 16, l: 's-4 · 16' }, { h: 24, l: 's-5 · 24' },
  { h: 32, l: 's-6 · 32' }, { h: 48, l: 's-7 · 48' }, { h: 64, l: 's-8 · 64' }, { h: 96, l: 's-9 · 96' },
];

const ANATOMY = [
  { name: 'Hero', meta: 'accent · most space · one headline', hero: true },
  { name: 'Features', meta: 'grid-3 · one idea each' },
  { name: 'Proof', meta: 'stats or quote · single row' },
  { name: 'Split', meta: 'grid-2 · text + visual' },
  { name: 'CTA', meta: 'accent surface · one action' },
];

function Glyph() {
  return (
    <div style={{ width: 46, height: 46, background: 'var(--accent-tint)', borderRadius: '11px 11px 16px 11px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ width: 18, height: 18, background: 'var(--accent)', borderRadius: '5px 5px 8px 5px' }} />
    </div>
  );
}

export function WebsitePanel() {
  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      {/* ──── Hero ──── */}
      <Section id="website-hero" pad={false} style={{ paddingBlock: 'clamp(3.5rem, 2rem + 8vw, 7rem)' }}>
        <Wrap>
          <Eyebrow>02 / Website</Eyebrow>
          <h1 className="font-display" style={{ fontSize: 'var(--t-3xl)', lineHeight: 'var(--lh-tight)', letterSpacing: 'var(--ls-display)', maxWidth: '18ch', marginTop: 'var(--s-4)' }}>
            The face Warehaus shows the world.
          </h1>
          <p className="ds-lead" style={{ marginTop: 'var(--s-5)', maxWidth: '62ch' }}>
            The website layer turns the brand into pages a visitor can move through — a marketing grid built on generous space, a component kit that wears the signature cut, and bento section patterns that compose into landing pages, pricing, and docs.
          </p>
          <div className="flex flex-wrap gap-2" style={{ marginTop: 'var(--s-6)' }}>
            {['Layout & Grid', 'Components', 'Sections', 'Bento'].map((t) => <Pill key={t}>{t}</Pill>)}
          </div>
        </Wrap>
      </Section>

      {/* ──── Layout & Grid ──── */}
      <Section id="website-layout">
        <Wrap>
          <Eyebrow>Website · Layout &amp; Grid</Eyebrow>
          <h2 className="font-display" style={{ fontSize: 'var(--t-2xl)', marginTop: 'var(--s-3)' }}>Space first, then grid</h2>
          <p className="ds-lead" style={{ marginTop: 'var(--s-4)', maxWidth: '64ch' }}>
            Warehaus pages are built out of air. A centered container, a 12-column grid for alignment, and a section rhythm that gives every idea room to land. The grid keeps things straight; the negative space does the design work.
          </p>

          <Card cut={3.5} shoulder={1.25} style={{ marginTop: 'var(--s-6)' }}>
            <div className="flex items-baseline justify-between gap-4 flex-wrap">
              <h3 style={{ fontSize: 'var(--t-lg)', fontWeight: 600 }}>Container</h3>
              <Pill><span className="ds-mono">--maxw 1240px</span></Pill>
            </div>
            <p style={{ color: 'var(--muted)', marginTop: 'var(--s-3)', maxWidth: '62ch' }}>
              Content lives in a centered <code className="ds-mono">.wrap</code> capped at 1240px with a fluid gutter — <code className="ds-mono">clamp(1.25rem, 0.5rem + 3vw, 3rem)</code> — so the page breathes on a phone and never sprawls on a wide monitor.
            </p>
          </Card>

          <div style={{ marginTop: 'var(--s-7)' }}>
            <SectionHead title="12-column grid" pill="alignment scaffold" />
            <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(12,1fr)' }}>
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} style={{ height: 60, background: 'var(--accent-tint)', border: '1px solid var(--border)', borderRadius: 4 }} />
              ))}
            </div>
            <p style={{ color: 'var(--muted)', marginTop: 'var(--s-4)', fontSize: 'var(--t-sm)' }}>
              Bento tiles snap to 6 tracks; marketing rows use 2, 3, or 4 equal columns. Collapse to one column under 720px.
            </p>
          </div>

          <div style={{ marginTop: 'var(--s-7)' }}>
            <SectionHead title="Breakpoints" pill="360 → 1920" />
            <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflowX: 'auto' }}>
              <table className="ds-data" style={{ minWidth: 420 }}>
                <thead><tr><th>Name</th><th>Min width</th><th>Layout shift</th></tr></thead>
                <tbody>
                  {BREAKPOINTS.map((b) => (
                    <tr key={b.name}><td>{b.name}</td><td className="ds-mono">{b.w}</td><td style={{ color: 'var(--muted)' }}>{b.shift}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ marginTop: 'var(--s-7)' }}>
            <SectionHead title="Spacing scale" pill="4px base" />
            <div className="flex flex-wrap" style={{ alignItems: 'flex-end', gap: 'var(--s-4)' }}>
              {SPACE_SCALE.map((s) => (
                <div key={s.l} className="flex flex-col items-center" style={{ gap: 6 }}>
                  <div style={{ width: 36, height: s.h, background: 'var(--accent)', borderRadius: '3px 3px 0 0' }} />
                  <span className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>{s.l}</span>
                </div>
              ))}
            </div>
            <p style={{ color: 'var(--muted)', marginTop: 'var(--s-5)', fontSize: 'var(--t-sm)' }}>
              Section rhythm is <code className="ds-mono">--section-y: clamp(4rem, 2rem + 8vw, 8rem)</code> — the negative-space backbone. When in doubt, add one step.
            </p>
          </div>

          <div style={{ marginTop: 'var(--s-7)' }}>
            <SectionHead title="Marketing page anatomy" pill="default order" />
            <div className="flex flex-col" style={{ gap: 8 }}>
              {ANATOMY.map((b) => (
                <div
                  key={b.name}
                  className="flex justify-between items-center"
                  style={{
                    border: b.hero ? 0 : '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    padding: b.hero ? 'var(--s-7) var(--s-5)' : 'var(--s-4) var(--s-5)',
                    background: b.hero ? 'var(--accent)' : 'var(--bg-2)',
                    color: b.hero ? 'var(--accent-fg)' : undefined,
                  }}
                >
                  <span className="font-display" style={{ letterSpacing: '0.03em' }}>{b.name}</span>
                  <span className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: b.hero ? 'var(--accent-fg)' : 'var(--muted)', opacity: b.hero ? 0.8 : 1 }}>{b.meta}</span>
                </div>
              ))}
            </div>
          </div>
        </Wrap>
      </Section>

      {/* ──── Components ──── */}
      <Section id="website-components">
        <Wrap>
          <Eyebrow>Library</Eyebrow>
          <h2 className="font-display" style={{ fontSize: 'var(--t-2xl)', marginTop: 'var(--s-3)' }}>Components</h2>
          <p className="ds-lead" style={{ marginTop: 'var(--s-4)', maxWidth: '64ch' }}>
            Every component wears the same edge and the same restraint. Interactive states are real — hover the buttons, focus the inputs, flip the theme.
          </p>

          <div className="grid gap-4 md:grid-cols-2" style={{ marginTop: 'var(--s-6)' }}>
            <Card>
              <h3 style={{ fontSize: 'var(--t-lg)', fontWeight: 600, marginBottom: 'var(--s-4)' }}>Buttons</h3>
              <div className="flex flex-wrap" style={{ gap: 'var(--s-3)' }}>
                <DsButton variant="primary">Primary action</DsButton>
                <DsButton variant="secondary">Secondary</DsButton>
                <DsButton variant="ghost">Ghost</DsButton>
              </div>
              <p style={{ color: 'var(--muted)', marginTop: 'var(--s-5)', fontSize: 'var(--t-sm)' }}>
                Cut corner on the bottom-right, 12px radius elsewhere. Primary fills with the accent; only one per view.
              </p>
            </Card>
            <Card>
              <h3 style={{ fontSize: 'var(--t-lg)', fontWeight: 600, marginBottom: 'var(--s-4)' }}>Inputs</h3>
              <div className="flex flex-col" style={{ gap: 'var(--s-4)' }}>
                <div className="flex flex-col" style={{ gap: 'var(--s-2)' }}>
                  <label style={{ fontSize: 'var(--t-sm)', fontWeight: 500, color: 'var(--muted)' }}>Workspace name</label>
                  <input className="ds-input" placeholder="e.g. North Dock" />
                </div>
                <div className="flex flex-col" style={{ gap: 'var(--s-2)' }}>
                  <label style={{ fontSize: 'var(--t-sm)', fontWeight: 500, color: 'var(--muted)' }}>Notes</label>
                  <textarea className="ds-textarea" rows={2} placeholder="Optional context…" />
                </div>
              </div>
              <p style={{ color: 'var(--muted)', marginTop: 'var(--s-4)', fontSize: 'var(--t-sm)' }}>
                Monochrome focus ring at 3px, 12% tint. Quiet until touched.
              </p>
            </Card>
          </div>

          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', marginTop: 'var(--s-4)' }}>
            <Card>
              <h3 style={{ fontSize: 'var(--t-lg)', fontWeight: 600, marginBottom: 'var(--s-4)' }}>Tags &amp; status</h3>
              <div className="flex flex-wrap" style={{ gap: 'var(--s-3)' }}>
                <Pill>default</Pill>
                <Pill accent>accent</Pill>
              </div>
              <div className="flex flex-wrap" style={{ gap: 'var(--s-3)', marginTop: 'var(--s-3)' }}>
                <Pill color="var(--success)">● live</Pill>
                <Pill color="var(--warn)">● queued</Pill>
                <Pill color="var(--danger)">● blocked</Pill>
              </div>
            </Card>
            <Card>
              <h3 style={{ fontSize: 'var(--t-lg)', fontWeight: 600, marginBottom: 'var(--s-4)' }}>Metric</h3>
              <Eyebrow>Throughput</Eyebrow>
              <p className="font-display" style={{ fontSize: 'var(--t-2xl)', lineHeight: 1, color: 'var(--accent)' }}>1,284</p>
              <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>units · this week</p>
            </Card>
            <Card>
              <h3 style={{ fontSize: 'var(--t-lg)', fontWeight: 600, marginBottom: 'var(--s-4)' }}>List row</h3>
              {[['Inbound · A-12', 'live', 'var(--success)'], ['Inbound · A-13', 'idle', ''], ['Inbound · A-14', 'queued', 'var(--warn)']].map(([label, status, color], i) => (
                <div key={label} className="flex justify-between items-center" style={{ paddingBlock: 'var(--s-2)', borderBottom: i < 2 ? '1px solid var(--border)' : undefined }}>
                  <span style={{ fontSize: 'var(--t-sm)' }}>{label}</span>
                  <Pill color={color || undefined}>{status}</Pill>
                </div>
              ))}
            </Card>
          </div>

          <div style={{ marginTop: 'var(--s-7)' }}>
            <SectionHead title="Cards &amp; bento tiles" />
            <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))' }}>
              <Card interactive>
                <Eyebrow>Standard</Eyebrow>
                <h3 style={{ fontSize: 'var(--t-lg)', fontWeight: 600, marginTop: 'var(--s-2)' }}>Surface card</h3>
                <p style={{ color: 'var(--muted)', marginTop: 'var(--s-3)' }}>1px border, 32px padding, the signature cut on the bottom-right. Lifts 2px on hover.</p>
              </Card>
              <Card interactive fill="var(--surface-2)">
                <Eyebrow>Feature</Eyebrow>
                <h3 style={{ fontSize: 'var(--t-lg)', fontWeight: 600, marginTop: 'var(--s-2)' }}>Raised tile</h3>
                <p style={{ color: 'var(--muted)', marginTop: 'var(--s-3)' }}>A slightly lighter surface marks the one tile that matters in a grid.</p>
              </Card>
              <Card interactive fill="var(--accent)" stroke="none" style={{ color: 'var(--accent-fg)' }}>
                <Eyebrow style={{ color: 'var(--accent-fg)', opacity: 0.8 }}>Accent</Eyebrow>
                <h3 style={{ fontSize: 'var(--t-lg)', fontWeight: 600, marginTop: 'var(--s-2)', color: 'var(--accent-fg)' }}>Hero tile</h3>
                <p style={{ marginTop: 'var(--s-3)', color: 'var(--accent-fg)', opacity: 0.88 }}>The single colored block per composition. Use it once and make it count.</p>
              </Card>
            </div>
          </div>
        </Wrap>
      </Section>

      {/* ──── Bento Patterns ──── */}
      <Section id="website-patterns">
        <Wrap>
          <Eyebrow>Patterns</Eyebrow>
          <h2 className="font-display" style={{ fontSize: 'var(--t-2xl)', marginTop: 'var(--s-3)' }}>Bento compositions</h2>
          <p className="ds-lead" style={{ marginTop: 'var(--s-4)', maxWidth: '64ch' }}>
            Modular grids where tiles vary in size to set hierarchy, one accent block anchors the eye, and the cut corner ties every cell to the same family. The grid collapses cleanly to two columns, then one.
          </p>

          {/* Composition 1: hero-anchored */}
          <div style={{ marginTop: 'var(--s-6)' }}>
            <SectionHead title="Hero-anchored" pill="one big, several small" />
            <div className="ds-bento">
              <Card corners="br" cut={2.5} shoulder={0.875} fill="var(--accent)" stroke="none" className="col-4 row-2" style={{ color: 'var(--accent-fg)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <Eyebrow style={{ color: 'var(--accent-fg)', opacity: 0.8 }}>Operations</Eyebrow>
                  <h2 className="font-display" style={{ color: 'var(--accent-fg)', marginTop: 'var(--s-3)', fontSize: 'var(--t-xl)' }}>Every dock, one view</h2>
                </div>
                <p style={{ color: 'var(--accent-fg)', opacity: 0.85, maxWidth: '36ch' }}>The anchor tile is the only colored surface in the grid. It sets the topic; everything around it supports.</p>
              </Card>
              <Card className="col-2" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <Glyph />
                <div><b>Live tracking</b><p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>Real-time bay status.</p></div>
              </Card>
              <Card className="col-2" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <Eyebrow>Uptime</Eyebrow>
                <p className="font-display" style={{ fontSize: 'var(--t-2xl)', lineHeight: 1 }}>99.2<span style={{ fontSize: 'var(--t-md)', color: 'var(--muted)' }}>%</span></p>
              </Card>
              <Card className="col-2" fill="var(--surface-2)" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div><b>Routing</b><p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>Auto-assign inbound loads.</p></div>
                <Pill accent>new</Pill>
              </Card>
              <Card className="col-2" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <Glyph />
                <div><b>Alerts</b><p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>Only when it matters.</p></div>
              </Card>
            </div>
          </div>

          {/* Composition 2: even mosaic */}
          <div style={{ marginTop: 'var(--s-7)' }}>
            <SectionHead title="Even mosaic" pill="balanced, no single hero" />
            <div className="ds-bento">
              <Card className="col-3">
                <Eyebrow>Capacity</Eyebrow>
                <p className="font-display" style={{ fontSize: 'var(--t-2xl)', lineHeight: 1 }}>1,284<span style={{ fontSize: 'var(--t-md)', color: 'var(--muted)' }}> u</span></p>
                <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>Available this week</p>
              </Card>
              <Card className="col-3">
                <Eyebrow>Throughput</Eyebrow>
                <div className="flex" style={{ alignItems: 'flex-end', gap: 6, height: 64, marginTop: 'var(--s-3)' }}>
                  {[40, 65, 50, 85, 70].map((h, i) => (
                    <span key={i} style={{ flex: 1, height: `${h}%`, background: i === 3 ? 'var(--accent)' : 'var(--surface-2)', borderRadius: i === 3 ? '4px 4px 7px 4px' : 4 }} />
                  ))}
                </div>
              </Card>
              <Card className="col-2" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}><Glyph /><b>Inbound</b></Card>
              <Card className="col-2" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}><Glyph /><b>Outbound</b></Card>
              <Card className="col-2" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}><Glyph /><b>Returns</b></Card>
            </div>
          </div>

          {/* Composition 3: feature + ledger */}
          <div style={{ marginTop: 'var(--s-7)' }}>
            <SectionHead title="Feature + ledger" pill="narrative left, data right" />
            <div className="ds-bento">
              <Card className="col-4 row-2" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <Eyebrow>Why Warehaus</Eyebrow>
                  <h2 className="font-display" style={{ marginTop: 'var(--s-3)', fontSize: 'var(--t-xl)' }}>Calm software for busy floors</h2>
                </div>
                <p style={{ color: 'var(--muted)', maxWidth: '42ch' }}>A wide tile carries the story; the column beside it carries the numbers. The cut repeats at every size so the grid still feels like one object.</p>
              </Card>
              <Card className="col-2"><Eyebrow>Avg dwell</Eyebrow><p className="font-display" style={{ fontSize: 'var(--t-2xl)', lineHeight: 1 }}>42<span style={{ fontSize: 'var(--t-md)', color: 'var(--muted)' }}>m</span></p></Card>
              <Card className="col-2"><Eyebrow>On-time</Eyebrow><p className="font-display" style={{ fontSize: 'var(--t-2xl)', lineHeight: 1, color: 'var(--accent)' }}>96<span style={{ fontSize: 'var(--t-md)', color: 'var(--muted)' }}>%</span></p></Card>
              <Card className="col-4">
                <div className="flex justify-between"><span className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>LANE</span><span className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>STATUS</span></div>
                <div className="flex justify-between items-center" style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--s-3)', marginTop: 'var(--s-3)' }}><span>Dock A · North</span><Pill color="var(--success)">live</Pill></div>
                <div className="flex justify-between items-center" style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--s-3)', marginTop: 'var(--s-3)' }}><span>Dock B · East</span><Pill color="var(--warn)">queued</Pill></div>
              </Card>
            </div>
          </div>

          <Card style={{ marginTop: 'var(--s-7)' }}>
            <h3 style={{ fontSize: 'var(--t-lg)', fontWeight: 600 }}>Bento rules</h3>
            <div className="grid gap-4 md:grid-cols-2" style={{ marginTop: 'var(--s-4)', color: 'var(--muted)' }}>
              <ul style={{ paddingLeft: '1.1rem', lineHeight: 1.8 }}>
                <li>Vary tile size to set hierarchy — don’t color everything to compete.</li>
                <li>At most one accent tile per composition; it’s the anchor.</li>
                <li>Gap is <code className="ds-mono">--s-4</code> (16px); tiles share one radius family.</li>
              </ul>
              <ul style={{ paddingLeft: '1.1rem', lineHeight: 1.8 }}>
                <li>6-column grid on desktop → 2 columns ≤860px → 1 column ≤520px.</li>
                <li>Keep each tile to one idea: a metric, a feature, a chart, a row.</li>
                <li>Let tiles breathe — internal padding stays generous even when small.</li>
              </ul>
            </div>
          </Card>
        </Wrap>
      </Section>
    </div>
  );
}
