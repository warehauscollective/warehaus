import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Bevel } from './Bevel';

/**
 * The signature chamfered surface — a painted SVG 45° cut with rounded
 * shoulders. Geometry (cut / shoulder / radius) is authored in rem.
 */
const meta = {
  title: 'Surfaces/Bevel',
  component: Bevel,
  tags: ['autodocs'],
  argTypes: {
    cut: { control: { type: 'range', min: 0, max: 6, step: 0.125 }, description: 'Bevel depth (rem)' },
    shoulder: { control: { type: 'range', min: 0, max: 3, step: 0.125 }, description: 'Shoulder fillet (rem)' },
    radius: { control: { type: 'range', min: 0, max: 3, step: 0.125 }, description: 'Rounded radius (rem)' },
    corners: { control: 'text', description: "Beveled corners, e.g. 'br' or 'tl tr br bl'" },
    fill: { control: 'text' },
    stroke: { control: 'text' },
    clip: { control: 'boolean' },
  },
  args: {
    corners: 'br',
    cut: 2.5,
    shoulder: 0.875,
    radius: 1.125,
    fill: 'var(--surface)',
    stroke: 'var(--border)',
  },
  render: (args) => (
    <Bevel
      {...args}
      style={{ minWidth: 280, minHeight: 160, display: 'flex', alignItems: 'flex-end', padding: '1.5rem', color: 'var(--fg)' }}
    >
      <span className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>chamfer surface</span>
    </Bevel>
  ),
} satisfies Meta<typeof Bevel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const FullBevel: Story = { args: { corners: 'tl tr br bl', cut: 1.375, shoulder: 0.5 } };

export const Accent: Story = {
  args: { fill: 'var(--accent)', stroke: 'none' },
  render: (args) => (
    <Bevel {...args} style={{ minWidth: 280, minHeight: 160, display: 'flex', alignItems: 'flex-end', padding: '1.5rem', color: 'var(--accent-fg)' }}>
      <span className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--accent-fg)', opacity: 0.85 }}>accent tile</span>
    </Bevel>
  ),
};

export const Clipped: Story = { args: { clip: true } };
