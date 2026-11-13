import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { FormEvent } from 'react';
import '../../styles/global.css';
import { NewClientForm } from './NewClientControl';

const meta = {
  title: 'Portal/New client',
  component: NewClientForm,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof NewClientForm>;

export default meta;
type Story = StoryObj<typeof meta>;

const handlers = {
  onCompanyName: () => {},
  onPrimaryEmail: () => {},
  onPhone: () => {},
  onSubmit: (event: FormEvent) => event.preventDefault(),
  onClose: () => {},
  onUseExisting: () => {},
};

export const Dialog: Story = {
  args: {
    narrow: false,
    companyName: 'North Wind',
    primaryEmail: '',
    phone: '',
    note: null,
    pending: false,
    reused: false,
    ...handlers,
  },
};

export const FieldError: Story = {
  args: {
    ...Dialog.args,
    note: { tone: 'error', text: 'Primary Email is not a valid address', field: 'email' },
    primaryEmail: 'not-an-email',
  },
};

export const UseExisting: Story = {
  args: {
    ...Dialog.args,
    reused: true,
    note: { tone: 'info', text: 'A client with this name or slug already exists.' },
  },
};

export const Sheet: Story = {
  args: {
    ...Dialog.args,
    narrow: true,
  },
};
