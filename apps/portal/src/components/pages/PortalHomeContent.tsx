'use client';

import type { ReactNode } from 'react';
import { useQuery } from 'convex/react';
import { api } from '@convex/_generated/api';
import { Pill, PrimaryButton } from '@/components/ui/primitives';
import {
  PortalTilePane,
  PortalWorkspace,
} from '@/components/layout/PortalWorkspace';
import { usePortalView } from '@/components/providers/PortalViewProvider';
import { activityToneVar, tenantEyebrow, usePortalData } from '@/hooks/usePortalData';
import {
  formatPortalDate,
  projectStatusColor,
  taskStatusColor,
  type PortalBillingSummary,
  type PortalProject,
  type PortalTask,
} from '@/lib/data/view-models';
import type { TenantMode } from '@/lib/auth/tenancy';
import { getHostSlugFromLocation } from '@/lib/auth/host-slug';
import { isConvexConfigured } from '@/lib/convex/client';
import { Bevel } from '@warehaus/ui';
import { PORTAL_PANEL_GAP_VAR, PORTAL_SURFACE_RADIUS } from '@/lib/design/portal-chrome';

const SECTION_TITLE: Record<string, string> = {
  overview: 'Overview',
};

const formatDue = formatPortalDate;

/** Notion rollup Progress may be 0–1 or 0–100 depending on formula. */
function formatProgress(value: number): string {
  const pct = value <= 1 ? Math.round(value * 100) : Math.round(value);
  return `${Math.min(100, Math.max(0, pct))}%`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 5);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function pickRecentTask(list: PortalTask[]): PortalTask | null {
  return (
    list.find((t) => /progress/i.test(t.status) && !t.isDone) ??
    list.find((t) => /block/i.test(t.status) && !t.isDone) ??
    list.find((t) => !t.isDone) ??
    list[0] ??
    null
  );
}

