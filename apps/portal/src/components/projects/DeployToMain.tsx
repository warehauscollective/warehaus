'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation } from 'convex/react';
import { useSearchParams } from 'next/navigation';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import {
  deployChipCopy,
  deployDialogCopy,
  deployFixture,
  deployFixtureState,
  type DeployChipCopy,
  type DeployDialogCopy,
  type DeploySummary,
} from '@convex/_lib/deploy';
import { PortalModal } from '@/components/ui/PortalModal';
import { OutlineButton, PrimaryButton } from '@/components/ui/primitives';
import { useSafeQuery } from '@/hooks/useSafeQuery';
import { useMaxWidth } from '@/lib/design/useMaxWidth';
import { MilestoneListButton } from './milestoneChrome';

type Outcome = { ok: true } | { ok: false; error: string };

/** The counter pill (Figma Organism/DeployToMain, Counter). Failed carries a danger dot. */
export function DeployCounter({ copy }: { copy: DeployChipCopy }) {
  return (
    <span
      data-testid="deploy-counter"
      data-deploy-state={copy.state}
      role="status"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        boxSizing: 'border-box',
        padding: '5px 10px',
        borderRadius: 999,
        border: '1px solid var(--border)',
        fontFamily: 'var(--font-geist), var(--font-body)',
        fontSize: 12,
        fontWeight: 500,
        lineHeight: '16px',
        color: 'var(--fg)',
        whiteSpace: 'nowrap',
      }}
    >
      {copy.state === 'failed' ? (
        <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--danger)' }} />
      ) : null}
      {copy.label}
    </span>
  );
}

