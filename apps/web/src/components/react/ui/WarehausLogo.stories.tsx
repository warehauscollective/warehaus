import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { WarehausLogo } from './WarehausLogo';

/** The Warehaus wordmark — inlined SVG colored via currentColor, theme-aware. */
const meta = {
  title: 'Brand/Logo',
  component: WarehausLogo,
  tags: ['autodocs'],
  argTypes: {
    height: { control: { type: 'range', min: 12, max: 96, step: 1 } },
    color: { control: 'text' },
  },
  args: { height: 40, color: 'var(--fg)' },
} satisfies Meta<typeof WarehausLogo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Sizes: Story = {
  render: () => (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 'var(--s-5)' }}>
      {[16, 22, 34, 48, 72].map((h) => (
        <WarehausLogo key={h} height={h} color="var(--fg)" />
      ))}
    </div>
  ),
};

export const OnAccent: Story = {
  render: () => (
    <div style={{ background: 'var(--accent)', padding: 'var(--s-6)', borderRadius: 12 }}>
      <WarehausLogo height={40} color="var(--accent-fg, #000)" />
    </div>
  ),
};
