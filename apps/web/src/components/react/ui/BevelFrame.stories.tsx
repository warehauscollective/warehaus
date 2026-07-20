import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { BevelFrame } from './BevelFrame';

/**
 * Framed "glass" surface — a translucent, blurred outer frame painted as a RING
 * (so it shows only as the border + bottom reveal) with a separate translucent
 * inner panel that blurs whatever is behind it. Used for the style-guide rails.
 */
const meta = {
  title: 'Surfaces/BevelFrame',
  component: BevelFrame,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  argTypes: {
    cut: { control: { type: 'range', min: 0, max: 6, step: 0.125 } },
    shoulder: { control: { type: 'range', min: 0, max: 3, step: 0.125 } },
    radius: { control: { type: 'range', min: 0, max: 3, step: 0.125 } },
    blur: { control: { type: 'range', min: 0, max: 48, step: 1 } },
  },
  args: {
    corners: 'br',
    cut: 3,
    shoulder: 0.875,
    radius: 1.25,
    frame: { top: 1, right: 1, bottom: 48, left: 1 },
    blur: 24,
  },
  render: (args) => (
    <div style={{ position: 'relative', height: 460, padding: 24, background: 'var(--bg-2)' }}>
      {/* faint content so the glass blur is visible */}
      <div style={{ position: 'absolute', inset: 24, display: 'grid', placeItems: 'center', color: 'var(--muted)', fontSize: 'var(--t-2xl)' }}>
        page content behind
      </div>
      <BevelFrame
        {...args}
        style={{ position: 'relative', width: 240, height: '100%' }}
        innerClassName="flex flex-col gap-1"
        innerStyle={{ padding: '1.5rem' }}
      >
        <div style={{ color: 'var(--fg)', fontWeight: 600 }}>Framed glass</div>
        <div style={{ color: 'var(--muted)', fontSize: 'var(--t-sm)' }}>Outer ring + inner panel</div>
      </BevelFrame>
    </div>
  ),
} satisfies Meta<typeof BevelFrame>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
