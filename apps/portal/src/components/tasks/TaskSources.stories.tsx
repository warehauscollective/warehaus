import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import '../../styles/global.css';
import { SourcesReview } from './SourcesReview';

const meta = {
  title: 'Portal/Sources panel',
  component: SourcesReview,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof SourcesReview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = { args: { audience: 'staff', screen: 'empty' } };
export const Loading: Story = { args: { audience: 'staff', screen: 'loading' } };
export const Error: Story = { args: { audience: 'staff', screen: 'error' } };
export const Links: Story = { args: { audience: 'staff', screen: 'links' } };
export const Client: Story = { args: { audience: 'client', screen: 'links' } };
