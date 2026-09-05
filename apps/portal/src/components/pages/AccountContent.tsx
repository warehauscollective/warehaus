'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from 'convex/react';
import { api } from '@convex/_generated/api';
import { GhostButton, Pill, PrimaryButton, Surface } from '@/components/ui/primitives';
import {
  PortalStatGrid,
  PortalTilePane,
  PortalWorkspace,
} from '@/components/layout/PortalWorkspace';
import { usePortalView } from '@/components/providers/PortalViewProvider';
import { usePortalAuth } from '@/hooks/usePortalAuth';
import { tenantEyebrow, usePortalData } from '@/hooks/usePortalData';
import { getHostSlugFromLocation } from '@/lib/auth/host-slug';
import { isConvexConfigured } from '@/lib/convex/client';

const SECTION_TITLE: Record<string, string> = {
  overview: 'Account',
  profile: 'Profile',
  billing: 'Billing',
  team: 'Clients',
  preferences: 'Preferences',
};

const CLIENT_SECTION_TITLE: Record<string, string> = {
  overview: 'Organization',
  profile: 'Profile',
  billing: 'Billing',
  preferences: 'Preferences',
};

function formatRelative(ts: number | null): string {
  if (ts == null) return '—';
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatBillingDate(ts: number | null | undefined): string {
  if (ts == null) return '—';
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function invoiceStatusColor(status: string): string {
  switch (status) {
    case 'paid':
      return 'var(--success)';
    case 'open':
    case 'draft':
      return 'var(--warn)';
    case 'uncollectible':
    case 'void':
      return 'var(--danger)';
    default:
      return 'var(--muted)';
  }
}

function subscriptionStatusColor(status: string): string {
  switch (status) {
    case 'active':
    case 'trialing':
      return 'var(--success)';
    case 'past_due':
    case 'unpaid':
      return 'var(--danger)';
    case 'canceled':
    case 'incomplete_expired':
      return 'var(--muted)';
    default:
      return 'var(--warn)';
  }
}

export function AccountContent() {
  const router = useRouter();
  const configured = isConvexConfigured();
  const { sectionFor, setSectionFor, openDetail } = usePortalView();
  const { data, loading, error } = usePortalData();
  const { portalSession, signOut } = usePortalAuth();
  const activeSection = sectionFor('account');
  const isClient = data.tenant.mode === 'client';
  const isStaff = Boolean(portalSession?.isStaff);

  const [density, setDensity] = useState<'comfortable' | 'compact'>('comfortable');
  const [savedDensity, setSavedDensity] = useState<'comfortable' | 'compact'>('comfortable');
  const [prefsSaved, setPrefsSaved] = useState(false);
  const prefsDirty = density !== savedDensity;

  useEffect(() => {
    try {
      const raw = localStorage.getItem('warehaus-density');
      const next = raw === 'compact' ? 'compact' : 'comfortable';
      setDensity(next);
      setSavedDensity(next);
      document.documentElement.dataset.density = next;
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    setPrefsSaved(false);
  }, [density]);

  const titles = isClient ? CLIENT_SECTION_TITLE : SECTION_TITLE;
  const title = titles[activeSection] ?? (isClient ? 'Organization' : 'Account');
  const primary = data.clients[0];
  const tenant = data.tenant;
  const hostSlug =
    typeof window !== 'undefined' ? getHostSlugFromLocation() ?? undefined : undefined;

  const directory = useQuery(
    api.clients.listDirectory,
    configured && isStaff && !isClient ? { hostSlug } : 'skip',
  );
  const teamStats = useQuery(
    api.clients.getTeamStats,
    configured && isStaff && !isClient ? { hostSlug } : 'skip',
  );
  const billing = useQuery(
    api.billing.listForClient,
    configured && data.tenant.ok && (activeSection === 'billing' || activeSection === 'overview')
      ? { hostSlug }
      : 'skip',
  );

  useEffect(() => {
    if (isClient && activeSection === 'team') setSectionFor('account', 'overview');
  }, [isClient, activeSection, setSectionFor]);

  return (
    <PortalWorkspace eyebrow={tenantEyebrow(tenant, isClient ? 'Organization' : 'Account')} title={title}>
      {error && (
        <p style={{ color: 'var(--danger)', fontSize: 'var(--t-sm)', marginBottom: 12 }}>{error}</p>
      )}
      {activeSection === 'overview' && (
        <PortalTilePane>
          <div className="flex h-full min-h-0 flex-col gap-4">
            <PortalStatGrid
              items={
                isClient
                  ? [
                      { label: 'Org', value: primary?.slug ?? tenant.slug ?? '—' },
                      { label: 'Projects', value: loading ? '…' : String(data.projects.length) },
                      { label: 'Tasks', value: loading ? '…' : String(data.tasks.length) },
                    ]
                  : [
                      {
                        label: 'Clients',
                        value:
                          teamStats === undefined
                            ? '…'
                            : String(teamStats.clientCount),
                        hint:
                          teamStats != null
                            ? `${teamStats.portalEnabled} portal on`
                            : undefined,
                      },
                      {
                        label: 'Projects',
                        value:
                          teamStats === undefined
                            ? '…'
                            : String(teamStats.projectCount),
                        hint: 'Published',
                      },
                      {
                        label: 'Open tasks',
                        value:
                          teamStats === undefined
                            ? '…'
                            : String(teamStats.openTaskCount),
                      },
                      {
                        label: 'Review',
                        value:
                          teamStats === undefined
                            ? '…'
                            : String(teamStats.uploadNeedsReview),
                        hint: 'Uploads',
                      },
                    ]
              }
            />
            <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-2">
              <Surface style={{ padding: 'var(--s-5)' }}>
                <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>
                  {isClient ? 'Your organization' : 'Tenant'}
                </p>
                <h3 style={{ fontSize: 'var(--t-md)', fontWeight: 600, marginTop: 8 }}>
                  {isClient
                    ? (primary?.name ?? tenant.clientName ?? 'Unknown client')
                    : 'Warehaus team'}
                </h3>
                <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', marginTop: 4 }}>
                  {isClient
                    ? `Portal: ${tenant.slug ?? '—'}.localhost`
                    : 'Host: portal.* · cross-org admin via session'}
                </p>
                <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--faint)', marginTop: 8 }}>
                  {isClient
                    ? `${tenant.slug ?? '—'} · ${tenant.clientExternalId ?? '—'}`
                    : `staff · ${teamStats?.clientCount ?? '—'} clients`}
                </p>
              </Surface>
              <Surface style={{ padding: 'var(--s-5)' }}>
                <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>
                  {isClient ? 'Visibility' : 'Clients snapshot'}
                </p>
                {isClient ? (
                  <div className="mt-3 flex flex-col gap-2">
                    <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>
                      This portal only shows projects and activity tied to your client ID.
                      Warehaus-internal and other-client work is never included.
                    </p>
                    <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--faint)' }}>
                      Scoped to {tenant.clientExternalId ?? '—'}
                    </p>
                  </div>
                ) : (
                  <div className="mt-3 flex flex-col gap-2">
                    {(directory ?? []).slice(0, 6).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() =>
                          openDetail({
                            id: m.id,
                            title: m.name,
                            subtitle: m.slug ?? 'Client',
                            body: (
                              <div className="flex flex-col gap-2">
                                <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>
                                  {m.projectCount} projects · {m.openTaskCount} open tasks ·{' '}
                                  {m.resourceCount} resources
                                </p>
                                {m.uploadNeedsReview > 0 && (
                                  <Pill color="var(--warn)">
                                    {m.uploadNeedsReview} upload
                                    {m.uploadNeedsReview === 1 ? '' : 's'} in review
                                  </Pill>
                                )}
                              </div>
                            ),
                          })
                        }
                        className="flex w-full items-center justify-between text-left"
                        style={{
                          padding: '0.45rem 0',
                          borderBottom: '1px solid var(--border)',
                          background: 'none',
                          borderLeft: 0,
                          borderRight: 0,
                          borderTop: 0,
                          cursor: 'pointer',
                        }}
                      >
                        <span style={{ fontSize: 'var(--t-sm)', fontWeight: 600 }}>{m.name}</span>
                        <span className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>
                          {m.projectCount}p · {m.openTaskCount}t
                        </span>
                      </button>
                    ))}
                    {directory === undefined && (
                      <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>Loading…</p>
                    )}
                    {directory?.length === 0 && (
                      <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>
                        No clients synced yet.
                      </p>
                    )}
                  </div>
                )}
              </Surface>
            </div>
          </div>
        </PortalTilePane>
      )}

      {activeSection === 'profile' && (
        <PortalTilePane>
          <div className="flex h-full min-h-0 flex-col gap-4">
            <Surface style={{ padding: 'var(--s-5)', maxWidth: 480 }}>
              <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>
                Session
              </p>
              <h3 style={{ fontSize: 'var(--t-md)', fontWeight: 600, marginTop: 8 }}>
                {portalSession?.name ?? '—'}
              </h3>
              <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', marginTop: 4 }}>
                {portalSession?.email ?? '—'}
              </p>
              <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--faint)', marginTop: 8 }}>
                {portalSession
                  ? `${portalSession.role} · ${portalSession.orgSlug}`
                  : 'Not linked'}
              </p>
              <div className="mt-5 flex justify-end">
                <GhostButton
                  onClick={() => {
                    void (async () => {
                      await signOut();
                      router.replace('/login');
                    })();
                  }}
                >
                  Sign out
                </GhostButton>
              </div>
            </Surface>
            <Surface style={{ padding: 'var(--s-5)', maxWidth: 640 }}>
              <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>
                Profile
              </p>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="flex flex-col" style={{ gap: 'var(--s-2)' }}>
                  <span style={{ fontSize: 'var(--t-sm)', fontWeight: 500, color: 'var(--muted)' }}>
                    Display name
                  </span>
                  <input
                    className="ds-input"
                    defaultValue={portalSession?.name ?? ''}
                    readOnly
                  />
                </label>
                <label className="flex flex-col" style={{ gap: 'var(--s-2)' }}>
                  <span style={{ fontSize: 'var(--t-sm)', fontWeight: 500, color: 'var(--muted)' }}>
                    Email
                  </span>
                  <input
                    className="ds-input"
                    defaultValue={portalSession?.email ?? ''}
                    readOnly
                  />
                </label>
                <label className="flex flex-col md:col-span-2" style={{ gap: 'var(--s-2)' }}>
                  <span style={{ fontSize: 'var(--t-sm)', fontWeight: 500, color: 'var(--muted)' }}>
                    {isClient ? 'Client ID' : 'Home org'}
                  </span>
                  <input
                    className="ds-input"
                    value={primary?.id ?? tenant.clientExternalId ?? '—'}
                    readOnly
                  />
                </label>
              </div>
              <p style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)', marginTop: 'var(--s-4)' }}>
                Profile edits sync from Notion Contacts. Use Notion to change name or email.
              </p>
            </Surface>
          </div>
        </PortalTilePane>
      )}

      {activeSection === 'billing' && (
        <PortalTilePane>
          <div className="flex h-full min-h-0 flex-col gap-4">
            {billing === undefined && (
              <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>Loading billing…</p>
            )}
            {billing && !billing.subscription && billing.invoices.length === 0 && (
              <Surface style={{ padding: 'var(--s-5)' }}>
                <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>
                  No billing on file. Stripe invoices appear here once a customer is linked.
                </p>
              </Surface>
            )}
            {billing?.subscription && (
              <Surface style={{ padding: 'var(--s-5)' }}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>
                      Plan
                    </p>
                    <h3 style={{ fontSize: 'var(--t-md)', fontWeight: 600, marginTop: 8 }}>
                      {billing.subscription.planName}
                    </h3>
                    <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', marginTop: 4 }}>
                      Period ends {formatBillingDate(billing.subscription.currentPeriodEnd)}
                      {billing.subscription.cancelAtPeriodEnd ? ' · Cancels at period end' : ''}
                    </p>
                  </div>
                  <Pill color={subscriptionStatusColor(billing.subscription.status)}>
                    {billing.subscription.status}
                  </Pill>
                </div>
              </Surface>
            )}
            {billing && billing.invoices.length > 0 && (
              <div
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  overflow: 'hidden',
                  flex: 1,
                  minHeight: 0,
                }}
              >
                <div className="h-full overflow-auto">
                  <table className="ds-data" style={{ minWidth: 640 }}>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Number</th>
                        <th>Amount</th>
                        <th>Status</th>
                        <th>Link</th>
                      </tr>
                    </thead>
                    <tbody>
                      {billing.invoices.map((inv) => (
                        <tr key={inv.id}>
                          <td className="ds-mono">{formatBillingDate(inv.createdAt)}</td>
                          <td className="ds-mono">{inv.number ?? '—'}</td>
                          <td>{inv.amountLabel}</td>
                          <td>
                            <Pill color={invoiceStatusColor(inv.status)}>{inv.status}</Pill>
                          </td>
                          <td>
                            {inv.hostedInvoiceUrl || inv.invoicePdf ? (
                              <a
                                href={inv.hostedInvoiceUrl ?? inv.invoicePdf ?? '#'}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="ds-mono"
                                style={{
                                  fontSize: 'var(--t-xs)',
                                  color: 'var(--accent)',
                                  textDecoration: 'underline',
                                  textUnderlineOffset: 3,
                                }}
                              >
                                Open
                              </a>
                            ) : (
                              <span className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--faint)' }}>
                                —
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </PortalTilePane>
      )}

      {!isClient && activeSection === 'team' && (
        <PortalTilePane>
          <div
            style={{
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              overflow: 'hidden',
              height: '100%',
            }}
          >
            <div className="h-full overflow-auto">
              {directory === undefined && (
                <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', padding: 'var(--s-5)' }}>
                  Loading clients…
                </p>
              )}
              {directory?.length === 0 && (
                <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', padding: 'var(--s-5)' }}>
                  No clients in Convex yet. Run a Notion pull.
                </p>
              )}
              {directory && directory.length > 0 && (
                <table className="ds-data" style={{ minWidth: 720 }}>
                  <thead>
                    <tr>
                      <th>Client</th>
                      <th>Slug</th>
                      <th>Portal</th>
                      <th>Projects</th>
                      <th>Open tasks</th>
                      <th>Resources</th>
                      <th>Review</th>
                      <th>Activity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {directory.map((m) => (
                      <tr
                        key={m.id}
                        onClick={() =>
                          openDetail({
                            id: m.id,
                            title: m.name,
                            subtitle: m.slug ?? 'Client',
                            body: (
                              <div className="flex flex-col gap-3">
                                <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>
                                  Status {m.status} · Portal {m.portalAccess}
                                </p>
                                <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--faint)' }}>
                                  {m.projectCount} projects · {m.openTaskCount} open tasks ·{' '}
                                  {m.resourceCount} resources
                                  {m.uploadNeedsReview
                                    ? ` · ${m.uploadNeedsReview} uploads awaiting review`
                                    : ''}
                                </p>
                              </div>
                            ),
                          })
                        }
                        style={{ cursor: 'pointer' }}
                      >
                        <td>{m.name}</td>
                        <td className="ds-mono" style={{ fontSize: 'var(--t-sm)' }}>
                          {m.slug ?? '—'}
                        </td>
                        <td>
                          <Pill
                            color={
                              m.portalAccess === 'Enabled' ? 'var(--success)' : 'var(--muted)'
                            }
                          >
                            {m.portalAccess}
                          </Pill>
                        </td>
                        <td className="ds-mono">{m.projectCount}</td>
                        <td className="ds-mono">{m.openTaskCount}</td>
                        <td className="ds-mono">{m.resourceCount}</td>
                        <td className="ds-mono">
                          {m.uploadNeedsReview > 0 ? (
                            <Pill color="var(--warn)">{m.uploadNeedsReview}</Pill>
                          ) : (
                            '0'
                          )}
                        </td>
                        <td className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--faint)' }}>
                          {formatRelative(m.lastActivityAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </PortalTilePane>
      )}

      {activeSection === 'preferences' && (
        <PortalTilePane>
          <Surface style={{ padding: 'var(--s-5)', maxWidth: 560 }}>
            <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>
              Preferences
            </p>
            <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', marginTop: 12 }}>
              Density is stored in this browser. Profile name and email stay Notion-sourced.
            </p>
            <label className="mt-4 flex flex-col gap-1">
              <span style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>Workspace density</span>
              <select
                value={density}
                onChange={(e) => setDensity(e.target.value as 'comfortable' | 'compact')}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  background: 'var(--bg)',
                  color: 'var(--fg)',
                  padding: '0.55rem 0.7rem',
                  fontSize: 'var(--t-sm)',
                }}
              >
                <option value="comfortable">Comfortable</option>
                <option value="compact">Compact</option>
              </select>
            </label>
            {!isClient && (
              <p style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)', marginTop: 'var(--s-4)' }}>
                Sync mode: {data.syncMeta.mode}
                {data.syncMeta.lastSyncedAt
                  ? ` · last sync ${new Date(data.syncMeta.lastSyncedAt).toLocaleString()}`
                  : ' · not synced yet'}
              </p>
            )}
            {prefsSaved ? (
              <p style={{ fontSize: 'var(--t-xs)', color: 'var(--success)', marginTop: 12 }}>
                Saved for this browser.
              </p>
            ) : null}
            <div className="mt-5 flex justify-end">
              <PrimaryButton
                disabled={!prefsDirty}
                onClick={() => {
                  try {
                    localStorage.setItem('warehaus-density', density);
                    document.documentElement.dataset.density = density;
                    setSavedDensity(density);
                    setPrefsSaved(true);
                  } catch {
                    /* ignore quota / private mode */
                  }
                }}
              >
                Save preferences
              </PrimaryButton>
            </div>
          </Surface>
        </PortalTilePane>
      )}
    </PortalWorkspace>
  );
}
