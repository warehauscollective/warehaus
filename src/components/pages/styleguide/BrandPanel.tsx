'use client';

import Link from 'next/link';
import { Bevel } from '@/components/react/ui/Bevel';
import { WarehausLogo } from '@/components/react/ui/WarehausLogo';
import { WORLDS } from '@/lib/data/worlds';
import { Card, DsButton, Eyebrow, Pill, Section, SectionHead, Wrap } from './_shared';

const PRINCIPLES = [
  { n: '01', h: 'Restraint is the brand.', p: 'One accent used at most twice per screen, one decisive flourish, generous space. If a thing isn’t earning its place, it leaves.' },
  { n: '02', h: 'The cut is the signature.', p: 'The 45° chamfer with rounded shoulders is how Warehaus is recognized at a glance. It rides on surfaces, the mark, and key controls — never decoration for its own sake.' },
  { n: '03', h: 'Black & white, on purpose.', p: 'The palette is deliberately two colors. Color is reserved for status, so when something turns red it actually means something.' },
  { n: '04', h: 'Engineered, not decorated.', p: 'Eurostile’s wide geometry says precision and logistics. Everything reads as built, measured, and dependable.' },
];

const CORE_TOKENS = [
  { name: 'Background', token: '--bg', value: 'var(--bg)' },
  { name: 'Surface', token: '--surface', value: 'var(--surface)' },
  { name: 'Surface 2', token: '--surface-2', value: 'var(--surface-2)' },
  { name: 'Foreground', token: '--fg', value: 'var(--fg)' },
  { name: 'Muted', token: '--muted', value: 'var(--muted)' },
  { name: 'Border', token: '--border', value: 'var(--border)' },
];

const TYPE_SCALE = [
  { tag: 'Display · 3xl', size: 'var(--t-3xl)', display: true, sample: 'Build the system' },
  { tag: 'H1 · 2xl', size: 'var(--t-2xl)', display: true, sample: 'Build the system' },
  { tag: 'H2 · xl', size: 'var(--t-xl)', display: true, sample: 'Build the system' },
  { tag: 'H3 · lg / 24', size: 'var(--t-lg)', display: false, weight: 600, sample: 'Build the system' },
  { tag: 'Lead · md / 20', size: 'var(--t-md)', display: false, muted: true, sample: 'Build the system that gets out of the way.' },
  { tag: 'Body · base / 16', size: 'var(--t-base)', display: false, sample: 'Build the system that gets out of the way and lets the work speak.' },
  { tag: 'Small · sm / 14', size: 'var(--t-sm)', display: false, sample: 'Build the system that gets out of the way and lets the work speak.' },
];

function scrollTo(key: string) {
  document.querySelector(`[data-section="${key}"]`)?.scrollIntoView({ behavior: 'smooth' });
}