function DeployRows({ rows }: { rows: DeployDialogCopy['rows'] }) {
  return (
    <div data-testid="deploy-rows" style={{ border: '1px solid var(--border)', borderRadius: 14, padding: '4px 16px' }}>
      {rows.map((row, index) => (
        <div key={`${row.label}-${index}`} className="flex gap-3 py-3" style={{ borderTop: index === 0 ? 'none' : '1px solid var(--border)' }}>
          <span style={{ width: 120, flex: '0 0 auto', fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: '18px', color: 'var(--muted)' }}>
            {row.label}
          </span>
          <span style={{ fontSize: 14, lineHeight: '21px', minWidth: 0, overflowWrap: 'anywhere' }}>
            {row.href ? (
              <a href={row.href} target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>
                {row.value}
              </a>
            ) : (
              row.value
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

/** The confirm, running and failed dialog (Figma Organism/ConfirmFrame, Kind=deploy-main). */
export function DeployDialog({
  copy,
  narrow,
  busy,
  error,
  onClose,
  onPrimary,
}: {
  copy: DeployDialogCopy;
  narrow: boolean;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onPrimary: () => void;
}) {
  return (
    <PortalModal
      testId="deploy-dialog"
      scrimTestId="deploy-scrim"
      label={copy.title}
      header="default"
      width={640}
      narrow={narrow}
      sheet={narrow ? 'bottom' : 'center'}
      sheetClearance={narrow ? '67px' : undefined}
      focusCancel
      blueFocus
      showFooter={false}
      locked={busy}
      onClose={onClose}
    >
      <div data-deploy-dialog={copy.state}>
        <div className="flex flex-col gap-3 px-6 py-2">
          <p data-testid="deploy-lead" style={{ margin: 0, fontSize: 14, lineHeight: '21px' }}>
            {copy.lead}
          </p>
          <DeployRows rows={copy.rows} />
          <p style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: '18px', color: 'var(--muted)' }}>{copy.note}</p>
        </div>
        {error ? (
          <p role="alert" data-testid="deploy-error" className="mx-6 mb-2" style={{ color: 'var(--danger-text)', fontSize: 14, lineHeight: '21px' }}>
            {error}
          </p>
        ) : null}
        <div className="flex flex-nowrap items-center justify-end gap-2 border-t px-6 py-4" style={{ borderColor: 'var(--border)' }}>
          <OutlineButton nowrap height={42} paddingInline={16} disabled={busy} onClick={onClose} testId="deploy-cancel">
            {copy.cancel}
          </OutlineButton>
          <PrimaryButton
            testId="deploy-confirm"
            className="shrink-0"
            height={42}
            paddingInline={16}
            disabled={busy || copy.primary.disabled}
            onClick={onPrimary}
          >
            {copy.primary.label}
          </PrimaryButton>
        </div>
      </div>
    </PortalModal>
  );
}

/**
 * Staff-only Deploy to main on the project header (ADR-0009): how many Shipped
 * milestones are not deployed, and for Peter the button that starts a deploy
 * run. One reactive query; on mount it asks the server to compare `main` once.
 * Fixture previews read `?deploy=` and `?deployModal=open` and make no query.
 * Renders nothing for a client, on a project with no deploy set up, or when
 * nothing waits.
 */
export function DeployToMain({
  projectId,
  staff,
  fixtures,
  live,
  hostSlug,
}: {
  projectId: string;
  staff: boolean;
  fixtures: boolean;
  live: boolean;
  hostSlug?: string;
}) {
  const params = useSearchParams();
  const narrow = useMaxWidth(767);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fixtureOpened, setFixtureOpened] = useState(false);
  const querying = staff && live && !fixtures;
  const query = useSafeQuery<DeploySummary | null>(
    api.deploys.summary,
    querying ? { projectId: projectId as Id<'projects'>, hostSlug } : 'skip',
  );
  const check = useMutation(api.deploys.check);
  const start = useMutation(api.deploys.start);
  const retry = useMutation(api.deploys.retry);

  const checkedFor = useRef<string | null>(null);
  const hasTarget = query.data != null;
  useEffect(() => {
    if (!querying || !hasTarget || checkedFor.current === projectId) return;
    checkedFor.current = projectId;
    // A failed compare leaves the stored list as it was; the counter still shows.
    void check({ projectId: projectId as Id<'projects'>, hostSlug }).catch(() => undefined);
  }, [querying, hasTarget, projectId, hostSlug, check]);

  const fixtureModal = fixtures ? params.get('deployModal') : null;
  useEffect(() => {
    if (!fixtureModal || fixtureOpened) return;
    setOpen(true);
    setFixtureOpened(true);
  }, [fixtureModal, fixtureOpened]);

  if (!staff) return null;
  const view = fixtures ? deployFixture(deployFixtureState(params.get('deploy'))) : query.data;
  const chip = deployChipCopy(view);
  if (!view || !chip) return null;
  const dialog = deployDialogCopy(view, narrow);
  const close = () => {
    if (busy) return;
    setOpen(false);
    setError(null);
  };
  const run = async (action: () => Promise<Outcome>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = fixtures ? ({ ok: true } as Outcome) : await action();
      if (!result.ok) setError(result.error);
    } catch (failed) {
      setError(failed instanceof Error ? failed.message : 'That did not work. Try again.');
    } finally {
      setBusy(false);
    }
  };
  const primary = () => {
    if (dialog.state === 'confirm' && view.sha) {
      const sha = view.sha;
      void run(() => start({ projectId: projectId as Id<'projects'>, sha, hostSlug }) as Promise<Outcome>);
    } else if (dialog.state === 'failed' && view.run) {
      const runId = view.run.id as Id<'deployRuns'>;
      void run(() => retry({ runId, hostSlug }) as Promise<Outcome>);
    }
  };
  return (
    <div data-testid="deploy-to-main" data-deploy-state={chip.state} className="flex items-center gap-2">
      <DeployCounter copy={chip} />
      {chip.button ? (
        <span style={{ opacity: chip.button.disabled ? 0.5 : 1 }}>
          <MilestoneListButton tone="outline" onClick={() => setOpen(true)}>
            {chip.button.label}
          </MilestoneListButton>
        </span>
      ) : null}
      {open && view.isPeter ? (
        <DeployDialog copy={dialog} narrow={narrow} busy={busy} error={error} onClose={close} onPrimary={primary} />
      ) : null}
    </div>
  );
}
