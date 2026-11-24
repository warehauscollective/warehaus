'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import {
  RUNNER_ADD_REPO,
  RUNNER_HEALTH_STATES,
  RUNNER_MODAL_TITLE,
  runnerHealthCopy,
  type RunnerDot,
  type RunnerHealthCopy,
  type RunnerHealthState,
  type RunnerHealthView,
} from '@convex/_lib/runnerHealth';
import { PortalModal } from '@/components/ui/PortalModal';
import { PrimaryButton } from '@/components/ui/primitives';
import { useSafeQuery } from '@/hooks/useSafeQuery';
import { useMaxWidth } from '@/lib/design/useMaxWidth';

/** How often the relative times are recomputed. No Convex read: only the clock moves. */
export const RUNNER_CLOCK_MS = 20_000;

const FIXTURE_MILESTONE = { milestoneId: 'm-launch', milestoneName: 'Client experience launch' };
const FIXTURE_REPO = 'warehauscollective/warehaus';

/** `?runner=` on a fixture preview. Anything else reads as Ready, the state on the project frames. */
export function runnerFixtureState(value: string | null | undefined): RunnerHealthState {
  return RUNNER_HEALTH_STATES.find((state) => state === value) ?? 'ready';
}

/** Fixture data for one state. Times are offsets from `now`, so the copy matches the frames. */
export function runnerHealthFixture(state: RunnerHealthState, now: number): RunnerHealthView {
  if (state === 'no-repo') return { repoSet: false, repo: null, production: true, runnerAllowed: false, runners: [], working: null, building: null };
  if (state === 'no-runner') return { repoSet: true, repo: FIXTURE_REPO, production: true, runnerAllowed: false, runners: [], working: null, building: null };
  const fresh = state === 'ready' || state === 'working';
  return {
    repoSet: true,
    repo: FIXTURE_REPO,
    production: true,
    runnerAllowed: true,
    runners: [{ id: 'peter-mbp-prod', lastSeenAt: now - (fresh ? 4 * 60_000 : 2 * 60 * 60_000) }],
    working: state === 'working' ? FIXTURE_MILESTONE : null,
    building: state === 'offline-building' ? FIXTURE_MILESTONE : null,
  };
}

const DOT_COLOR: Record<RunnerDot, string> = {
  ready: 'var(--success)',
  warning: 'var(--warning)',
  offline: 'var(--muted)',
  unset: 'var(--muted)',
};

/** 12px ring with an 8px core. Not set up is the ring alone. */
function RunnerDotGlyph({ dot }: { dot: RunnerDot }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
      data-runner-dot={dot}
      style={{ display: 'block', flex: '0 0 auto', color: DOT_COLOR[dot] }}
    >
      <circle cx="6" cy="6" r="5.25" strokeWidth="1.5" stroke="currentColor" />
      {dot === 'unset' ? null : <circle cx="6" cy="6" r="4" fill="currentColor" />}
    </svg>
  );
}

const plainButton: CSSProperties = {
  background: 'none',
  border: 0,
  padding: 0,
  margin: 0,
  font: 'inherit',
  color: 'inherit',
  cursor: 'pointer',
  borderRadius: 999,
  display: 'inline-flex',
  alignItems: 'center',
  lineHeight: 'normal',
};

const FOCUS =
  'focus-visible:[--tw-outline-style:solid] focus-visible:outline-2 focus-visible:outline-[var(--fg)] focus-visible:outline-offset-4';

/**
 * The chip. Default is the 1440 header chip: dot, label, and a meta line.
 * Compact is the 390 chip: dot and a short label. Pressing it opens the modal.
 * On Not set up the Add repo link is its own control beside it.
 */
export function RunnerStatusChip({
  copy,
  compact = false,
  onOpen,
  onAddRepo,
}: {
  copy: RunnerHealthCopy;
  compact?: boolean;
  onOpen?: () => void;
  onAddRepo?: () => void;
}) {
  const link = !compact && copy.state === 'no-repo' && onAddRepo != null;
  const label = compact ? copy.compactLabel : copy.label;
  const labelColor = copy.warning ? 'var(--warning)' : 'var(--fg)';
  const meta = (
    <span
      className={copy.state === 'no-repo' ? undefined : 'ds-mono'}
      style={
        copy.state === 'no-repo'
          ? { fontSize: 12, fontWeight: 500, lineHeight: 'normal', color: 'var(--accent)', whiteSpace: 'nowrap' }
          : { fontSize: 11, fontWeight: 400, lineHeight: 'normal', color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }
      }
    >
      {copy.meta}
    </span>
  );
  const separator = (
    <span aria-hidden="true" style={{ fontSize: 12, lineHeight: 'normal', color: 'var(--muted)' }}>
      ·
    </span>
  );
  return (
    <span
      data-testid="runner-status-chip"
      data-runner-state={copy.state}
      data-size={compact ? 'compact' : 'default'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        boxSizing: 'border-box',
        maxWidth: '100%',
        minWidth: 0,
        padding: '4px 8px',
        borderRadius: 999,
        border: `1px solid ${copy.warning ? 'var(--warning)' : 'var(--border)'}`,
        fontFamily: 'var(--font-geist), var(--font-body)',
      }}
    >
      <button
        type="button"
        data-testid="runner-status-open"
        aria-haspopup="dialog"
        aria-label={`${copy.label}. ${link ? '' : `${copy.meta}. `}Open runner status`}
        onClick={onOpen}
        className={FOCUS}
        style={{ ...plainButton, gap: 4, minWidth: 0 }}
      >
        <RunnerDotGlyph dot={copy.dot} />
        <span style={{ fontSize: 12, fontWeight: 500, lineHeight: 'normal', color: labelColor, whiteSpace: 'nowrap' }}>{label}</span>
        {compact || link ? null : (
          <>
            {separator}
            {meta}
          </>
        )}
      </button>
      {link ? (
        <>
          {separator}
          <button type="button" data-testid="runner-status-add-repo" onClick={onAddRepo} className={FOCUS} style={plainButton}>
            {meta}
          </button>
        </>
      ) : null}
    </span>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col" style={{ gap: 4 }}>
      <span className="ds-mono" style={{ fontSize: 10, lineHeight: 'normal', color: 'var(--muted)' }}>
        {label}
      </span>
      <span
        className={mono ? 'ds-mono' : undefined}
        style={{ fontSize: mono ? 12 : 14, lineHeight: mono ? '18px' : 'normal', color: 'var(--fg)', overflowWrap: 'anywhere', userSelect: mono ? 'all' : undefined }}
      >
        {value}
      </span>
    </div>
  );
}