export function BrandPanel() {
  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      {/* ──── Hero ──── */}
      <Section id="brand-hero" pad={false} style={{ paddingBlock: 'clamp(3.5rem, 2rem + 8vw, 7rem)' }}>
        <Wrap>
          <Eyebrow>01 / Brand</Eyebrow>
          <h1
            className="font-display"
            style={{ fontSize: 'var(--t-3xl)', lineHeight: 'var(--lh-tight)', letterSpacing: 'var(--ls-display)', maxWidth: '18ch', marginTop: 'var(--s-4)' }}
          >
            Who Warehaus is, before it says a word.
          </h1>
          <p className="ds-lead" style={{ marginTop: 'var(--s-5)', maxWidth: '60ch' }}>
            The brand layer is the source everything else inherits from: the two-color palette, the Eurostile + Geist pairing, the signature 45° cut, and the voice. Get these right and the Website and Portal fall into line automatically.
          </p>
          <div className="flex flex-wrap gap-2" style={{ marginTop: 'var(--s-6)' }}>
            {['Logo', 'Color', 'Type', 'Shape', 'Voice', 'Worlds'].map((t) => (
              <Pill key={t}>{t}</Pill>
            ))}
          </div>
        </Wrap>
      </Section>

      {/* ──── Principles ──── */}
      <Section id="brand-principles">
        <Wrap>
          <SectionHead title="Brand principles" pill="the non-negotiables" />
          <div>
            {PRINCIPLES.map((pr) => (
              <div
                key={pr.n}
                className="grid gap-4"
                style={{ gridTemplateColumns: '48px 1fr', paddingBlock: 'var(--s-5)', borderTop: '1px solid var(--border)' }}
              >
                <span className="ds-mono" style={{ color: 'var(--accent)' }}>{pr.n}</span>
                <div>
                  <h3 style={{ fontSize: 'var(--t-md)', fontWeight: 600 }}>{pr.h}</h3>
                  <p className="ds-lead" style={{ marginTop: 4, maxWidth: '70ch' }}>{pr.p}</p>
                </div>
              </div>
            ))}
          </div>
        </Wrap>
      </Section>

      {/* ──── Logo ──── */}
      <Section id="brand-logo">
        <Wrap>
          <Eyebrow>Brand · Logo</Eyebrow>
          <h2 className="font-display" style={{ fontSize: 'var(--t-2xl)', marginTop: 'var(--s-3)' }}>The mark</h2>
          <p className="ds-lead" style={{ marginTop: 'var(--s-4)', maxWidth: '64ch' }}>
            A geometric wordmark carries the whole identity — engineered bars with the signature 45° cut. It inverts with the theme and stays legible from a 16px tab to a wall.
          </p>

          <div className="grid gap-4 md:grid-cols-2" style={{ marginTop: 'var(--s-6)' }}>
            <Card cut={56} shoulder={20} style={{ alignItems: 'center', justifyContent: 'center', display: 'flex', minHeight: 280 }}>
              <WarehausLogo height={56} />
            </Card>
            <Card cut={56} shoulder={20} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <Eyebrow>Construction</Eyebrow>
              <p style={{ color: 'var(--muted)', marginTop: 'var(--s-3)' }}>
                Square base. The bottom-right corner is cut at 45°, removing roughly 36% of each adjacent edge. The other three corners stay square in the icon (the rounded-shoulder version is reserved for surfaces, not the mark).
              </p>
              <p className="ds-mono" style={{ color: 'var(--muted)', marginTop: 'var(--s-4)', fontSize: 'var(--t-xs)' }}>
                clip-path: polygon(0 0, 100% 0, 100% 64%, 64% 100%, 0 100%)
              </p>
            </Card>
          </div>

          {/* Lockup + wordmark variants */}
          <div className="grid gap-4 md:grid-cols-2" style={{ marginTop: 'var(--s-4)' }}>
            <Card cut={44} shoulder={16}>
              <Eyebrow>Primary lockup</Eyebrow>
              <div className="flex items-center" style={{ minHeight: 64, marginTop: 'var(--s-4)' }}>
                <WarehausLogo height={34} />
              </div>
              <p style={{ color: 'var(--muted)', marginTop: 'var(--s-4)', fontSize: 'var(--t-sm)' }}>
                The primary logo — a geometric Eurostile wordmark. Use it as-is on light or dark; it inverts with the theme. Keep its proportions; never restretch or recolor.
              </p>
            </Card>
            <Card cut={44} shoulder={16}>
              <Eyebrow>Expressive alt</Eyebrow>
              <div className="grid place-items-center" style={{ minHeight: 92, marginTop: 'var(--s-4)' }}>
                <span className="font-display" style={{ fontStyle: 'italic', fontWeight: 900, fontSize: 'clamp(1.75rem,5vw,2.75rem)', letterSpacing: '-0.05em', textTransform: 'lowercase' }}>
                  warehaus
                </span>
              </div>
              <p style={{ color: 'var(--muted)', marginTop: 'var(--s-4)', fontSize: 'var(--t-sm)' }}>
                Eurostile Italic, 900, lowercase, heavy negative tracking. The forward-momentum lockup — reserve it for hero moments, covers, and the Worlds.
              </p>
            </Card>
          </div>

          {/* Clearspace, sizing, do/don't */}
          <div className="grid gap-4 md:grid-cols-2" style={{ marginTop: 'var(--s-4)' }}>
            <Card cut={44} shoulder={16}>
              <Eyebrow>Sizing</Eyebrow>
              <div className="flex" style={{ alignItems: 'flex-end', gap: 'var(--s-5)', marginTop: 'var(--s-4)' }}>
                {[16, 22, 34, 48].map((s) => (
                  <WarehausLogo key={s} height={s} />
                ))}
              </div>
              <p style={{ color: 'var(--muted)', marginTop: 'var(--s-4)', fontSize: 'var(--t-sm)' }}>
                Minimum height is <strong style={{ color: 'var(--fg)' }}>16px</strong>. Below that the bars start to merge. Keep clearspace at 60% of the cap height on every side.
              </p>
            </Card>
            <Card cut={44} shoulder={16}>
              <Eyebrow>Do &amp; don’t</Eyebrow>
              <ul style={{ color: 'var(--muted)', marginTop: 'var(--s-3)', paddingLeft: '1.1rem', lineHeight: 1.9, fontSize: 'var(--t-sm)' }}>
                <li><span style={{ color: 'var(--success)' }}>Do</span> use the accent fill — it inverts correctly in both themes.</li>
                <li><span style={{ color: 'var(--success)' }}>Do</span> keep the cut on the bottom-right; that orientation is fixed.</li>
                <li><span style={{ color: 'var(--danger)' }}>Don’t</span> tint, gradient, or add a second hue. The mark is monochrome.</li>
                <li><span style={{ color: 'var(--danger)' }}>Don’t</span> rotate, flip the cut, round the three square corners, or stretch it.</li>
              </ul>
            </Card>
          </div>
        </Wrap>
      </Section>

      {/* ──── Color ──── */}
      <Section id="brand-color">
        <Wrap>
          <Eyebrow>Foundations</Eyebrow>
          <h2 className="font-display" style={{ fontSize: 'var(--t-2xl)', marginTop: 'var(--s-3)' }}>Color</h2>
          <p className="ds-lead" style={{ marginTop: 'var(--s-4)', maxWidth: '64ch' }}>
            Two brand colors, full stop: ink <code className="ds-mono">#1F1F1F</code> and paper <code className="ds-mono">#F6F6F7</code>. They swap roles between modes, and every neutral is a grey between them. Status colors are the only hue. Flip the site theme to watch every token re-resolve.
          </p>

          <div style={{ marginTop: 'var(--s-6)' }}>
            <SectionHead title={<span style={{ fontSize: 'var(--t-md)' }}>Brand anchors</span>} pill="the only two" pillAccent />
            <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}>
              {[{ name: 'Ink', token: '--ink · #1F1F1F', value: 'var(--ink)' }, { name: 'Paper', token: '--paper · #F6F6F7', value: 'var(--paper)' }].map((c) => (
                <Bevel key={c.name} corners="br" cut={40} shoulder={14} clip fill="var(--surface)" stroke="var(--border)">
                  <div style={{ height: 120, background: c.value }} />
                  <div style={{ padding: 'var(--s-4)' }}>
                    <b>{c.name}</b>
                    <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>{c.token}</p>
                  </div>
                </Bevel>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 'var(--s-7)' }}>
            <SectionHead title={<span style={{ fontSize: 'var(--t-md)' }}>Core tokens</span>} pill="resolves per theme" />
            <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))' }}>
              {CORE_TOKENS.map((c) => (
                <Bevel key={c.token} corners="br" cut={40} shoulder={14} clip fill="var(--surface)" stroke="var(--border)">
                  <div style={{ height: 96, background: c.value }} />
                  <div style={{ padding: 'var(--s-4)' }}>
                    <b style={{ fontSize: 'var(--t-sm)' }}>{c.name}</b>
                    <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>{c.token}</p>
                  </div>
                </Bevel>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 'var(--s-7)' }}>
            <SectionHead title={<span style={{ fontSize: 'var(--t-md)' }}>Status — keep it scarce</span>} />
            <div className="flex flex-wrap" style={{ gap: 'var(--s-3)' }}>
              <Pill color="var(--success)">● Success</Pill>
              <Pill color="var(--warn)">● Warn</Pill>
              <Pill color="var(--danger)">● Danger</Pill>
            </div>
          </div>

          <Card cut={40} shoulder={14} style={{ marginTop: 'var(--s-7)' }}>
            <h3 style={{ fontSize: 'var(--t-lg)', fontWeight: 600 }}>Rules of use</h3>
            <ul style={{ color: 'var(--muted)', marginTop: 'var(--s-4)', paddingLeft: '1.1rem', lineHeight: 1.7 }}>
              <li>Two brand colors only — everything else is a neutral grey between them.</li>
              <li>The accent is monochrome and inverts per theme. Use it at most twice per screen.</li>
              <li>Status colors are the only hue. They signal state, never decorate.</li>
              <li>Derive new neutrals on the grey axis (chroma 0) — don’t introduce a hue.</li>
            </ul>
          </Card>
        </Wrap>
      </Section>

      {/* ──── Typography ──── */}
      <Section id="brand-type">
        <Wrap>
          <Eyebrow>Foundations</Eyebrow>
          <h2 className="font-display" style={{ fontSize: 'var(--t-2xl)', marginTop: 'var(--s-3)' }}>Typography</h2>
          <p className="ds-lead" style={{ marginTop: 'var(--s-4)', maxWidth: '64ch' }}>
            Two voices. <strong style={{ color: 'var(--fg)' }}>Eurostile</strong> sets titles — wide, geometric, engineered. <strong style={{ color: 'var(--fg)' }}>Geist</strong> carries everything you actually read. Never more than three sizes on one screen.
          </p>

          <div className="grid gap-4 md:grid-cols-2" style={{ marginTop: 'var(--s-6)' }}>
            <Card>
              <Eyebrow>Display family</Eyebrow>
              <p className="font-display" style={{ fontSize: 'clamp(3rem,8vw,5rem)', lineHeight: 1, marginTop: 'var(--s-3)' }}>Aa</p>
              <p className="font-display" style={{ fontSize: 'var(--t-md)', marginTop: 'var(--s-4)', letterSpacing: '0.02em' }}>
                ABCDEFGHIJKLM<br />NOPQRSTUVWXYZ<br />0123456789
              </p>
              <p className="ds-mono" style={{ color: 'var(--muted)', marginTop: 'var(--s-4)', fontSize: 'var(--t-xs)' }}>Eurostile · titles only</p>
            </Card>
            <Card>
              <Eyebrow>Body family</Eyebrow>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: 'clamp(3rem,8vw,5rem)', lineHeight: 1, marginTop: 'var(--s-3)', fontWeight: 500 }}>Aa</p>
              <p style={{ fontSize: 'var(--t-base)', marginTop: 'var(--s-4)' }}>
                Geist keeps long reading comfortable: open counters, even rhythm, weights from 300 to 700. Numbers run <span className="ds-mono">tabular</span> in data contexts.
              </p>
              <p className="ds-mono" style={{ color: 'var(--muted)', marginTop: 'var(--s-4)', fontSize: 'var(--t-xs)' }}>Geist · 300 / 400 / 500 / 600 / 700</p>
            </Card>
          </div>

          <div style={{ marginTop: 'var(--s-7)' }}>
            <h3 style={{ fontSize: 'var(--t-lg)', fontWeight: 600, marginBottom: 'var(--s-3)' }}>The scale</h3>
            {TYPE_SCALE.map((t) => (
              <div
                key={t.tag}
                className="grid items-baseline"
                style={{ gridTemplateColumns: '140px 1fr', gap: 'var(--s-5)', borderTop: '1px solid var(--border)', paddingBlock: 'var(--s-6)' }}
              >
                <span className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>{t.tag}</span>
                <span
                  className={t.display ? 'font-display' : undefined}
                  style={{
                    fontSize: t.size,
                    fontWeight: t.weight,
                    color: t.muted ? 'var(--muted)' : 'var(--fg)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    lineHeight: t.display ? 'var(--lh-head)' : 1.4,
                  }}
                >
                  {t.sample}
                </span>
              </div>
            ))}
          </div>

          <Card style={{ marginTop: 'var(--s-7)' }}>
            <h3 style={{ fontSize: 'var(--t-lg)', fontWeight: 600 }}>Pairing rules</h3>
            <div className="grid gap-4 md:grid-cols-2" style={{ marginTop: 'var(--s-4)', color: 'var(--muted)' }}>
              <ul style={{ paddingLeft: '1.1rem', lineHeight: 1.8 }}>
                <li>Eurostile for H1–H2 and big numerals only.</li>
                <li>Geist for H3 down, body, UI labels, captions.</li>
                <li>Eyebrows are mono, uppercase, 0.22em tracking.</li>
              </ul>
              <ul style={{ paddingLeft: '1.1rem', lineHeight: 1.8 }}>
                <li>Display letter-spacing: −0.01em; never positive on titles.</li>
                <li>Body line-height 1.6; headings 1.12; display 1.05.</li>
                <li>Max three sizes per screen — pick a clear hierarchy.</li>
              </ul>
            </div>
          </Card>
        </Wrap>
      </Section>

      {/* ──── Shape & Space ──── */}
      <Section id="brand-shape">
        <Wrap>
          <Eyebrow>Foundations</Eyebrow>
          <h2 className="font-display" style={{ fontSize: 'var(--t-2xl)', marginTop: 'var(--s-3)' }}>Shape &amp; space</h2>
          <p className="ds-lead" style={{ marginTop: 'var(--s-4)', maxWidth: '64ch' }}>
            The signature: corners are smooth on three sides and cut clean at 45° on one. It reads as engineered, not decorative — and shows up at every scale, from a 7px logo mark to a full-bleed bento tile.
          </p>

          <div style={{ marginTop: 'var(--s-6)' }}>
            <SectionHead title="The corner family" pill="painted SVG bevel" pillAccent />
            <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))' }}>
              <Card>
                <Bevel corners="br" cut={40} shoulder={14} fill="var(--accent)" stroke="none" style={{ aspectRatio: '1.4', display: 'flex', alignItems: 'flex-end', padding: 'var(--s-4)' }}>
                  <span className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--accent-fg)' }}>chamfer</span>
                </Bevel>
                <p style={{ marginTop: 'var(--s-4)', fontWeight: 600 }}>Chamfer mix</p>
                <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>Default. Three rounded, bottom-right cut at 45°.</p>
              </Card>
              <Card>
                <Bevel corners="tl tr br bl" cut={22} shoulder={8} fill="var(--accent)" stroke="none" style={{ aspectRatio: '1.4', display: 'flex', alignItems: 'flex-end', padding: 'var(--s-4)' }}>
                  <span className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--accent-fg)' }}>bevel</span>
                </Bevel>
                <p style={{ marginTop: 'var(--s-4)', fontWeight: 600 }}>Full bevel</p>
                <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>All four corners cut. Architectural, for accents.</p>
              </Card>
              <Card>
                <div style={{ aspectRatio: '1.4', display: 'flex', alignItems: 'flex-end', padding: 'var(--s-4)', background: 'var(--accent)', borderRadius: 'var(--radius-lg)' }}>
                  <span className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--accent-fg)' }}>soft</span>
                </div>
                <p style={{ marginTop: 'var(--s-4)', fontWeight: 600 }}>Soft squircle</p>
                <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>Superellipse, no cut. For media + avatars.</p>
              </Card>
              <Card>
                <div style={{ aspectRatio: '1.4', display: 'flex', alignItems: 'flex-end', padding: 'var(--s-4)', background: 'var(--accent)', borderRadius: 999 }}>
                  <span className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--accent-fg)' }}>pill</span>
                </div>
                <p style={{ marginTop: 'var(--s-4)', fontWeight: 600 }}>Pill</p>
                <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>Tags, toggles, small status chips.</p>
              </Card>
            </div>
          </div>

          {/* Radius & cut tokens */}
          <div style={{ marginTop: 'var(--s-7)' }}>
            <SectionHead title="Radius &amp; cut tokens" />
            <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))' }}>
              <Card style={{ textAlign: 'center' }}>
                <div style={{ height: 60, background: 'var(--surface-2)', borderRadius: 10, marginBottom: 'var(--s-3)' }} />
                <b>10px</b><br /><code className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>--radius-sm</code>
              </Card>
              <Card style={{ textAlign: 'center' }}>
                <div style={{ height: 60, background: 'var(--surface-2)', borderRadius: 18, marginBottom: 'var(--s-3)' }} />
                <b>18px</b><br /><code className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>--radius</code>
              </Card>
              <Card style={{ textAlign: 'center' }}>
                <Bevel corners="br" radius={18} cut={22} shoulder={8} fill="var(--surface-2)" stroke="none" style={{ height: 60, marginBottom: 'var(--s-3)' }} />
                <b>22px</b><br /><code className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>--cut</code>
              </Card>
              <Card style={{ textAlign: 'center' }}>
                <Bevel corners="br" radius={18} cut={40} shoulder={14} fill="var(--surface-2)" stroke="none" style={{ height: 60, marginBottom: 'var(--s-3)' }} />
                <b>40px</b><br /><code className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>--cut-lg</code>
              </Card>
            </div>
          </div>

          {/* Negative space */}
          <div style={{ marginTop: 'var(--s-7)' }}>
            <SectionHead title="Negative space is the layout" pill="4px base" />
            <p style={{ color: 'var(--muted)', maxWidth: '60ch', marginBottom: 'var(--s-5)' }}>
              Warehaus runs on a 4px spacing base, but the personality lives at the top of the scale. Sections breathe at <code className="ds-mono">clamp(4rem … 8rem)</code>; content stays top-biased. When in doubt, add space — don’t add a box.
            </p>
            <div className="flex flex-col" style={{ gap: 'var(--s-3)' }}>
              {[{ w: '6%', l: '4' }, { w: '12%', l: '8' }, { w: '20%', l: '16 · --s-4' }, { w: '34%', l: '32 · --s-6' }, { w: '52%', l: '64 · --s-8' }, { w: '74%', l: '96 · --s-9' }, { w: '100%', l: '128 · --s-10' }].map((b) => (
                <div
                  key={b.l}
                  className="ds-mono"
                  style={{ height: 24, width: b.w, background: 'var(--accent-tint)', border: '1px dashed var(--accent)', borderRadius: 6, color: 'var(--accent)', fontSize: 'var(--t-xs)', display: 'flex', alignItems: 'center', paddingLeft: 'var(--s-3)' }}
                >
                  {b.l}
                </div>
              ))}
            </div>
          </div>

          <Card style={{ marginTop: 'var(--s-7)' }}>
            <h3 style={{ fontSize: 'var(--t-lg)', fontWeight: 600 }}>Space rules</h3>
            <div className="grid gap-4 md:grid-cols-2" style={{ marginTop: 'var(--s-4)', color: 'var(--muted)' }}>
              <ul style={{ paddingLeft: '1.1rem', lineHeight: 1.8 }}>
                <li>Section padding: <code className="ds-mono">--section-y</code> (4–8rem fluid).</li>
                <li>Page gutter: <code className="ds-mono">--gutter</code>; content capped at 1240px.</li>
                <li>Inside cards: <code className="ds-mono">--s-6</code> (32px) default padding.</li>
              </ul>
              <ul style={{ paddingLeft: '1.1rem', lineHeight: 1.8 }}>
                <li>Dividers only between unrelated top-level sections.</li>
                <li>Heroes are top-biased, never vertically centered.</li>
                <li>One decisive element per screen; everything else recedes.</li>
              </ul>
            </div>
          </Card>
        </Wrap>
      </Section>

      {/* ──── Voice & Tone ──── */}
      <Section id="brand-voice">
        <Wrap>
          <Eyebrow>Brand · Messaging</Eyebrow>
          <h2 className="font-display" style={{ fontSize: 'var(--t-2xl)', marginTop: 'var(--s-3)' }}>Voice &amp; tone</h2>
          <p className="ds-lead" style={{ marginTop: 'var(--s-4)', maxWidth: '64ch' }}>
            Warehaus sounds like the most competent person in the warehouse: direct, calm, and a little dry. We earn trust by being precise and skipping the hype — the same restraint the visuals show, in words.
          </p>

          <Card cut={56} shoulder={20} style={{ marginTop: 'var(--s-6)' }}>
            <Eyebrow>North-star line</Eyebrow>
            <p className="font-display" style={{ fontSize: 'clamp(1.75rem,4vw,3rem)', lineHeight: 1.1, letterSpacing: '0.01em', maxWidth: '20ch', marginTop: 'var(--s-4)' }}>
              Built for the people who keep things moving.
            </p>
          </Card>

          <div style={{ marginTop: 'var(--s-7)' }}>
            <SectionHead title="Voice is" pill="four dials, fixed" />
            <div className="grid gap-4 md:grid-cols-2">
              {[['Plain', 'Clever'], ['Confident', 'Boastful'], ['Precise', 'Vague'], ['Dry wit', 'Jokey']].map(([yes, no]) => (
                <div key={yes} className="flex justify-between" style={{ padding: 'var(--s-5)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-2)', fontSize: 'var(--t-sm)' }}>
                  <span style={{ color: 'var(--fg)' }}>{yes}</span>
                  <span style={{ color: 'var(--faint)', textDecoration: 'line-through' }}>{no}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 'var(--s-7)' }}>
            <SectionHead title="Tone in practice" />
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--danger)', marginBottom: 'var(--s-3)' }}>Off-brand</p>
                <p style={{ padding: 'var(--s-4)', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--muted)' }}>
                  “🚀 Supercharge your logistics with our revolutionary, best-in-class platform that 10× your workflow!”
                </p>
              </div>
              <div>
                <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--success)', marginBottom: 'var(--s-3)' }}>On-brand</p>
                <p style={{ padding: 'var(--s-4)', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
                  “Track every pallet from dock to delivery. One screen, updated the moment something moves.”
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2" style={{ marginTop: 'var(--s-7)' }}>
            <div>
              <h3 style={{ fontSize: 'var(--t-lg)', fontWeight: 600, marginBottom: 'var(--s-4)' }}>Say this, not that</h3>
              {[['Track', 'Leverage'], ['Move', 'Synergize'], ['Fast', 'Lightning-fast'], ['Built', 'Crafted'], ['Every', 'Best-in-class'], ['Now', 'In real-time*']].map(([use, lose]) => (
                <div key={use} className="flex justify-between" style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--border)', fontSize: 'var(--t-sm)' }}>
                  <span style={{ color: 'var(--fg)' }}>{use}</span>
                  <span style={{ color: 'var(--faint)' }}>{lose}</span>
                </div>
              ))}
            </div>
            <Card cut={44} shoulder={16} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <Eyebrow>Rules</Eyebrow>
              <ul style={{ color: 'var(--muted)', marginTop: 'var(--s-3)', paddingLeft: '1.1rem', lineHeight: 1.9 }}>
                <li>Lead with the verb. Cut the warm-up clause.</li>
                <li>Real numbers or none — never invented stats.</li>
                <li>One exclamation mark per quarter, maximum.</li>
                <li>Short sentences. Then a shorter one.</li>
              </ul>
            </Card>
          </div>

          <div style={{ marginTop: 'var(--s-7)' }}>
            <SectionHead title="Taglines" pill="approved set" />
            <div className="grid gap-3">
              <Bevel corners="br" cut={28} shoulder={10} fill="var(--accent)" stroke="none" className="font-display" style={{ padding: 'var(--s-4) var(--s-5)', fontSize: 'var(--t-md)', letterSpacing: '0.02em', color: 'var(--accent-fg)' }}>
                Keep things moving.
              </Bevel>
              {['Every pallet, accounted for.', 'The warehouse, on one screen.', 'From dock to delivery, in view.'].map((t) => (
                <div key={t} className="font-display" style={{ fontSize: 'var(--t-md)', letterSpacing: '0.02em', padding: 'var(--s-4) var(--s-5)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
                  {t}
                </div>
              ))}
            </div>
          </div>
        </Wrap>
      </Section>

      {/* ──── Worlds ──── */}
      <Section id="brand-worlds">
        <Wrap>
          <Eyebrow>Brand · Worlds</Eyebrow>
          <h2 className="font-display" style={{ fontSize: 'var(--t-2xl)', marginTop: 'var(--s-3)' }}>Three worlds</h2>
          <p className="ds-lead" style={{ marginTop: 'var(--s-4)', maxWidth: '70ch' }}>
            Every Warehaus image lives in one of three worlds — <em>Dream</em>, <em>Design</em>, <em>Develop</em>. They map the arc of the work: the upstream where the question forms, the workshop where it’s forged, and the megacity where it ships. Same painterly DNA throughout; what changes is the subject, scale, and light.
          </p>

          <div style={{ marginTop: 'var(--s-6)' }}>
            <SectionHead title="The shared DNA" pill="true of all three" />
            <div className="grid gap-px" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', background: 'var(--border)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
              {[
                { n: '01', h: 'Painterly', p: 'Illustrated, not rendered. Visible brushwork, flat washes, no PBR shine.' },
                { n: '02', h: 'Atmosphere', p: 'Volumetric haze, soft rim light, faded distances. Fog is mandatory.' },
                { n: '03', h: 'Still Witness', p: 'A tiny figure, off-center, contemplating. A guest in the world.' },
                { n: '04', h: 'Architecture + Nature', p: 'Built things and growing things, always together.' },
                { n: '05', h: 'Earth Palette', p: 'Bone, ink, deep teal sky, warm earth, moss, terracotta. No neon, no chrome.' },
              ].map((c) => (
                <div key={c.n} style={{ background: 'var(--bg-2)', padding: 'var(--s-5)', display: 'flex', flexDirection: 'column', gap: 8, minHeight: 150 }}>
                  <span className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>{c.n}</span>
                  <h3 style={{ fontSize: 'var(--t-md)', fontWeight: 600 }}>{c.h}</h3>
                  <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', lineHeight: 1.5 }}>{c.p}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Overview — one linked card per world; full detail lives on /style-guide/worlds */}
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', marginTop: 'var(--s-6)' }}>
            {WORLDS.map((w) => (
              <Link key={w.key} href={`/style-guide/worlds?tab=${w.key}`} style={{ textDecoration: 'none' }} aria-label={`Enter ${w.name}`}>
                <Card interactive cut={44} shoulder={16} style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
                  <div className="flex items-baseline" style={{ gap: 'var(--s-3)' }}>
                    <span className="font-display" style={{ fontStyle: 'italic', fontWeight: 900, fontSize: 'var(--t-2xl)', lineHeight: 0.85, color: w.accent, letterSpacing: '-0.04em', flex: 'none' }}>{w.num}</span>
                    <div>
                      <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', letterSpacing: '0.16em', textTransform: 'uppercase', color: w.accent }}>{w.kick}</p>
                      <p className="font-display" style={{ fontStyle: 'italic', fontWeight: 900, fontSize: 'var(--t-xl)', lineHeight: 1, letterSpacing: '-0.03em', textTransform: 'uppercase', marginTop: 4, color: w.accent }}>{w.name}</p>
                    </div>
                  </div>
                  <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', lineHeight: 1.5, flex: 1 }}>{w.tag}</p>
                  <div className="flex" style={{ gap: 6 }}>
                    {w.palette.map((c) => (
                      <span key={c.nm} title={c.nm} style={{ width: 22, height: 22, borderRadius: 6, border: '1px solid var(--border)', background: c.value }} />
                    ))}
                  </div>
                  <span className="ds-mono" style={{ fontSize: 'var(--t-xs)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fg)', marginTop: 'var(--s-2)' }}>Enter {w.name} →</span>
                </Card>
              </Link>
            ))}
          </div>

          <div className="flex" style={{ marginTop: 'var(--s-7)', gap: 'var(--s-3)' }}>
            <DsButton variant="primary" as="a" href="/style-guide/worlds">View all worlds →</DsButton>
            <DsButton variant="secondary" as="span" onClick={() => scrollTo('brand-hero')}>Back to top</DsButton>
          </div>
        </Wrap>
      </Section>
    </div>
  );
}