export function PortalHomeContent() {
  const { sectionFor, openDetail } = usePortalView();
  const { data, loading } = usePortalData();
  const configured = isConvexConfigured();
  const hostSlug =
    typeof window !== 'undefined' ? getHostSlugFromLocation() ?? undefined : undefined;
  const billingSummary = useQuery(
    api.billing.getSummary,
    configured && data.tenant.ok ? { hostSlug } : 'skip',
  );
  const activeSection = sectionFor('dashboard');
  const projects = data.projects;
  const tasks = data.tasks;
  const activity = data.activity;
  const title = SECTION_TITLE[activeSection] ?? 'Overview';

  // Dashboard is single-project: the client's current engagement.
  const featured = projects[0] ?? null;
  const projectTasks = featured
    ? tasks.filter((t) => t.projectId === featured.id)
    : [];
  const projectActivity = featured
    ? activity.filter((a) => a.projectId === featured.id)
    : [];
  const recentTask = pickRecentTask(projectTasks);
  const nextMilestone = featured
    ? {
        label: featured.status,
        due: featured.endDate,
        phase: featured.status,
      }
    : null;
  const openTasks = projectTasks.filter((t) => !t.isDone).length;
  const doingTasks = projectTasks.filter((t) => /progress/i.test(t.status) && !t.isDone).length;
  const blocked = projectTasks.filter((t) => /block/i.test(t.status) && !t.isDone).length;

  const rail = (
    <DashboardRail
      activity={projectActivity}
      loading={loading}
      phase={featured?.status ?? '—'}
      openTasks={openTasks}
      doingTasks={doingTasks}
      blocked={blocked}
      milestone={nextMilestone?.label ?? '—'}
      projectName={featured?.name ?? null}
      tenantMode={data.tenant.mode}
      clientName={data.tenant.clientName}
      billing={billingSummary as PortalBillingSummary | undefined}
      billingLoading={billingSummary === undefined}
    />
  );

  return (
    <PortalWorkspace
      eyebrow={tenantEyebrow(data.tenant, 'Dashboard')}
      title={title}
      hideHeader
      aside={rail}
    >
      {activeSection === 'overview' && (
        <PortalTilePane>
          <div className="flex h-full min-h-0 flex-col" style={{ gap: PORTAL_PANEL_GAP_VAR }}>
            {/* Preview: ambient blur bleeds outside; device clips inside the bevel */}
            <div
              className="relative min-h-0 shrink-0"
              style={{
                flex: '1.35 1 0',
                minHeight: '42%',
                // Allow glow to leak past the tile; device still clips inside Bevel.
                overflow: 'visible',
              }}
            >
              <PreviewAmbientBlur />
              <Bevel
                corners="br"
                radius={PORTAL_SURFACE_RADIUS}
                cut={2.5}
                shoulder={0.85}
                fill="transparent"
                stroke="var(--border)"
                className="relative z-[1] h-full min-h-0 overflow-hidden"
                style={{ padding: 0 }}
              >
                <DeviceMockup
                  title={featured?.name ?? 'Project preview'}
                  phase={featured?.status}
                />
                <div
                  className="relative z-[1] flex h-full min-h-[220px] flex-col justify-between"
                  style={{
                    padding: 'var(--s-6)',
                    // Soft left scrim keeps type readable over the device
                    background:
                      'linear-gradient(90deg, color-mix(in oklab, var(--bg) 72%, transparent) 0%, color-mix(in oklab, var(--bg) 35%, transparent) 42%, transparent 68%)',
                  }}
                >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p
                      className="ds-mono"
                      style={{
                        fontSize: 'var(--t-xs)',
                        letterSpacing: '0.16em',
                        textTransform: 'uppercase',
                        color: 'var(--muted)',
                      }}
                    >
                      Active project
                    </p>
                    <h2
                      className="type-display"
                      style={{
                        fontSize: 'clamp(1.75rem, 1.3rem + 1.8vw, 2.75rem)',
                        lineHeight: 1.05,
                        marginTop: 10,
                        maxWidth: '18ch',
                      }}
                    >
                      {featured?.name ?? (loading ? 'Loading…' : 'No active project')}
                    </h2>
                  </div>
                  {featured ? <Pill color={projectStatusColor(featured.status)}>{featured.status}</Pill> : null}
                </div>
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', maxWidth: 420 }}>
                      {featured
                        ? `End ${formatDue(featured.endDate)}${
                            featured.progress != null
                              ? ` · ${formatProgress(featured.progress)}`
                              : ''
                          }`
                        : 'Create a project to populate this preview.'}
                    </p>
                    {featured ? (
                      <p
                        className="ds-mono"
                        style={{ fontSize: 'var(--t-xs)', color: 'var(--faint)', marginTop: 8 }}
                      >
                        {featured.status}
                        {featured.stack.length ? ` · ${featured.stack.join(', ')}` : ''}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {featured ? (
                      <PrimaryButton
                        onClick={() =>
                          openDetail({
                            id: featured.id,
                            title: featured.name,
                            subtitle: featured.status,
                            body: <ProjectDetail project={featured} />,
                          })
                        }
                      >
                        Open project
                      </PrimaryButton>
                    ) : null}
                  </div>
                </div>
              </div>
              </Bevel>
            </div>

            {/* Project board — tasks / recent / next milestone for the active project */}
            <Bevel
              corners="br"
              radius={PORTAL_SURFACE_RADIUS}
              cut={2}
              shoulder={0.75}
              fill="var(--surface)"
              stroke="var(--border)"
              className="flex min-h-0 flex-1 flex-col overflow-hidden"
              style={{ padding: 0, minHeight: '28%' }}
            >
              <div
                className="flex shrink-0 items-center justify-between gap-3"
                style={{
                  padding: 'var(--s-4) var(--s-5)',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <div>
                  <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>
                    {featured?.status ?? 'Board'}
                  </p>
                  <p style={{ fontSize: 'var(--t-md)', fontWeight: 600, marginTop: 2 }}>
                    {featured ? featured.name : 'Project board'}
                  </p>
                </div>
                <span className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--faint)' }}>
                  {loading
                    ? '…'
                    : `${projectTasks.length} task${projectTasks.length === 1 ? '' : 's'}`}
                </span>
              </div>
              <div
                className="min-h-0 flex-1 overflow-y-auto"
                style={{ padding: 'var(--s-4) var(--s-5)' }}
              >
                {!featured && !loading ? (
                  <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>
                    No active project yet.
                  </p>
                ) : (
                  <div className="flex h-full min-h-0 flex-col gap-4 lg:flex-row">
                    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
                      <p
                        className="ds-mono shrink-0"
                        style={{
                          fontSize: 'var(--t-xs)',
                          letterSpacing: '0.12em',
                          textTransform: 'uppercase',
                          color: 'var(--muted)',
                        }}
                      >
                        Tasks
                      </p>
                      <div className="flex min-h-0 flex-col gap-2 overflow-y-auto">
                        {projectTasks.map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() =>
                              openDetail({
                                id: t.id,
                                title: t.name,
                                subtitle: `${t.status}${t.projectName ? ` · ${t.projectName}` : ''}`,
                                body: (
                                  <div className="flex flex-col gap-3">
                                    <Pill color={taskStatusColor(t.status, t.isDone)}>
                                      {t.status}
                                    </Pill>
                                    <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>
                                      Date {formatDue(t.date)}
                                      {featured ? ` · ${featured.name}` : ''}
                                    </p>
                                  </div>
                                ),
                              })
                            }
                            className="flex w-full items-center justify-between gap-3 text-left"
                            style={{
                              padding: '0.65rem 0.8rem',
                              borderRadius: 10,
                              border: '1px solid var(--border)',
                              background:
                                recentTask?.id === t.id
                                  ? 'color-mix(in oklab, var(--accent) 8%, var(--bg))'
                                  : 'color-mix(in oklab, var(--bg) 55%, transparent)',
                              cursor: 'pointer',
                            }}
                          >
                            <span className="min-w-0">
                              <span
                                className="block truncate"
                                style={{ fontSize: 'var(--t-sm)', fontWeight: 600 }}
                              >
                                {t.name}
                              </span>
                              <span
                                className="ds-mono block"
                                style={{ fontSize: 'var(--t-xs)', color: 'var(--faint)', marginTop: 3 }}
                              >
                                {formatDue(t.date)}
                              </span>
                            </span>
                            <Pill color={taskStatusColor(t.status, t.isDone)}>{t.status}</Pill>
                          </button>
                        ))}
                        {!loading && projectTasks.length === 0 && (
                          <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>
                            No tasks on this project yet.
                          </p>
                        )}
                      </div>
                    </div>

                    <div
                      className="flex w-full shrink-0 flex-col gap-3 lg:w-[240px]"
                      style={{
                        paddingTop: 2,
                      }}
                    >
                      <div
                        style={{
                          padding: '0.85rem 1rem',
                          borderRadius: 12,
                          border: '1px solid var(--border)',
                          background: 'color-mix(in oklab, var(--bg) 50%, transparent)',
                        }}
                      >
                        <p
                          className="ds-mono"
                          style={{
                            fontSize: 'var(--t-xs)',
                            letterSpacing: '0.12em',
                            textTransform: 'uppercase',
                            color: 'var(--muted)',
                          }}
                        >
                          Most recent
                        </p>
                        {recentTask ? (
                          <>
                            <p style={{ fontSize: 'var(--t-sm)', fontWeight: 600, marginTop: 8 }}>
                              {recentTask.name}
                            </p>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <Pill color={taskStatusColor(recentTask.status, recentTask.isDone)}>
                                {recentTask.status}
                              </Pill>
                              <span
                                className="ds-mono"
                                style={{ fontSize: 'var(--t-xs)', color: 'var(--faint)' }}
                              >
                                {formatDue(recentTask.date)}
                              </span>
                            </div>
                          </>
                        ) : (
                          <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', marginTop: 8 }}>
                            No recent task
                          </p>
                        )}
                      </div>

                      <div
                        style={{
                          padding: '0.85rem 1rem',
                          borderRadius: 12,
                          border: '1px solid var(--border)',
                          background: 'color-mix(in oklab, var(--bg) 50%, transparent)',
                          flex: 1,
                        }}
                      >
                        <p
                          className="ds-mono"
                          style={{
                            fontSize: 'var(--t-xs)',
                            letterSpacing: '0.12em',
                            textTransform: 'uppercase',
                            color: 'var(--muted)',
                          }}
                        >
                          Next milestone
                        </p>
                        {nextMilestone ? (
                          <>
                            <p style={{ fontSize: 'var(--t-sm)', fontWeight: 600, marginTop: 8 }}>
                              {nextMilestone.label}
                            </p>
                            <p
                              style={{
                                fontSize: 'var(--t-xs)',
                                color: 'var(--muted)',
                                marginTop: 6,
                              }}
                            >
                              From {nextMilestone.phase} · due {formatDue(nextMilestone.due)}
                            </p>
                            <div className="mt-3">
                              <Pill color={projectStatusColor(nextMilestone.label)}>
                                {nextMilestone.label}
                              </Pill>
                            </div>
                          </>
                        ) : (
                          <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', marginTop: 8 }}>
                            —
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </Bevel>
          </div>
        </PortalTilePane>
      )}
    </PortalWorkspace>
  );
}

function DashboardRail({
  activity,
  loading,
  phase,
  openTasks,
  doingTasks,
  blocked,
  milestone,
  projectName,
  tenantMode,
  clientName,
  billing,
  billingLoading,
}: {
  activity: {
    id: string;
    name: string;
    summary: string;
    timestamp: string;
    tone: string;
    projectId?: string | null;
  }[];
  loading: boolean;
  phase: string;
  openTasks: number;
  doingTasks: number;
  blocked: number;
  milestone: string;
  projectName: string | null;
  tenantMode: TenantMode;
  clientName: string | null;
  billing: PortalBillingSummary | undefined;
  billingLoading: boolean;
}) {
  const sub = billing?.subscription;
  const invoice = billing?.nextInvoice;
  const billingStatus = sub?.status ?? (billing?.hasBilling ? '—' : null);

  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-y-auto lg:overflow-hidden"
      style={{ gap: PORTAL_PANEL_GAP_VAR }}
    >
      <RailModule title="Status">
        <div className="grid grid-cols-2 gap-2">
          <StatusCell label="Phase" value={loading ? '…' : phase} />
          <StatusCell label="Open tasks" value={String(openTasks)} />
          <StatusCell label="In progress" value={String(doingTasks)} />
          <StatusCell
            label="Blocked"
            value={String(blocked)}
            tone={blocked > 0 ? 'var(--danger)' : undefined}
          />
        </div>
        <p
          className="ds-mono"
          style={{ fontSize: 'var(--t-xs)', color: 'var(--faint)', marginTop: 10 }}
        >
          {projectName ? `Project · ${projectName}` : 'No active project'}
          {tenantMode === 'client' && clientName ? ` · ${clientName}` : ''}
        </p>
        <p
          className="ds-mono"
          style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)', marginTop: 6 }}
        >
          Next · {milestone}
        </p>
      </RailModule>

      <RailModule title="Activity" className="min-h-0 flex-1">
        <div className="flex min-h-0 flex-col gap-2 overflow-y-auto">
          {activity.slice(0, 5).map((item) => (
            <div key={item.id} className="flex gap-2">
              <span
                className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ background: activityToneVar(item.tone) }}
              />
              <div className="min-w-0">
                <p style={{ fontSize: 'var(--t-sm)', fontWeight: 500, lineHeight: 1.3 }}>
                  {item.name}
                </p>
                <p
                  className="ds-mono"
                  style={{ fontSize: 'var(--t-xs)', color: 'var(--faint)', marginTop: 2 }}
                >
                  {formatTime(item.timestamp)} · {item.summary}
                </p>
              </div>
            </div>
          ))}
          {!loading && activity.length === 0 && (
            <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>No recent activity.</p>
          )}
        </div>
      </RailModule>

      <RailModule title="Billing">
        {billingLoading ? (
          <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>Loading…</p>
        ) : !billing?.hasBilling ? (
          <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>No billing on file.</p>
        ) : (
          <>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p style={{ fontSize: 'var(--t-sm)', fontWeight: 600 }}>
                  {sub?.planName ?? (tenantMode === 'client' ? 'Client plan' : 'Workspace')}
                </p>
                <p style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)', marginTop: 4 }}>
                  {sub?.cancelAtPeriodEnd
                    ? 'Cancels at period end'
                    : invoice
                      ? `${invoice.amountLabel} · ${invoice.status}`
                      : 'Stripe'}
                </p>
              </div>
              {billingStatus ? (
                <Pill
                  color={
                    billingStatus === 'active' || billingStatus === 'paid'
                      ? 'var(--success)'
                      : billingStatus === 'past_due' || billingStatus === 'open'
                        ? 'var(--warn)'
                        : 'var(--muted)'
                  }
                >
                  {billingStatus}
                </Pill>
              ) : null}
            </div>
            <div
              className="mt-3"
              style={{
                paddingTop: 10,
                borderTop: '1px solid var(--border)',
              }}
            >
              <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--faint)' }}>
                {invoice?.status === 'open' ? 'Next invoice' : 'Latest invoice'}
              </p>
              <p style={{ fontSize: 'var(--t-sm)', fontWeight: 600, marginTop: 2 }}>
                {invoice
                  ? `${invoice.amountLabel} · ${formatPortalDate(
                      invoice.periodEnd
                        ? new Date(invoice.periodEnd).toISOString().slice(0, 10)
                        : null,
                    )}`
                  : '—'}
              </p>
            </div>
          </>
        )}
      </RailModule>
    </div>
  );
}