/** Modal content: status, the fields, the start command while offline, and the helper line. */
export function RunnerStatusBody({ copy }: { copy: RunnerHealthCopy }) {
  const tone = copy.warning ? 'var(--warning)' : undefined;
  return (
    <div data-testid="runner-status-body" data-runner-state={copy.state} className="flex flex-col" style={{ gap: 16, fontFamily: 'var(--font-geist), var(--font-body)' }}>
      <div className="flex items-center" style={{ gap: 8 }}>
        <RunnerDotGlyph dot={copy.dot} />
        <span style={{ fontSize: 16, fontWeight: 600, lineHeight: 'normal', color: tone ?? 'var(--fg)' }}>{copy.label}</span>
      </div>
      <div className="flex flex-col" style={{ gap: 12 }}>
        <Field label="RUNNER" value={copy.runner} />
        <Field label="LAST SEEN" value={copy.lastSeen} />
        <Field label="MILESTONE" value={copy.milestone} />
        {copy.startCommand ? <Field label="START COMMAND" value={copy.startCommand} mono /> : null}
      </div>
      <p data-testid="runner-status-helper" style={{ margin: 0, fontSize: 14, lineHeight: 'normal', color: tone ?? 'var(--muted)' }}>
        {copy.helper}
      </p>
    </div>
  );
}

/** The Runner status A1 modal: centered 520 at desktop, a bottom sheet on a phone. */
export function RunnerStatusModal({
  copy,
  narrow,
  onClose,
  onAddRepo,
}: {
  copy: RunnerHealthCopy;
  narrow: boolean;
  onClose: () => void;
  onAddRepo?: () => void;
}) {
  const addRepo = copy.state === 'no-repo' && onAddRepo != null;
  return (
    <PortalModal
      testId="runner-status-dialog"
      scrimTestId="runner-status-scrim"
      label={RUNNER_MODAL_TITLE}
      header="default"
      width={520}
      narrow={narrow}
      sheet={narrow ? 'bottom' : 'center'}
      onClose={onClose}
      panelStyle={{ padding: addRepo ? '8px 24px' : '8px 24px 24px' }}
      footer={
        addRepo ? (
          <div className="flex justify-end">
            <PrimaryButton testId="runner-status-modal-add-repo" onClick={onAddRepo}>
              {RUNNER_ADD_REPO}
            </PrimaryButton>
          </div>
        ) : undefined
      }
    >
      <RunnerStatusBody copy={copy} />
    </PortalModal>
  );
}

/** The clock, read after mount so the server and first client render match. */
function useClock(intervalMs: number): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/**
 * Staff-only runner health on the project header. One reactive query. The
 * relative times move on a local clock. Fixture previews read `?runner=` and
 * make no query. Renders nothing for a client, while loading, or when the
 * deployment has no such query yet.
 */
export function RunnerHealth({
  projectId,
  staff,
  fixtures,
  live,
  hostSlug,
  onAddRepo,
}: {
  projectId: string;
  staff: boolean;
  fixtures: boolean;
  live: boolean;
  hostSlug?: string;
  onAddRepo?: () => void;
}) {
  const params = useSearchParams();
  const phone = useMaxWidth(1023);
  const narrow = useMaxWidth(767);
  const now = useClock(RUNNER_CLOCK_MS);
  const [open, setOpen] = useState(false);
  const [fixtureOpened, setFixtureOpened] = useState(false);
  const query = useSafeQuery<RunnerHealthView | null>(
    api.agent.runnerHealth,
    staff && live && !fixtures ? { projectId: projectId as Id<'projects'>, hostSlug } : 'skip',
  );
  const fixtureModal = fixtures && params.get('runnerModal') === 'open';
  useEffect(() => {
    if (!fixtureModal || fixtureOpened) return;
    setOpen(true);
    setFixtureOpened(true);
  }, [fixtureModal, fixtureOpened]);

  if (!staff || now == null) return null;
  const view = fixtures ? runnerHealthFixture(runnerFixtureState(params.get('runner')), now) : query.data;
  if (!view) return null;
  const copy = runnerHealthCopy(view, now);
  const addRepo = onAddRepo
    ? () => {
        setOpen(false);
        onAddRepo();
      }
    : undefined;
  return (
    <>
      <RunnerStatusChip copy={copy} compact={phone} onOpen={() => setOpen(true)} onAddRepo={addRepo} />
      {open ? <RunnerStatusModal copy={copy} narrow={narrow} onClose={() => setOpen(false)} onAddRepo={addRepo} /> : null}
    </>
  );
}
