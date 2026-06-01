import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { tokens } from '@warehaus/tokens';

/**
 * Living token reference, sourced from @warehaus/tokens. Color swatches read the
 * live CSS vars, so they reflect the active theme (toggle / Chromatic mode).
 */
const meta = {
  title: 'Foundations/Tokens',
  parameters: { layout: 'padded' },
} satisfies Meta;

export default meta;
type Story = StoryObj;

function Swatch({ name, varName }: { name: string; varName: string }) {
  return (
    <div className="flex flex-col" style={{ gap: 6, width: 120 }}>
      <div style={{ height: 56, borderRadius: 8, border: '1px solid var(--border)', background: `var(${varName})` }} />
      <span style={{ fontSize: 'var(--t-xs)', color: 'var(--fg)' }}>{name}</span>
      <span className="ds-mono" style={{ fontSize: 11, color: 'var(--muted)' }}>{varName}</span>
    </div>
  );
}

const SEMANTIC = [
  ['Background', '--background'], ['Foreground', '--foreground'], ['Muted', '--muted'], ['Accent', '--accent'],
  ['Surface', '--surface'], ['Surface elevated', '--surface-elevated'], ['Border', '--border'],
  ['Success', '--success'], ['Warning', '--warning'], ['Info', '--info'],
] as const;

const PILLARS = ['dream', 'design', 'develop'] as const;
const PILLAR_TIERS = ['primary', 'secondary', 'surface', 'border', 'bg-deep', 'bg-mid'] as const;

export const Colors: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-7)' }}>
      <section>
        <h3 style={{ fontSize: 'var(--t-md)', fontWeight: 600, marginBottom: 'var(--s-4)' }}>Semantic</h3>
        <div className="flex flex-wrap" style={{ gap: 'var(--s-4)' }}>
          {SEMANTIC.map(([n, v]) => <Swatch key={v} name={n} varName={v} />)}
        </div>
      </section>
      {PILLARS.map((p) => (
        <section key={p}>
          <h3 style={{ fontSize: 'var(--t-md)', fontWeight: 600, marginBottom: 'var(--s-4)', textTransform: 'capitalize' }}>{p}</h3>
          <div className="flex flex-wrap" style={{ gap: 'var(--s-4)' }}>
            {PILLAR_TIERS.map((t) => <Swatch key={t} name={t} varName={`--${p}-${t}`} />)}
          </div>
        </section>
      ))}
    </div>
  ),
};

export const Spacing: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {Object.entries(tokens.space).map(([k, v]) => (
        <div key={k} className="flex items-center" style={{ gap: 'var(--s-4)' }}>
          <span className="ds-mono" style={{ width: 90, fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>s-{k} · {v}</span>
          <div style={{ height: 14, width: v, background: 'var(--accent)', borderRadius: 3 }} />
        </div>
      ))}
    </div>
  ),
};

export const Type: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
      {Object.entries(tokens.type).map(([k, v]) => (
        <div key={k} className="flex items-baseline" style={{ gap: 'var(--s-5)' }}>
          <span className="ds-mono" style={{ width: 70, fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>{k}</span>
          <span className="font-display" style={{ fontSize: v, lineHeight: 'var(--lh-head)', color: 'var(--fg)', whiteSpace: 'nowrap' }}>Warehaus</span>
        </div>
      ))}
    </div>
  ),
};
