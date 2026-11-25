'use client';

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useMutation } from 'convex/react';
import { useSearchParams } from 'next/navigation';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import {
  RUNNER_ADD_REPO,
  RUNNER_CONFIRM_HELPER,
  RUNNER_HEALTH_STATES,
  RUNNER_LIST_HELPER,
  RUNNER_MODAL_TITLE,
  RUNNER_PAIRED_HELPER,
  RUNNER_SERVES,
  RUNNER_SETUP_TITLE,
  agoLabel,
  runnerHealthCopy,
  runnerInstallCommand,
  runnerOutOfDateCopy,
  runnerRevokeHelper,
  runnerSetupCommand,
  type RunnerHealthRunner,
  type RunnerDot,
  type RunnerHealthCopy,
  type RunnerHealthState,
  type RunnerHealthView,
} from '@convex/_lib/runnerHealth';
import { PortalModal } from '@/components/ui/PortalModal';
import { OutlineButton, PrimaryButton } from '@/components/ui/primitives';
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
  const base = { production: true, protocolMin: 2 };
  if (state === 'no-repo') return { ...base, registeredCount: 0, repoSet: false, repo: null, runnerAllowed: false, runners: [], working: null, building: null };
  if (state === 'no-runner') return { ...base, registeredCount: 0, repoSet: true, repo: FIXTURE_REPO, runnerAllowed: false, runners: [], working: null, building: null };
  const fresh = state === 'ready' || state === 'working';
  return {
    ...base,
    registeredCount: 2,
    repoSet: true,
    repo: FIXTURE_REPO,
    runnerAllowed: true,
    runners: [
      { id: 'peter-mbp-prod', lastSeenAt: now - (fresh ? 4 * 60_000 : 2 * 60 * 60_000), registered: true, protocolVersion: 2 },
      { id: 'studio-mini-prod', lastSeenAt: now - 3 * 24 * 60 * 60_000, registered: true, protocolVersion: 2 },
    ],
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
 * The chip. Compact (dot and a short label) is what the header shows at every
 * width. Expanded is the full line: dot, label and meta. At 1440 it shows on
 * hover or focus, floating over the compact chip so nothing reflows. A phone
 * has no hover: tapping opens the modal. Pressing either opens the modal. On
 * Not set up the Add repo link is its own control on the expanded line.
 */
export function RunnerStatusChip({
  copy,
  compact = false,
  onOpen,
  onAddRepo,
  floating = false,
}: {
  copy: RunnerHealthCopy;
  compact?: boolean;
  onOpen?: () => void;
  onAddRepo?: () => void;
  /** The floating hover line: surface fill and the elevated shadow. */
  floating?: boolean;
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
        ...(floating ? { background: 'var(--surface-elevated)', boxShadow: '0 8px 24px rgba(0, 0, 0, 0.24)' } : {}),
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

function Field({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
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

function Heading({ dot, label, tone }: { dot: RunnerDot; label: string; tone?: string }) {
  return (
    <div className="flex items-center" style={{ gap: 8 }}>
      <RunnerDotGlyph dot={dot} />
      <span style={{ fontSize: 16, fontWeight: 600, lineHeight: 'normal', color: tone ?? 'var(--fg)' }}>{label}</span>
    </div>
  );
}

function Helper({ children, tone }: { children: ReactNode; tone?: string }) {
  return (
    <p data-testid="runner-status-helper" style={{ margin: 0, fontSize: 14, lineHeight: 'normal', color: tone ?? 'var(--muted)' }}>
      {children}
    </p>
  );
}

function Stack({ step, children }: { step: RunnerModalStep; children: ReactNode }) {
  return (
    <div data-testid="runner-status-body" data-runner-step={step} className="flex flex-col" style={{ gap: 16, fontFamily: 'var(--font-geist), var(--font-body)' }}>
      {children}
    </div>
  );
}

/** The Input in RunnerStatus / Body: surface-2 fill, a 2px ring border, 16 radius, 14/21 mono. */
const inputStyle: CSSProperties = {
  boxSizing: 'border-box',
  width: '100%',
  padding: '10px 12px',
  borderRadius: 16,
  border: '2px solid var(--ring)',
  background: 'var(--surface-2)',
  color: 'var(--fg)',
  fontSize: 14,
  lineHeight: '21px',
};

function TextField({
  label,
  value,
  onChange,
  placeholder,
  testId,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  testId: string;
  autoFocus?: boolean;
}) {
  return (
    <label className="flex flex-col" style={{ gap: 8 }}>
      <span style={{ fontSize: 14, lineHeight: '21px', color: 'var(--fg)' }}>{label}</span>
      <input
        className="ds-mono"
        data-testid={testId}
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
        style={inputStyle}
      />
    </label>
  );
}

function Actions({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center" style={{ gap: 8 }}>
      {children}
    </div>
  );
}

/** Why the button beside it is disabled. Read out with the button, and gone once it is enabled. */
function DisabledHint({ id, children }: { id: string; children: ReactNode }) {
  return (
    <span id={id} data-testid="runner-disabled-hint" style={{ fontSize: 12, lineHeight: 'normal', color: 'var(--muted)' }}>
      {children}
    </span>
  );
}

export const RUNNER_PAIR_HINT = 'Enter the 8-character code to pair.';
export const RUNNER_CONFIRM_HINT = 'Enter a runner id to pair.';

function DangerButton({ children, onClick, disabled, testId }: { children: ReactNode; onClick: () => void; disabled?: boolean; testId: string }) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      disabled={disabled}
      className={FOCUS}
      style={{
        height: 32,
        padding: '0 12px',
        borderRadius: 8,
        border: '1px solid var(--danger, #e5484d)',
        background: 'none',
        color: 'var(--danger, #e5484d)',
        fontSize: 12,
        fontWeight: 500,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.55 : 1,
      }}
    >
      {children}
    </button>
  );
}

/** Steps of the set-up and runner list flow inside the one Runner status modal. */
export const RUNNER_MODAL_STEPS = ['status', 'setup', 'confirm', 'paired', 'runners', 'revoke'] as const;
export type RunnerModalStep = (typeof RUNNER_MODAL_STEPS)[number];

export function runnerModalStep(value: string | null | undefined): RunnerModalStep | null {
  return RUNNER_MODAL_STEPS.find((step) => step === value) ?? null;
}

/** Not set up with a repository: the command, and a field for the code it prints. */
export function RunnerSetupBody({
  production,
  code,
  onCode,
  onPair,
  error,
}: {
  production: boolean;
  code: string;
  onCode: (value: string) => void;
  onPair: () => void;
  error?: string | null;
}) {
  const incomplete = code.replace(/[\s-]/g, '').length !== 8;
  return (
    <Stack step="setup">
      <Heading dot="unset" label={RUNNER_SETUP_TITLE} />
      <Field label="ON THE MAC THAT WILL RUN WORK" value={runnerSetupCommand(production)} mono />
      <TextField label="Pairing code" value={code} onChange={onCode} placeholder="K7QM-4XPA" testId="runner-pairing-code" autoFocus />
      <Helper tone={error ? 'var(--warning)' : undefined}>
        {error ?? "The command prints an 8-character code. Enter it here to pair that Mac. Its secret goes straight to the Mac's Keychain and is never shown."}
      </Helper>
      <Actions>
        <span className="inline-flex" aria-describedby={incomplete ? 'runner-pair-hint' : undefined}>
          <PrimaryButton testId="runner-pair" onClick={onPair} disabled={incomplete}>
            Pair runner
          </PrimaryButton>
        </span>
        {incomplete ? <DisabledHint id="runner-pair-hint">{RUNNER_PAIR_HINT}</DisabledHint> : null}
      </Actions>
    </Stack>
  );
}

export function RunnerConfirmBody({
  code,
  production,
  runnerId,
  onRunnerId,
  onCancel,
  onConfirm,
  busy,
  error,
}: {
  code: string;
  production: boolean;
  runnerId: string;
  onRunnerId: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  busy?: boolean;
  error?: string | null;
}) {
  const empty = !runnerId.trim();
  return (
    <Stack step="confirm">
      <Heading dot="ready" label="Confirm this runner" />
      <div className="flex flex-col" style={{ gap: 12 }}>
        <Field label="CODE" value={code} mono />
        <Field label="DEPLOYMENT" value={production ? 'Production' : 'Shared dev'} />
      </div>
      <TextField label="Runner id" value={runnerId} onChange={onRunnerId} testId="runner-confirm-id" />
      <Helper tone={error ? 'var(--warning)' : undefined}>{error ?? RUNNER_CONFIRM_HELPER}</Helper>
      <Actions>
        <OutlineButton testId="runner-confirm-cancel" onClick={onCancel}>
          Cancel
        </OutlineButton>
        <span className="inline-flex" aria-describedby={empty ? 'runner-confirm-hint' : undefined}>
          <PrimaryButton testId="runner-confirm" onClick={onConfirm} disabled={busy || empty}>
            Confirm and pair
          </PrimaryButton>
        </span>
        {empty ? <DisabledHint id="runner-confirm-hint">{RUNNER_CONFIRM_HINT}</DisabledHint> : null}
      </Actions>
    </Stack>
  );
}

export function RunnerPairedBody({
  runnerId,
  lastSeen,
  production,
  onDone,
}: {
  runnerId: string;
  lastSeen: string;
  production: boolean;
  onDone: () => void;
}) {
  return (
    <Stack step="paired">
      <Heading dot="ready" label="Runner paired" />
      <div className="flex flex-col" style={{ gap: 12 }}>
        <Field label="RUNNER" value={runnerId} />
        <Field label="LAST SEEN" value={lastSeen} />
        <Field label="SERVES" value={RUNNER_SERVES} />
        <Field label="KEEP IT RUNNING" value={runnerInstallCommand(production)} mono />
      </div>
      <Helper>{RUNNER_PAIRED_HELPER}</Helper>
      <Actions>
        <PrimaryButton testId="runner-paired-done" onClick={onDone}>
          Done
        </PrimaryButton>
      </Actions>
    </Stack>
  );
}

export function RunnerListBody({
  copy,
  runners,
  production,
  now,
  onRevoke,
  onPairAnother,
}: {
  copy: RunnerHealthCopy;
  runners: RunnerHealthRunner[];
  production: boolean;
  now: number;
  onRevoke: (runnerId: string) => void;
  onPairAnother: () => void;
}) {
  const registered = runners.filter((runner) => runner.registered);
  return (
    <Stack step="runners">
      <Heading dot={copy.dot} label={copy.label} tone={copy.warning ? 'var(--warning)' : undefined} />
      <Field label={`RUNNERS ON ${production ? 'PRODUCTION' : 'SHARED DEV'}`} value={`${registered.length} registered`} />
      <ul className="flex flex-col" style={{ gap: 12, margin: 0, padding: 0, listStyle: 'none' }}>
        {registered.map((runner) => (
          <li key={runner.id} data-testid="runner-list-row" className="flex items-center justify-between" style={{ gap: 12 }}>
            <span className="flex flex-col" style={{ gap: 2, minWidth: 0 }}>
              <span style={{ fontSize: 14, color: 'var(--fg)', overflowWrap: 'anywhere' }}>{runner.id}</span>
              <span className="ds-mono" style={{ fontSize: 10, color: 'var(--muted)' }}>
                SEEN {runner.lastSeenAt != null ? agoLabel(runner.lastSeenAt, now).toUpperCase() : 'NEVER'}
              </span>
            </span>
            <button type="button" data-testid="runner-list-revoke" onClick={() => onRevoke(runner.id)} className={FOCUS} style={{ ...plainButton, fontSize: 12, color: 'var(--muted)' }}>
              Revoke
            </button>
          </li>
        ))}
      </ul>
      <Helper>{RUNNER_LIST_HELPER}</Helper>
      <Actions>
        <OutlineButton testId="runner-pair-another" onClick={onPairAnother}>
          Pair another runner
        </OutlineButton>
      </Actions>
    </Stack>
  );
}

export function RunnerRevokeBody({
  runner,
  now,
  lastRunner,
  production,
  onCancel,
  onRevoke,
  busy,
}: {
  runner: RunnerHealthRunner;
  now: number;
  lastRunner: boolean;
  production: boolean;
  onCancel: () => void;
  onRevoke: () => void;
  busy?: boolean;
}) {
  return (
    <Stack step="revoke">
      <Heading dot="warning" label={`Revoke ${runner.id}?`} />
      <div className="flex flex-col" style={{ gap: 12 }}>
        <Field label="RUNNER" value={runner.id} />
        <Field label="LAST SEEN" value={runner.lastSeenAt != null ? agoLabel(runner.lastSeenAt, now) : '—'} />
      </div>
      <Helper>{runnerRevokeHelper(lastRunner, production)}</Helper>
      <Actions>
        <OutlineButton testId="runner-revoke-cancel" onClick={onCancel}>
          Cancel
        </OutlineButton>
        <DangerButton testId="runner-revoke" onClick={onRevoke} disabled={busy}>
          Revoke runner
        </DangerButton>
      </Actions>
    </Stack>
  );
}

export function RunnerOutOfDateBody({ view, now }: { view: RunnerHealthView; now: number }) {
  const copy = runnerOutOfDateCopy(view, now);
  if (!copy) return null;
  return (
    <Stack step="status">
      <Heading dot="warning" label="Runner out of date" tone="var(--warning)" />
      <div className="flex flex-col" style={{ gap: 12 }}>
        <Field label="RUNNER" value={copy.runner} />
        <Field label="LAST SEEN" value={copy.lastSeen} />
        <Field label="VERSION" value={copy.version} />
        <Field label="UPDATE" value={copy.update} mono />
      </div>
      <Helper tone="var(--warning)">{copy.helper}</Helper>
    </Stack>
  );
}

/** Modal content: status, the fields, the start command while offline, and the helper line. */
export function RunnerStatusBody({ copy, onManage }: { copy: RunnerHealthCopy; onManage?: () => void }) {
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
      {onManage ? (
        <Actions>
          <OutlineButton testId="runner-manage" onClick={onManage}>
            Manage runners
          </OutlineButton>
        </Actions>
      ) : null}
    </div>
  );
}

/** The Runner status A1 modal: centered 520 at desktop, a bottom sheet on a phone. */
export function RunnerStatusModal({
  copy,
  narrow,
  onClose,
  onAddRepo,
  children,
}: {
  copy: RunnerHealthCopy;
  narrow: boolean;
  onClose: () => void;
  onAddRepo?: () => void;
  /** A set-up or runner list step. Without it the modal shows the status body. */
  children?: ReactNode;
}) {
  const addRepo = !children && copy.state === 'no-repo' && onAddRepo != null;
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
      {children ?? <RunnerStatusBody copy={copy} />}
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

type PairingFound = { code: string; proposedRunnerId: string; expiresAt: number; production: boolean };
type Outcome = { ok: true; runnerId?: string } | { ok: false; error: string };

const FIXTURE_PAIRING: PairingFound = { code: 'K7QM-4XPA', proposedRunnerId: 'peter-mbp-prod', expiresAt: 0, production: true };

/**
 * The runner id to put in the confirm field, or null to leave it alone. The
 * proposed id fills the field once for each pairing code, so an id the staff
 * member clears or retypes stays as they left it.
 */
export function runnerIdPrefill({
  step,
  found,
  filledFor,
}: {
  step: RunnerModalStep;
  found: { code: string; proposedRunnerId: string } | null | undefined;
  /** The code the field was last filled for. */
  filledFor: string | null;
}): string | null {
  if (step !== 'confirm' || !found || filledFor === found.code) return null;
  return found.proposedRunnerId;
}

/** Whether the expanded line shows. Only at 1440, on hover or while focus is inside the chip. */
export function runnerChipExpanded({ hover, hovered, focused }: { hover: boolean; hovered: boolean; focused: boolean }): boolean {
  return hover && (hovered || focused);
}

/**
 * The compact chip, and at 1440 the expanded line floating over it on hover
 * or keyboard focus. The wrapper keeps the compact chip's size, so the
 * heading never reflows.
 *
 * The compact chip hides while the line is expanded, and a hidden button
 * cannot hold focus. So when Tab lands on the compact chip, focus moves to
 * the expanded line's button, where Enter opens the modal. When a modal
 * opened by keyboard closes, focus comes back to the chip.
 */
function HoverChip({
  copy,
  hover,
  modalOpen = false,
  onOpen,
  onAddRepo,
}: {
  copy: RunnerHealthCopy;
  hover: boolean;
  modalOpen?: boolean;
  onOpen: () => void;
  onAddRepo?: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const compactRef = useRef<HTMLSpanElement>(null);
  const expandedRef = useRef<HTMLSpanElement>(null);
  const openedByKeyboard = useRef(false);
  const wasModalOpen = useRef(modalOpen);
  const shown = runnerChipExpanded({ hover, hovered, focused });

  // Before paint, so the browser never drops focus from the hidden compact chip.
  useLayoutEffect(() => {
    if (shown && compactRef.current?.contains(document.activeElement)) {
      expandedRef.current?.querySelector<HTMLElement>('button')?.focus();
    }
  }, [shown]);

  // The expanded line unmounts as focus enters the modal, so the modal has
  // nothing to hand focus back to. Focus the compact chip; it expands again.
  useEffect(() => {
    if (wasModalOpen.current && !modalOpen && openedByKeyboard.current) {
      openedByKeyboard.current = false;
      compactRef.current?.querySelector<HTMLElement>('button')?.focus();
    }
    wasModalOpen.current = modalOpen;
  }, [modalOpen]);

  return (
    <span
      data-testid="runner-status-hover"
      style={{ position: 'relative', display: 'inline-flex', minWidth: 0 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => (event.currentTarget.contains(event.relatedTarget as Node | null) ? undefined : setFocused(false))}
      // A click with no pointer behind it (detail 0) is Enter or Space.
      onClickCapture={(event) => {
        openedByKeyboard.current = event.detail === 0;
      }}
    >
      <span ref={compactRef} style={{ visibility: shown ? 'hidden' : 'visible', display: 'inline-flex', minWidth: 0 }}>
        <RunnerStatusChip copy={copy} compact onOpen={onOpen} />
      </span>
      {shown ? (
        <span ref={expandedRef} style={{ position: 'absolute', top: 0, right: 0, zIndex: 20, display: 'inline-flex' }}>
          <RunnerStatusChip copy={copy} floating onOpen={onOpen} onAddRepo={onAddRepo} />
        </span>
      ) : null}
    </span>
  );
}

/**
 * Staff-only runner health on the project header. One reactive query for the
 * chip; the pairing lookup runs only while staff confirm a code. The relative
 * times move on a local clock. Fixture previews read `?runner=` and
 * `?runnerModal=` (a step name or `open`) and make no query. Renders nothing
 * for a client, while loading, or when the deployment has no such query yet.
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
  const [step, setStep] = useState<RunnerModalStep>('status');
  const [code, setCode] = useState('');
  const [runnerId, setRunnerId] = useState('');
  const [pairedId, setPairedId] = useState('');
  const [revoking, setRevoking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fixtureOpened, setFixtureOpened] = useState(false);
  const querying = staff && live && !fixtures;
  const query = useSafeQuery<RunnerHealthView | null>(api.agent.runnerHealth, querying ? { projectId: projectId as Id<'projects'>, hostSlug } : 'skip');
  const pairing = useSafeQuery<PairingFound | null>(api.runners.findPairing, querying && open && step === 'confirm' ? { code, hostSlug } : 'skip');
  const confirm = useMutation(api.runners.confirmPairing);
  const revoke = useMutation(api.runners.revokeRunner);
  const fixtureStep = fixtures ? params.get('runnerModal') : null;
  useEffect(() => {
    if (!fixtureStep || fixtureOpened) return;
    setOpen(true);
    setStep(runnerModalStep(fixtureStep) ?? 'status');
    if (fixtureStep === 'confirm') {
      setCode(FIXTURE_PAIRING.code);
      setRunnerId(FIXTURE_PAIRING.proposedRunnerId);
    }
    if (fixtureStep === 'paired') setPairedId('peter-mbp-prod');
    if (fixtureStep === 'revoke') setRevoking('peter-mbp-prod');
    setFixtureOpened(true);
  }, [fixtureStep, fixtureOpened]);
  const found = fixtures ? FIXTURE_PAIRING : pairing.data;
  const filledFor = useRef<string | null>(null);
  useEffect(() => {
    // Leaving the confirm step forgets the fill, so the next pairing starts from its own proposed id.
    if (step !== 'confirm') {
      filledFor.current = null;
      return;
    }
    const proposed = runnerIdPrefill({ step, found, filledFor: filledFor.current });
    if (proposed == null || !found) return;
    filledFor.current = found.code;
    setRunnerId(proposed);
  }, [step, found]);

  if (!staff || now == null) return null;
  const view = fixtures ? runnerHealthFixture(runnerFixtureState(params.get('runner')), now) : query.data;
  if (!view) return null;
  const copy = runnerHealthCopy(view, now);
  const close = () => {
    setOpen(false);
    setStep('status');
    setCode('');
    setRunnerId('');
    setError(null);
  };
  const addRepo = onAddRepo
    ? () => {
        close();
        onAddRepo();
      }
    : undefined;
  const go = (next: RunnerModalStep) => {
    setError(null);
    setStep(next);
  };
  const run = async (action: () => Promise<Outcome>, onOk: (result: Outcome & { ok: true }) => void) => {
    if (busy) return;
    setBusy(true);
    try {
      const result = fixtures ? ({ ok: true } as Outcome) : await action();
      if (result.ok) onOk(result);
      else setError(result.error);
    } catch (failed) {
      setError(failed instanceof Error ? failed.message : 'That did not work. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const registered = view.runners.filter((runner) => runner.registered);
  const pairedRunner = view.runners.find((runner) => runner.id === pairedId);
  const revokeTarget = view.runners.find((runner) => runner.id === revoking);
  let body: ReactNode = null;
  if (step === 'setup' || (step === 'status' && copy.state === 'no-runner')) {
    body = <RunnerSetupBody production={view.production} code={code} onCode={setCode} onPair={() => go('confirm')} error={error} />;
  } else if (step === 'confirm') {
    body =
      found === null && !fixtures ? (
        <RunnerSetupBody production={view.production} code={code} onCode={setCode} onPair={() => go('confirm')} error="No open pairing has that code. Codes expire after 10 minutes." />
      ) : (
        <RunnerConfirmBody
          code={found?.code ?? code}
          production={found?.production ?? view.production}
          runnerId={runnerId}
          onRunnerId={setRunnerId}
          onCancel={() => go('setup')}
          busy={busy || !found}
          error={error}
          onConfirm={() =>
            run(
              () => confirm({ code, runnerId: runnerId.trim().toLowerCase(), hostSlug }) as Promise<Outcome>,
              (result) => {
                setPairedId(result.runnerId ?? runnerId.trim().toLowerCase());
                go('paired');
              },
            )
          }
        />
      );
  } else if (step === 'paired') {
    const seen = pairedRunner?.lastSeenAt != null ? agoLabel(pairedRunner.lastSeenAt, now) : 'Not seen yet';
    body = <RunnerPairedBody runnerId={pairedId} lastSeen={seen} production={view.production} onDone={close} />;
  } else if (step === 'runners') {
    body = (
      <RunnerListBody
        copy={copy}
        runners={view.runners}
        production={view.production}
        now={now}
        onRevoke={(id) => {
          setRevoking(id);
          go('revoke');
        }}
        onPairAnother={() => go('setup')}
      />
    );
  } else if (step === 'revoke' && revokeTarget) {
    body = (
      <RunnerRevokeBody
        runner={revokeTarget}
        now={now}
        lastRunner={registered.length <= 1}
        production={view.production}
        busy={busy}
        onCancel={() => go('runners')}
        onRevoke={() => run(() => revoke({ runnerId: revokeTarget.id, hostSlug }) as Promise<Outcome>, () => go('runners'))}
      />
    );
  } else if (runnerOutOfDateCopy(view, now)) {
    body = <RunnerOutOfDateBody view={view} now={now} />;
  } else if (registered.length > 0) {
    body = <RunnerStatusBody copy={copy} onManage={() => go('runners')} />;
  }
  return (
    <>
      <HoverChip copy={copy} hover={!phone} modalOpen={open} onOpen={() => setOpen(true)} onAddRepo={addRepo} />
      {open ? (
        <RunnerStatusModal copy={copy} narrow={narrow} onClose={close} onAddRepo={addRepo}>
          {body}
        </RunnerStatusModal>
      ) : null}
    </>
  );
}