function RailModule({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Bevel
      corners="bl"
      radius={PORTAL_SURFACE_RADIUS}
      cut={1.75}
      shoulder={0.6}
      fill="var(--surface)"
      stroke="var(--border)"
      className={className}
      style={{
        padding: 'var(--s-4)',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
      }}
    >
      <p
        className="ds-mono shrink-0"
        style={{
          fontSize: 'var(--t-xs)',
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: 'var(--muted)',
          marginBottom: 10,
        }}
      >
        {title}
      </p>
      <div className="min-h-0 flex-1">{children}</div>
    </Bevel>
  );
}

function StatusCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div
      style={{
        padding: '0.55rem 0.65rem',
        borderRadius: 10,
        border: '1px solid var(--border)',
        background: 'color-mix(in oklab, var(--bg) 50%, transparent)',
      }}
    >
      <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--faint)' }}>
        {label}
      </p>
      <p
        className="ds-mono"
        style={{ fontSize: 'var(--t-lg)', marginTop: 4, color: tone ?? 'var(--fg)' }}
      >
        {value}
      </p>
    </div>
  );
}

/**
 * Soft atmospheric blur centered on the preview tile.
 * Sits outside the Bevel so it can bleed past the rounded border.
 */
function PreviewAmbientBlur() {
  return (
    <div className="pointer-events-none absolute inset-0 z-0" aria-hidden>
      <div
        className="absolute"
        style={{
          left: '50%',
          top: '58%',
          width: 'min(92%, 560px)',
          height: 'min(88%, 420px)',
          transform: 'translate(-50%, -42%)',
          borderRadius: '50%',
          background: `
            radial-gradient(
              ellipse 70% 65% at 50% 45%,
              color-mix(in oklab, var(--accent) 38%, transparent) 0%,
              color-mix(in oklab, var(--info, var(--accent)) 22%, transparent) 35%,
              color-mix(in oklab, var(--fg) 8%, transparent) 62%,
              transparent 78%
            )
          `,
          filter: 'blur(42px)',
          opacity: 0.85,
        }}
      />
      <div
        className="absolute"
        style={{
          left: '50%',
          top: '62%',
          width: 'min(70%, 400px)',
          height: 'min(55%, 280px)',
          transform: 'translate(-50%, -30%)',
          borderRadius: '50%',
          background:
            'radial-gradient(circle at 50% 40%, color-mix(in oklab, var(--fg) 16%, transparent), transparent 70%)',
          filter: 'blur(28px)',
          opacity: 0.55,
        }}
      />
    </div>
  );
}

