import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Card, DsButton, Pill, Eyebrow } from './_shared';

/** Core style-guide primitives: chamfered cards, buttons, and pills. */
const meta = {
  title: 'Primitives/Overview',
  parameters: { layout: 'padded' },
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const Buttons: Story = {
  render: () => (
    <div className="flex flex-wrap" style={{ gap: 'var(--s-3)' }}>
      <DsButton variant="primary">Primary action</DsButton>
      <DsButton variant="secondary">Secondary</DsButton>
      <DsButton variant="ghost">Ghost</DsButton>
    </div>
  ),
};

export const Pills: Story = {
  render: () => (
    <div className="flex flex-wrap" style={{ gap: 'var(--s-3)' }}>
      <Pill>default</Pill>
      <Pill accent>accent</Pill>
      <Pill color="var(--success)">● live</Pill>
      <Pill color="var(--warning)">● queued</Pill>
      <Pill color="var(--info)">● info</Pill>
    </div>
  ),
};

export const Cards: Story = {
  render: () => (
    <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', maxWidth: 760 }}>
      <Card interactive>
        <Eyebrow>Standard</Eyebrow>
        <h3 style={{ fontSize: 'var(--t-lg)', fontWeight: 600, marginTop: 'var(--s-2)' }}>Surface card</h3>
        <p style={{ color: 'var(--muted)', marginTop: 'var(--s-3)', fontSize: 'var(--t-sm)' }}>1px border, the signature bottom-right cut. Lifts on hover.</p>
      </Card>
      <Card interactive fill="var(--surface-2)">
        <Eyebrow>Feature</Eyebrow>
        <h3 style={{ fontSize: 'var(--t-lg)', fontWeight: 600, marginTop: 'var(--s-2)' }}>Raised tile</h3>
        <p style={{ color: 'var(--muted)', marginTop: 'var(--s-3)', fontSize: 'var(--t-sm)' }}>A lighter surface marks the one tile that matters.</p>
      </Card>
      <Card interactive fill="var(--accent)" stroke="none" style={{ color: 'var(--accent-fg)' }}>
        <Eyebrow style={{ color: 'var(--accent-fg)', opacity: 0.8 }}>Accent</Eyebrow>
        <h3 style={{ fontSize: 'var(--t-lg)', fontWeight: 600, marginTop: 'var(--s-2)', color: 'var(--accent-fg)' }}>Hero tile</h3>
        <p style={{ marginTop: 'var(--s-3)', fontSize: 'var(--t-sm)', color: 'var(--accent-fg)', opacity: 0.88 }}>The single colored block per composition.</p>
      </Card>
    </div>
  ),
};
