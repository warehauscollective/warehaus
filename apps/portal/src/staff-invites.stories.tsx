import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import './styles/global.css';
import { AcceptInvite, type AcceptInviteIO } from '@/components/auth/AcceptInvite';
import { TeamInvites } from '@/components/pages/TeamInvites';
import { PortalTabProvider } from '@/components/providers/PortalTabProvider';
import { PortalViewProvider } from '@/components/providers/PortalViewProvider';

const preview = {
  new: { status: 'create-account' as const, invitedEmail: 'jordan@warehaus.studio', inviteeName: 'Jordan Blake', inviterName: 'Peter Roquemore', inviterEmail: 'peter@warehaus.studio' },
  existing: { status: 'sign-in' as const, invitedEmail: 'jordan@warehaus.studio', inviteeName: 'Jordan Blake', inviterName: 'Peter Roquemore', inviterEmail: 'peter@warehaus.studio' },
  ready: { status: 'ready' as const, invitedEmail: 'jordan@warehaus.studio', signedInEmail: 'jordan@warehaus.studio', inviteeName: 'Jordan Blake', inviterName: 'Peter Roquemore', inviterEmail: 'peter@warehaus.studio' },
  used: { status: 'used' as const, invitedEmail: 'jordan@warehaus.studio', inviterName: 'Peter Roquemore', inviterEmail: 'peter@warehaus.studio', usedAt: Date.UTC(2026, 10, 9) },
  expired: { status: 'expired' as const, invitedEmail: 'jordan@warehaus.studio', inviterName: 'Peter Roquemore', inviterEmail: 'peter@warehaus.studio', expiresAt: Date.UTC(2026, 10, 2) },
  revoked: { status: 'revoked' as const, invitedEmail: 'jordan@warehaus.studio', inviterName: 'Peter Roquemore', inviterEmail: 'peter@warehaus.studio' },
  off: { status: 'off' as const, invitedEmail: 'jordan@warehaus.studio', inviterName: 'Peter Roquemore', inviterEmail: 'peter@warehaus.studio' },
  wrong: { status: 'different-email' as const, invitedEmail: 'jordan@warehaus.studio', signedInEmail: 'someone.else.with.a.very.long.address@warehaus.studio', inviterName: 'Peter Roquemore', inviterEmail: 'peter@warehaus.studio' },
  unverified: { status: 'unverified' as const, invitedEmail: 'jordan@warehaus.studio', inviterName: 'Peter Roquemore', inviterEmail: 'peter@warehaus.studio', sentAtLabel: '10:42 AM' },
  error: { status: 'error' as const, invitedEmail: 'jordan@warehaus.studio', inviterName: 'Peter Roquemore', inviterEmail: 'peter@warehaus.studio' },
  already: { status: 'already' as const, invitedEmail: 'jordan@warehaus.studio', inviterName: 'Peter Roquemore', inviterEmail: 'peter@warehaus.studio' },
};

function io(key: keyof typeof preview): AcceptInviteIO {
  return {
    token: 'story-token',
    previewKey: null,
    forced: preview[key],
    preview: preview[key],
    previewLoading: false,
    configured: false,
    sessionEmail: preview[key].status === 'ready' || preview[key].status === 'different-email' ? (preview[key] as { signedInEmail?: string }).signedInEmail ?? null : null,
    readAuthenticated: () => false,
    refreshSession: async () => {},
    accept: async () => ({ ok: false }),
    requestRenew: async () => ({ ok: true }),
    signUpEmail: async () => ({ error: null }),
    signInEmail: async () => ({ error: null }),
    sendVerification: async () => {},
    replace: () => {},
    refresh: () => {},
    link: { state: 'ready' },
    conflicted: false,
  };
}

function emailIo(): AcceptInviteIO {
  return { ...io('new'), previewKey: 'email', forced: undefined, preview: null };
}

function slowIo(): AcceptInviteIO {
  return { ...io('new'), previewKey: 'finishing-slow', forced: undefined, preview: null };
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <PortalTabProvider>
      <PortalViewProvider>{children}</PortalViewProvider>
    </PortalTabProvider>
  );
}

const meta = {
  title: 'Portal/Staff invites',
  component: AcceptInvite,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof AcceptInvite>;

export default meta;
type Story = StoryObj<typeof meta>;

export const CreateAccount: Story = { render: () => <AcceptInvite io={io('new')} /> };
export const SignIn: Story = { render: () => <AcceptInvite io={io('existing')} /> };
export const Ready: Story = { render: () => <AcceptInvite io={io('ready')} /> };
export const AlreadyUsed: Story = { render: () => <AcceptInvite io={io('used')} /> };
export const Expired: Story = { render: () => <AcceptInvite io={io('expired')} /> };
export const Revoked: Story = { render: () => <AcceptInvite io={io('revoked')} /> };
export const Unavailable: Story = { render: () => <AcceptInvite io={io('off')} /> };
export const WrongAccount: Story = { render: () => <AcceptInvite io={io('wrong')} /> };
export const VerificationPending: Story = { render: () => <AcceptInvite io={io('unverified')} /> };
export const GenericFailure: Story = { render: () => <AcceptInvite io={io('error')} /> };
export const AlreadyStaff: Story = { render: () => <AcceptInvite io={io('already')} /> };
export const FinishingSlow: Story = { render: () => <AcceptInvite io={slowIo()} /> };
export const InviteEmail: Story = { render: () => <AcceptInvite io={emailIo()} /> };

export const StaffTab: Story = {
  render: () => (
    <Shell>
      <TeamInvites configured={false} fixtures screen="ready" draft={{ name: '', email: '' }} onDraftChange={() => {}} />
    </Shell>
  ),
};

export const InviteModal: Story = {
  parameters: {
    nextjs: { appDirectory: true, navigation: { pathname: '/preview', query: { inviteUi: 'modal' } } },
  },
  render: () => (
    <Shell>
      <TeamInvites configured={false} fixtures screen="ready" draft={{ name: '', email: '' }} onDraftChange={() => {}} />
    </Shell>
  ),
};

export const InviteSheet: Story = {
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
    chromatic: { viewports: [390] },
    nextjs: { appDirectory: true, navigation: { pathname: '/preview', query: { inviteUi: 'sheet' } } },
  },
  render: () => (
    <Shell>
      <TeamInvites configured={false} fixtures screen="ready" draft={{ name: '', email: '' }} onDraftChange={() => {}} />
    </Shell>
  ),
};

export const Sending: Story = {
  parameters: {
    nextjs: { appDirectory: true, navigation: { pathname: '/preview', query: { inviteUi: 'sending' } } },
  },
  render: () => (
    <Shell>
      <TeamInvites configured={false} fixtures screen="ready" draft={{ name: '', email: '' }} onDraftChange={() => {}} />
    </Shell>
  ),
};

export const AlreadyOnTeam: Story = {
  parameters: {
    nextjs: { appDirectory: true, navigation: { pathname: '/preview', query: { inviteUi: 'staff' } } },
  },
  render: () => (
    <Shell>
      <TeamInvites configured={false} fixtures screen="ready" draft={{ name: '', email: '' }} onDraftChange={() => {}} />
    </Shell>
  ),
};