/** Laptop mockup — centered, dropped so the chassis clips at the tile bottom. */
function DeviceMockup({
  title,
  phase,
}: {
  title: string;
  phase?: string;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden>
      <div
        className="absolute"
        style={{
          left: '50%',
          // Sit low so the base/hinge is clipped by the tile edge
          top: '54%',
          width: 'min(62%, 440px)',
          transform: 'translate(-50%, -18%) rotate(-5deg)',
          filter: 'drop-shadow(0 28px 40px color-mix(in oklab, var(--ink, #000) 45%, transparent))',
        }}
      >
        {/* Lid / screen chassis */}
        <div
          style={{
            borderRadius: 14,
            border: '1px solid color-mix(in oklab, var(--fg) 22%, transparent)',
            background: 'color-mix(in oklab, var(--fg) 10%, var(--bg))',
            padding: 8,
            boxShadow: 'inset 0 0 0 1px color-mix(in oklab, var(--fg) 8%, transparent)',
          }}
        >
          <div
            style={{
              borderRadius: 8,
              overflow: 'hidden',
              aspectRatio: '16 / 10',
              background: 'var(--bg)',
              border: '1px solid color-mix(in oklab, var(--fg) 12%, transparent)',
              position: 'relative',
            }}
          >
            {/* Fake app chrome */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 10px',
                borderBottom: '1px solid color-mix(in oklab, var(--fg) 10%, transparent)',
                background: 'color-mix(in oklab, var(--surface) 80%, transparent)',
              }}
            >
              <span style={{ width: 7, height: 7, borderRadius: 999, background: 'color-mix(in oklab, var(--danger, #f66) 70%, transparent)' }} />
              <span style={{ width: 7, height: 7, borderRadius: 999, background: 'color-mix(in oklab, var(--warn, #fc0) 70%, transparent)' }} />
              <span style={{ width: 7, height: 7, borderRadius: 999, background: 'color-mix(in oklab, var(--success, #6c6) 70%, transparent)' }} />
              <span
                className="ds-mono"
                style={{
                  marginLeft: 8,
                  fontSize: 9,
                  color: 'var(--faint)',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                }}
              >
                warehaus.app
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '72px 1fr', height: 'calc(100% - 33px)' }}>
              <div
                style={{
                  borderRight: '1px solid color-mix(in oklab, var(--fg) 10%, transparent)',
                  padding: 8,
                  background: 'color-mix(in oklab, var(--surface) 55%, transparent)',
                }}
              >
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    style={{
                      height: 8,
                      borderRadius: 4,
                      marginBottom: 8,
                      width: i === 1 ? '88%' : `${55 + i * 8}%`,
                      background:
                        i === 1
                          ? 'color-mix(in oklab, var(--accent) 45%, transparent)'
                          : 'color-mix(in oklab, var(--fg) 12%, transparent)',
                    }}
                  />
                ))}
              </div>
              <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div
                  style={{
                    height: '42%',
                    borderRadius: 6,
                    background: `
                      linear-gradient(135deg,
                        color-mix(in oklab, var(--accent) 22%, transparent),
                        color-mix(in oklab, var(--fg) 8%, transparent) 55%,
                        transparent
                      ),
                      color-mix(in oklab, var(--surface) 70%, var(--bg))
                    `,
                    border: '1px solid color-mix(in oklab, var(--fg) 10%, transparent)',
                    padding: 10,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'flex-end',
                  }}
                >
                  <span
                    className="ds-mono"
                    style={{ fontSize: 8, color: 'var(--muted)', letterSpacing: '0.12em' }}
                  >
                    {phase ?? 'PROJECT'}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: 'var(--fg)',
                      marginTop: 4,
                      lineHeight: 1.2,
                      maxWidth: '16ch',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {title}
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, flex: 1 }}>
                  {[1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      style={{
                        borderRadius: 5,
                        border: '1px solid color-mix(in oklab, var(--fg) 10%, transparent)',
                        background: 'color-mix(in oklab, var(--surface) 60%, transparent)',
                        minHeight: 28,
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
        {/* Hinge / base */}
        <div
          style={{
            margin: '0 auto',
            width: '108%',
            marginLeft: '-4%',
            height: 10,
            borderRadius: '0 0 8px 8px',
            background:
              'linear-gradient(180deg, color-mix(in oklab, var(--fg) 18%, var(--bg)), color-mix(in oklab, var(--fg) 8%, var(--bg)))',
            border: '1px solid color-mix(in oklab, var(--fg) 16%, transparent)',
            borderTop: 'none',
          }}
        />
        <div
          style={{
            margin: '0 auto',
            width: '118%',
            marginLeft: '-9%',
            height: 4,
            borderRadius: '0 0 3px 3px',
            background: 'color-mix(in oklab, var(--fg) 14%, var(--bg))',
            opacity: 0.85,
          }}
        />
      </div>
    </div>
  );
}

function ProjectDetail({ project }: { project: PortalProject; mode?: TenantMode }) {
  const rows: [string, string][] = [
    ['Status', project.status],
    ['Progress', project.progress != null ? `${Math.round(project.progress * 100)}%` : '—'],
    ['End', formatDue(project.endDate)],
    ['Start', formatDue(project.startDate)],
  ];
  if (project.stack.length) rows.push(['Stack', project.stack.join(', ')]);

  return (
    <div className="flex flex-col gap-4">
      {project.description && (
        <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', lineHeight: 1.5 }}>
          {project.description}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        {rows.map(([k, v]) => (
          <div key={k}>
            <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--faint)' }}>
              {k}
            </p>
            <p style={{ fontSize: 'var(--t-sm)', fontWeight: 600, marginTop: 2 }}>{v}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
