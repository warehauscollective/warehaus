'use client';

import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@convex/_generated/api';
import { GhostButton, PrimaryButton, Surface } from '@/components/ui/primitives';
import { PortalTilePane } from '@/components/layout/PortalWorkspace';

type Confirm =
  | { kind: 'revoke' | 'resend'; notionPageId: string; name: string; email: string }
  | null;

export function TeamInvites({
  hostSlug,
  configured,
}: {
  hostSlug?: string;
  configured: boolean;
}) {
  const team = useQuery(api.invites.listTeam, configured ? { hostSlug } : 'skip');
  const createInvite = useMutation(api.invites.create);
  const revokeInvite = useMutation(api.invites.revoke);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);

  async function sendInvite(request: { name: string; email: string }) {
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const result = await createInvite({
        name: request.name,
        email: request.email,
        requestId: crypto.randomUUID(),
        inviteRole: 'Client Member',
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setNotice('Invite pending');
      setName('');
      setEmail('');
    } catch {
      setError("We couldn't send this invite");
    } finally {
      setPending(false);
    }
  }

  async function onRevoke(notionPageId: string) {
    setPending(true);
    setError(null);
    try {
      const result = await revokeInvite({ contactNotionPageId: notionPageId });
      if (!result.ok) setError(result.message);
      else setNotice('Revoke pending');
    } catch {
      setError("We couldn't send this invite");
    } finally {
      setPending(false);
      setConfirm(null);
    }
  }

  return (
    <PortalTilePane>
      <div className="flex h-full min-h-0 flex-col gap-4 overflow-auto">
        {team === undefined && (
          <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>Loading team…</p>
        )}
        {team && !team.canInvite && (
          <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>
            Only client admins can manage invites.
          </p>
        )}
        {team?.canInvite && (
          <Surface style={{ padding: 24, maxWidth: 520 }}>
            <p className="ds-mono" style={{ fontSize: 11, color: 'var(--muted)', margin: 0 }}>
              Invite
            </p>
            <h2 style={{ fontSize: 20, lineHeight: '26px', fontWeight: 600, margin: '8px 0 0' }}>
              Invite a teammate
            </h2>
            <form
              className="mt-4 flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                void sendInvite({ name, email });
              }}
            >
              <label className="flex flex-col gap-1">
                <span style={{ fontSize: 14, color: 'var(--muted)' }}>Name</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                  style={fieldStyle}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span style={{ fontSize: 14, color: 'var(--muted)' }}>Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  style={fieldStyle}
                />
              </label>
              <fieldset className="flex flex-col gap-2" style={{ border: 0, margin: 0, padding: 0 }}>
                <legend style={{ fontSize: 14, color: 'var(--muted)' }}>Role</legend>
                <label style={{ fontSize: 14 }}>
                  <input type="radio" name="role" checked readOnly /> Client Member
                </label>
                <label style={{ fontSize: 14, color: 'var(--muted)' }}>
                  <input type="radio" name="role" disabled /> Client Admin
                  <span style={{ display: 'block', fontSize: 13 }}>
                    Only Warehaus can add admins for now
                  </span>
                </label>
              </fieldset>
              <PrimaryButton type="submit" disabled={pending}>
                Send invite
              </PrimaryButton>
            </form>
          </Surface>
        )}
        {error && <p style={{ color: 'var(--danger)', fontSize: 14 }}>{error}</p>}
        {notice && <p style={{ color: 'var(--muted)', fontSize: 14 }}>{notice}</p>}
        {confirm && (
          <Surface style={{ padding: 24, maxWidth: 520 }}>
            <h2 style={{ fontSize: 20, lineHeight: '26px', fontWeight: 600, margin: 0 }}>
              {confirm.kind === 'resend' ? 'Resend invite' : 'Revoke invite'}
            </h2>
            <p style={{ fontSize: 14, lineHeight: '21px', color: 'var(--muted)' }}>
              {confirm.kind === 'resend'
                ? `Send a new invite to ${confirm.email}? The previous link stops working.`
                : `Revoke portal access for ${confirm.name}? Their invite link stops working.`}
            </p>
            <div className="flex flex-wrap gap-3">
              <PrimaryButton
                disabled={pending}
                onClick={() => {
                  if (confirm.kind === 'resend') {
                    setConfirm(null);
                    void sendInvite({ name: confirm.name, email: confirm.email });
                  } else {
                    void onRevoke(confirm.notionPageId);
                  }
                }}
              >
                {confirm.kind === 'resend' ? 'Resend' : 'Revoke'}
              </PrimaryButton>
              <GhostButton onClick={() => setConfirm(null)}>Cancel</GhostButton>
            </div>
          </Surface>
        )}
        {team && (
          <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'auto' }}>
            <table className="ds-data" style={{ minWidth: 640 }}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {team.members.map((member) => (
                  <tr key={member.notionPageId}>
                    <td>{member.name}</td>
                    <td>{member.email}</td>
                    <td>{member.role}</td>
                    <td>{member.portalAccess}</td>
                    <td>
                      {team.canInvite && (
                        <GhostButton
                          onClick={() =>
                            setConfirm({
                              kind: 'revoke',
                              notionPageId: member.notionPageId,
                              name: member.name,
                              email: member.email,
                            })
                          }
                        >
                          Remove
                        </GhostButton>
                      )}
                    </td>
                  </tr>
                ))}
                {team.invites.map((invite) => (
                  <tr key={invite.notionPageId}>
                    <td>{invite.name}</td>
                    <td>{invite.email}</td>
                    <td>{invite.role}</td>
                    <td>{invite.inviteStatus}</td>
                    <td>
                      {team.canInvite && (
                        <span className="flex flex-wrap gap-2">
                          <GhostButton
                            onClick={() =>
                              setConfirm({
                                kind: 'resend',
                                notionPageId: invite.notionPageId,
                                name: invite.name,
                                email: invite.email,
                              })
                            }
                          >
                            Resend
                          </GhostButton>
                          <GhostButton
                            onClick={() =>
                              setConfirm({
                                kind: 'revoke',
                                notionPageId: invite.notionPageId,
                                name: invite.name,
                                email: invite.email,
                              })
                            }
                          >
                            Revoke
                          </GhostButton>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {team.members.length === 0 && team.invites.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ color: 'var(--muted)' }}>
                      No teammates yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </PortalTilePane>
  );
}

const fieldStyle = {
  background: 'transparent',
  color: 'var(--foreground)',
  border: '1px solid var(--border)',
  borderRadius: 9,
  padding: '12px 14px',
  fontSize: 14,
};
