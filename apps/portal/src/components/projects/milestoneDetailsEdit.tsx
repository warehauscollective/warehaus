'use client';

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import type { Id } from '@convex/_generated/dataModel';
import { assertStaffPreviewLink, PREVIEW_LINK_LOCAL } from '@convex/_lib/previewLink';
import { localPreviewHint, tileLinkChangeDecision, type TileLinkField } from '@convex/_lib/tileLinks';
import { userFacingErrorMessage } from '@convex/_lib/userFacingError';
import { clientSeesDetailsRow, formatDueDate, textBlurSave } from '@convex/_lib/milestoneDetails';
import { shippedLockedReason, shippedOpenTag } from '@convex/_lib/closeout';
import { isPeterEmail } from '@convex/_lib/milestoneReview';
import { MILESTONE_STATUSES, nextStatus, statusOptionLock, type MilestoneStatus } from '@convex/_lib/milestoneStatus';
import type { MilestoneRoadmapView } from '@convex/_lib/milestones';
import { TaskGlyph } from '@/components/tasks/TaskGlyph';
import { PortalModal, type PortalModalHeader } from '@/components/ui/PortalModal';
import { OutlineButton, PrimaryButton } from '@/components/ui/primitives';
import { FieldLabel, Panel, fieldStyle } from './milestoneChrome';
import { StatusPlayButton, useMilestoneStatusMoves } from './MilestoneStatusControl';
import { BuildingIndicator, BuildingPhaseSuffix, BuildRunSuffix, useBuildRunState } from './BuildingIndicator';
import { DeploySuffix } from './DeploySuffix';
import type { BuildingPhase } from '@convex/_lib/designGate';
import type { BuildRunState } from '@convex/_lib/buildRun';

const APPROVAL_LABEL = {
  unreviewed: 'Unreviewed',
  approved: 'Approved',
  changes_requested: 'Changes requested',
} as const;

/** The Approval value while an approval Ask waits on the person looking at it (GLOSSARY.md, Ask). */
export const APPROVAL_NEEDS_YOU = 'Needs you';

/**
 * The line under "Needs you", or null when no approval waits on this viewer.
 * An approval Ask goes to Peter, the only approver, so only he is told it
 * needs him. It is open while the milestone is Ready to Ship with a preview
 * and the current iteration has no decision.
 */
export function approvalNeedsYou(input: {
  milestone: Pick<MilestoneRoadmapView, 'status' | 'review'>;
  viewerEmail: string | null | undefined;
}): string | null {
  const review = input.milestone.review;
  if (!review || input.milestone.status !== 'Ready to Ship') return null;
  if (!isPeterEmail(input.viewerEmail)) return null;
  if (!(review.localPreviewUrl || review.previewUrl)) return null;
  if (review.history.some((item) => item.iteration === review.iteration)) return null;
  return `Iteration ${review.iteration} ready to review`;
}

export type MoveTarget = { id: string; name: string };

export type DetailsOverlay =
  | null
  | { kind: 'status' }
  | { kind: 'owner' }
  | { kind: 'due' }
  | { kind: 'project' }
  | { kind: 'visibility' }
  | { kind: 'confirm-publish' }
  | { kind: 'confirm-unpublish' }
  | { kind: 'confirm-move'; projectId: string; projectName: string }
  | { kind: 'attach-link' }
  | { kind: 'remove-link' };

export type OwnerChoice = { id: string; name: string };

type FieldKey = 'status' | 'owner' | 'due' | 'project' | 'visibility';
type FieldTone = 'idle' | 'saving' | 'saved' | 'error' | 'pending' | 'discarded';

type DetailMutations = {
  setStatus: (args: {
    hostSlug?: string;
    milestoneId: Id<'milestones'>;
    status: MilestoneStatus;
    expectedStatus?: MilestoneStatus;
  }) => Promise<unknown>;
  advance: (args: { hostSlug?: string; milestoneId: Id<'milestones'>; expectedStatus: MilestoneStatus }) => Promise<unknown>;
  setOwner: (args: { hostSlug?: string; milestoneId: Id<'milestones'>; ownerContactId: Id<'contacts'> | null }) => Promise<unknown>;
  setDueDate: (args: { hostSlug?: string; milestoneId: Id<'milestones'>; dueDate: string | null }) => Promise<unknown>;
  setPublish: (args: { hostSlug?: string; milestoneId: Id<'milestones'>; publishToWarehaus: boolean }) => Promise<unknown>;
  moveProject: (args: { hostSlug?: string; milestoneId: Id<'milestones'>; projectId: Id<'projects'> }) => Promise<unknown>;
  attachPreviewLink?: (args: { hostSlug?: string; milestoneId: Id<'milestones'>; url: string }) => Promise<{ ok: boolean; reason?: string }>;
  clearPreviewLink?: (args: { hostSlug?: string; milestoneId: Id<'milestones'> }) => Promise<unknown>;
  setTileLink?: (args: {
    hostSlug?: string;
    milestoneId: Id<'milestones'>;
    field: 'localPreview' | 'figma';
    url: string | null;
  }) => Promise<unknown>;
};

export function useMilestoneDetailEdits({
  milestone,
  projectName,
  currentProjectId,
  clientName,
  staff,
  fixtures,
  hostSlug,
  viewerEmail = null,
  moveTargets,
  preview = null,
  showFields,
  reviewLine,
  suspended,
  onClaim,
  onFixture,
  onLoadMoreTargets,
  onMoveListOpen,
  onOwnerListOpen,
  owners = [],
  mutations,
}: {
  milestone: MilestoneRoadmapView;
  projectName: string;
  currentProjectId: string;
  clientName?: string | null;
  staff: boolean;
  fixtures: boolean;
  hostSlug?: string;
  viewerEmail?: string | null;
  moveTargets: readonly MoveTarget[];
  preview?: string | null;
  showFields: boolean;
  reviewLine: string | null;
  suspended: boolean;
  onClaim: () => void;
  onFixture: (patch: {
    status?: MilestoneStatus;
    publishToWarehaus?: boolean;
    ownerContactId?: string | null;
    ownerName?: string | null;
    dueDate?: string | null;
    localPreviewUrl?: string | null;
    figmaUrl?: string | null;
  }) => void;
  onLoadMoreTargets?: () => void;
  /** True only while the move picker or move confirm is open. */
  onMoveListOpen?: (open: boolean) => void;
  /** True only while the owner menu is open. */
  onOwnerListOpen?: (open: boolean) => void;
  owners?: readonly OwnerChoice[];
  mutations: DetailMutations;
}) {
  const [phone, setPhone] = useState(false);
  const [ready, setReady] = useState(false);
  const [overlay, setOverlay] = useState<DetailsOverlay>(() => initialOverlay(preview, moveTargets, staff));
  const [tone, setTone] = useState<Record<FieldKey, FieldTone>>(() => initialTone(preview));
  const [fieldError, setFieldError] = useState<string | null>(
    preview === 'field-error' || preview === 'owner-due-error' ? 'Couldn’t save.' : null,
  );
  const [confirmError, setConfirmError] = useState<string | null>(
    preview === 'error'
      ? 'Couldn’t move the milestone. Nothing changed. Try again.'
      : preview === 'preview-link-error'
        ? PREVIEW_LINK_LOCAL
        : null,
  );
  const [linkDraft, setLinkDraft] = useState(preview === 'preview-link-error' ? 'http://localhost:3100' : (milestone.review?.previewUrl ?? ''));
  const [linkBusy, setLinkBusy] = useState(false);
  const [projectQuery, setProjectQuery] = useState('');
  const [projectNameLocal, setProjectNameLocal] = useState(projectName);
  const pending = useRef<{
    status: MilestoneStatus | null;
    project: MoveTarget | null;
    ownerId: string | null;
    dueDate: string | null;
  }>({
    status: null,
    project: null,
    ownerId: null,
    dueDate: null,
  });
  // Worked out on the server from the whole task set. Clients get no canClose.
  const canClose = milestone.canClose ?? false;
  const openCount = milestone.openCount;
  const moves = useMilestoneStatusMoves({
    status: milestone.status,
    canClose,
    onAdvance: (expected) => {
      if (fixtures) {
        onFixture({ status: nextStatus(expected) ?? expected });
        return;
      }
      return mutations.advance({ hostSlug, milestoneId: milestone.id as Id<'milestones'>, expectedStatus: expected });
    },
    onSet: (next, expected) => {
      if (fixtures) {
        onFixture({ status: next });
        return;
      }
      return mutations.setStatus({
        hostSlug,
        milestoneId: milestone.id as Id<'milestones'>,
        status: next,
        expectedStatus: expected,
      });
    },
  });
  const statusNow: MilestoneStatus = preview === 'locked' ? 'Awaiting Go' : moves.shown;
  const buildState = useBuildRunState(statusNow, milestone.buildRun, staff);
  const taskCount = milestone.rows.length;

  useEffect(() => {
    setReady(true);
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(max-width: 767px)');
    const apply = () => setPhone(media.matches);
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    if (suspended) setOverlay(null);
  }, [suspended]);

  useEffect(() => {
    setProjectNameLocal(projectName);
  }, [projectName]);

  useEffect(() => {
    const open = overlay?.kind === 'project' || overlay?.kind === 'confirm-move';
    onMoveListOpen?.(open);
  }, [overlay, onMoveListOpen]);

  useEffect(() => {
    onOwnerListOpen?.(overlay?.kind === 'owner');
  }, [overlay, onOwnerListOpen]);

  const openOverlay = (next: DetailsOverlay) => {
    onClaim();
    setConfirmError(preview === 'error' ? confirmError : null);
    setOverlay(next);
  };

  const confirmAttach = () => {
    const checked = assertStaffPreviewLink(linkDraft);
    if (!checked.ok) {
      setConfirmError(checked.reason);
      return;
    }
    if (fixtures || !mutations.attachPreviewLink) {
      setOverlay(null);
      setConfirmError(null);
      return;
    }
    setLinkBusy(true);
    void mutations
      .attachPreviewLink({ hostSlug, milestoneId: milestone.id as Id<'milestones'>, url: checked.href })
      .then((result) => {
        if (!result.ok) {
          setConfirmError(result.reason ?? 'Couldn’t save the preview link. Nothing changed.');
          return;
        }
        setOverlay(null);
        setConfirmError(null);
      })
      .catch((err: unknown) => {
        setConfirmError(userFacingErrorMessage(err, 'Couldn’t save the preview link. Nothing changed.'));
      })
      .finally(() => setLinkBusy(false));
  };

  const confirmClear = () => {
    if (fixtures || !mutations.clearPreviewLink) {
      setLinkDraft('');
      setOverlay(null);
      setConfirmError(null);
      return;
    }
    setLinkBusy(true);
    void mutations
      .clearPreviewLink({ hostSlug, milestoneId: milestone.id as Id<'milestones'> })
      .then(() => {
        setLinkDraft('');
        setOverlay(null);
        setConfirmError(null);
      })
      .catch((err: unknown) => {
        setConfirmError(userFacingErrorMessage(err, 'Couldn’t remove the preview link. Nothing changed.'));
      })
      .finally(() => setLinkBusy(false));
  };

  const askPublish = () => {
    openOverlay(milestone.publishToWarehaus ? { kind: 'confirm-unpublish' } : { kind: 'confirm-publish' });
    setTone((current) => ({ ...current, visibility: 'pending' }));
  };

  const closeOverlay = (discarded = false) => {
    if (discarded && overlay?.kind === 'status') setTone((current) => ({ ...current, status: 'discarded' }));
    if (overlay?.kind === 'confirm-publish' || overlay?.kind === 'confirm-unpublish' || overlay?.kind === 'visibility') {
      setTone((current) => ({ ...current, visibility: 'idle' }));
    }
    if (overlay?.kind === 'confirm-move' || overlay?.kind === 'project') {
      setTone((current) => ({ ...current, project: discarded ? 'discarded' : 'idle' }));
    }
    setOverlay(null);
    setConfirmError(null);
  };

  const runField = async (key: FieldKey, action: () => Promise<unknown>) => {
    setTone((current) => ({ ...current, [key]: 'saving' }));
    setFieldError(null);
    try {
      await action();
      setTone((current) => ({ ...current, [key]: 'saved' }));
      if (!preview) {
        window.setTimeout(() => {
          setTone((current) => (current[key] === 'saved' ? { ...current, [key]: 'idle' } : current));
        }, 2000);
      }
    } catch (err) {
      setTone((current) => ({ ...current, [key]: 'error' }));
      setFieldError(key === 'project' ? 'Couldn’t move.' : userFacingErrorMessage(err, 'Couldn’t save.'));
    }
  };

  const pickStatus = (status: MilestoneStatus) => {
    setOverlay(null);
    if (statusOptionLock(status, canClose) || status === statusNow) return;
    pending.current.status = status;
    if (fixtures) {
      onFixture({ status });
      setTone((current) => ({ ...current, status: 'saved' }));
      return;
    }
    void runField('status', () => moves.pick(status));
  };

  const pickOwner = (ownerId: string | null) => {
    const from = milestone.ownerContactId ?? null;
    setOverlay(null);
    if (ownerId === from) return;
    pending.current.ownerId = ownerId;
    const ownerName = ownerId ? (owners.find((person) => person.id === ownerId)?.name ?? null) : null;
    if (fixtures) {
      onFixture({ ownerContactId: ownerId, ownerName });
      setTone((current) => ({ ...current, owner: 'saved' }));
      return;
    }
    void runField('owner', () =>
      mutations.setOwner({
        hostSlug,
        milestoneId: milestone.id as Id<'milestones'>,
        ownerContactId: ownerId as Id<'contacts'> | null,
      }),
    );
  };

  const pickDue = (dueDate: string | null) => {
    const from = milestone.dueDate ?? null;
    setOverlay(null);
    if (dueDate === from) return;
    pending.current.dueDate = dueDate;
    if (fixtures) {
      onFixture({ dueDate });
      setTone((current) => ({ ...current, due: 'saved' }));
      return;
    }
    void runField('due', () =>
      mutations.setDueDate({
        hostSlug,
        milestoneId: milestone.id as Id<'milestones'>,
        dueDate,
      }),
    );
  };

  const confirmPublish = (publishToWarehaus: boolean) => {
    if (fixtures) {
      onFixture({ publishToWarehaus });
      setTone((current) => ({ ...current, visibility: 'saved' }));
      setOverlay(null);
      return;
    }
    setTone((current) => ({ ...current, visibility: 'saving' }));
    void mutations
      .setPublish({ hostSlug, milestoneId: milestone.id as Id<'milestones'>, publishToWarehaus })
      .then(() => {
        setTone((current) => ({ ...current, visibility: 'saved' }));
        setOverlay(null);
        setConfirmError(null);
      })
      .catch(() => {
        setTone((current) => ({ ...current, visibility: 'error' }));
        setConfirmError('Couldn’t save. Nothing changed. Try again.');
      });
  };

  const confirmMove = (target: MoveTarget) => {
    pending.current.project = target;
    if (target.id === currentProjectId) {
      setOverlay(null);
      return;
    }
    if (fixtures) {
      setProjectNameLocal(target.name);
      setTone((current) => ({ ...current, project: 'saved' }));
      setOverlay(null);
      return;
    }
    setTone((current) => ({ ...current, project: 'saving' }));
    void mutations
      .moveProject({
        hostSlug,
        milestoneId: milestone.id as Id<'milestones'>,
        projectId: target.id as Id<'projects'>,
      })
      .then(() => {
        setProjectNameLocal(target.name);
        setTone((current) => ({ ...current, project: 'saved' }));
        setOverlay(null);
        setConfirmError(null);
      })
      .catch(() => {
        setTone((current) => ({ ...current, project: 'error' }));
        setFieldError('Couldn’t move.');
        setConfirmError('Couldn’t move the milestone. Nothing changed. Try again.');
        setOverlay(null);
      });
  };

  const shown = suspended ? null : overlay;

  const filteredTargets = moveTargets.filter((target) => {
    const query = projectQuery.trim().toLowerCase();
    if (!query) return true;
    return target.name.toLowerCase().includes(query);
  });

  const needsYouLine = staff ? approvalNeedsYou({ milestone, viewerEmail }) : null;
  // Under Status on a phone, under Owner on desktop, as in the Milestone properties frames.
  const needsYouRow = (placement: 'phone' | 'desktop') =>
    needsYouLine ? (
      <div className={placement === 'phone' ? 'col-span-2 lg:hidden' : 'hidden lg:block'}>
        <DetailRow label="APPROVAL">
          <ReadValue testId="milestone-approval-needs-you">{APPROVAL_NEEDS_YOU}</ReadValue>
          <p style={{ marginTop: 6, fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: '18px', color: 'var(--muted)' }}>
            {needsYouLine}
          </p>
        </DetailRow>
      </div>
    ) : null;

  const fields = showFields ? (
    <Panel testId="milestone-details">
      <div className="grid grid-cols-2 gap-5 lg:grid-cols-1" data-details-ready={ready ? 'true' : 'false'} data-phone={phone ? 'true' : 'false'} data-details-state={preview ?? 'idle'}>
        <p className="ds-mono col-span-2 hidden md:block lg:col-span-1" style={{ fontSize: 11, letterSpacing: '0.08em', color: 'var(--muted)' }}>
          DETAILS
        </p>
        <DetailRow label="STATUS" outlined={staff}>
          {staff ? (
            <ValueButton
              fieldLabel="STATUS"
              testId="milestone-status-edit"
              valueTestId="milestone-status"
              label={moves.saving ? `${statusNow}…` : statusNow}
              leading={buildState && !moves.saving ? <BuildingIndicator state={buildState} /> : null}
              trailing={
                moves.saving ? null : (
                  <>
                    <BuildingPhaseSuffix status={statusNow} phase={milestone.designGate?.phase} />
                    <DeploySuffix status={statusNow} mark={milestone.deploy} />
                    <BuildRunSuffix state={buildState} />
                  </>
                )
              }
              tone={moves.saving ? 'idle' : tone.status}
              open={shown?.kind === 'status'}
              onClick={() => {
                moves.clearError();
                openOverlay(shown?.kind === 'status' ? null : { kind: 'status' });
              }}
              after={
                moves.playTo && preview !== 'locked' ? (
                  <StatusPlayButton
                    next={moves.playTo}
                    onPlay={() => {
                      setOverlay(null);
                      setTone((current) => ({ ...current, status: 'idle' }));
                      setFieldError(null);
                      moves.play();
                    }}
                  />
                ) : null
              }
            />
          ) : (
            <ReadValue testId="milestone-status">{statusNow}</ReadValue>
          )}
          {tone.status === 'error' && fieldError ? (
            <FieldError testId="milestone-status-retry" text={fieldError} onRetry={() => { const status = pending.current.status; if (status) pickStatus(status); }} />
          ) : moves.error ? (
            <p role="alert" data-testid="milestone-status-error" style={{ marginTop: 6, fontSize: 13, lineHeight: '18px', color: 'var(--danger-text)' }}>
              {moves.error}
            </p>
          ) : null}
          {staff && shown?.kind === 'status' && !phone ? (
            <Popover onClose={() => closeOverlay(true)}>
              <StatusMenu current={statusNow} canClose={canClose} openCount={openCount} onPick={pickStatus} onClose={() => closeOverlay(true)} buildState={buildState} phase={milestone.designGate?.phase} />
            </Popover>
          ) : null}
        </DetailRow>
        {needsYouRow('phone')}
        {clientSeesDetailsRow('owner', staff) ? (
          <DetailRow label="OWNER" outlined={staff}>
            {staff ? (
              <ValueButton
                fieldLabel="OWNER"
                testId="milestone-owner-edit"
                valueTestId="milestone-owner"
                label={milestone.ownerName?.trim() || 'Unassigned'}
                tone={tone.owner}
                open={shown?.kind === 'owner'}
                onClick={() => openOverlay(shown?.kind === 'owner' ? null : { kind: 'owner' })}
              />
            ) : (
              <ReadValue testId="milestone-owner">{milestone.ownerName?.trim() || '—'}</ReadValue>
            )}
            {tone.owner === 'error' && fieldError ? (
              <FieldError testId="milestone-owner-retry" text={fieldError} onRetry={() => pickOwner(pending.current.ownerId)} />
            ) : null}
            {shown?.kind === 'owner' && !phone ? (
              <Popover onClose={() => closeOverlay(true)}>
                <OwnerMenu people={owners} currentId={milestone.ownerContactId ?? null} currentName={milestone.ownerName} onPick={pickOwner} onClose={() => closeOverlay(true)} />
              </Popover>
            ) : null}
          </DetailRow>
        ) : null}
        {needsYouRow('desktop')}
        {clientSeesDetailsRow('creator', staff) ? (
          <DetailRow label="CREATOR">
            <ReadValue testId="milestone-creator">{milestone.creatorName?.trim() || '—'}</ReadValue>
            {staff ? (
              <p data-testid="milestone-creator-note" style={{ marginTop: 6, fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: '18px', color: 'var(--muted)' }}>
                Set automatically · read-only
              </p>
            ) : null}
          </DetailRow>
        ) : null}
        <DetailRow label="CREATED">
          <ReadValue testId="milestone-created">{formatCreated(milestone.createdAt)}</ReadValue>
        </DetailRow>
        <DetailRow label={phone ? 'DUE' : 'DUE DATE'} outlined={staff}>
          {staff ? (
            <ValueButton
              fieldLabel={phone ? 'DUE' : 'DUE DATE'}
              testId="milestone-due-edit"
              valueTestId="milestone-due"
              label={formatDueDate(milestone.dueDate) ?? 'Not set'}
              tone={tone.due}
              open={shown?.kind === 'due'}
              onClick={() => openOverlay(shown?.kind === 'due' ? null : { kind: 'due' })}
            />
          ) : (
            <ReadValue testId="milestone-due">{formatDueDate(milestone.dueDate) ?? '—'}</ReadValue>
          )}
          {tone.due === 'error' && fieldError ? (
            <FieldError testId="milestone-due-retry" text={fieldError} onRetry={() => pickDue(pending.current.dueDate)} />
          ) : null}
          {shown?.kind === 'due' && !phone ? (
            <Popover onClose={() => closeOverlay(true)}>
              <DueDateMenu value={milestone.dueDate ?? null} onPick={pickDue} onClose={() => closeOverlay(true)} />
            </Popover>
          ) : null}
        </DetailRow>
        <DetailRow label="PROJECT" wide outlined={staff}>
          {staff ? (
            <ValueButton
              fieldLabel="PROJECT"
              testId="milestone-project-edit"
              valueTestId="milestone-project"
              label={projectNameLocal}
              tone={tone.project}
              open={shown?.kind === 'project' || shown?.kind === 'confirm-move'}
              onClick={() => openOverlay(shown?.kind === 'project' ? null : { kind: 'project' })}
            />
          ) : (
            <ReadValue testId="milestone-project">{projectNameLocal}</ReadValue>
          )}
          {tone.project === 'error' && fieldError ? (
            <FieldError testId="milestone-project-retry" text={fieldError} onRetry={() => { const target = pending.current.project; if (target) confirmMove(target); }} />
          ) : null}
          {shown?.kind === 'project' && !phone ? (
            <Popover up onClose={() => closeOverlay(true)}>
              <ProjectMenu
                query={projectQuery}
                onQuery={setProjectQuery}
                targets={filteredTargets}
                currentName={projectNameLocal}
                onPick={(target) => {
                  setTone((current) => ({ ...current, project: 'pending' }));
                  openOverlay({ kind: 'confirm-move', projectId: target.id, projectName: target.name });
                }}
                onClose={() => closeOverlay(true)}
                onLoadMore={onLoadMoreTargets}
              />
            </Popover>
          ) : null}
        </DetailRow>
        {clientSeesDetailsRow('visibility', staff) ? (
          <DetailRow label="VISIBILITY" wide outlined={staff}>
            {staff ? (
            <ValueButton
              fieldLabel="VISIBILITY"
              testId="milestone-visibility-edit"
              valueTestId="milestone-publish"
              label={milestone.publishToWarehaus ? 'Published' : 'Not published'}
              tone={tone.visibility}
              open={shown?.kind === 'visibility' || shown?.kind === 'confirm-publish' || shown?.kind === 'confirm-unpublish'}
              onClick={() => openOverlay(shown?.kind === 'visibility' ? null : { kind: 'visibility' })}
            />
            ) : (
              <ReadValue testId="milestone-publish">{milestone.publishToWarehaus ? 'Published' : 'Not published'}</ReadValue>
            )}
            {staff && !milestone.publishToWarehaus ? (
            <p data-testid="milestone-visibility-note" style={{ marginTop: 6, fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: '18px', color: 'var(--muted)' }}>
              Staff only · clients see nothing
            </p>
            ) : null}
            {staff && shown?.kind === 'visibility' && !phone ? (
              <VisibilitySegment
                published={milestone.publishToWarehaus}
                onPick={(publish) => {
                  if (publish === milestone.publishToWarehaus) {
                    setOverlay(null);
                    return;
                  }
                  setTone((current) => ({ ...current, visibility: 'pending' }));
                  openOverlay(publish ? { kind: 'confirm-publish' } : { kind: 'confirm-unpublish' });
                }}
              />
            ) : null}
            {tone.visibility === 'error' && fieldError ? <FieldError testId="milestone-visibility-retry" text={fieldError} onRetry={askPublish} /> : null}
          </DetailRow>
        ) : null}
        {staff ? (
          <DetailRow label="PREVIEW LINK" wide outlined>
            <ValueButton
              fieldLabel="PREVIEW LINK"
              testId="milestone-preview-link-edit"
              valueTestId="milestone-preview-link"
              label={milestone.review?.previewUrl ? previewHost(milestone.review.previewUrl) : 'Attach preview link'}
              tone="idle"
              open={shown?.kind === 'attach-link' || shown?.kind === 'remove-link'}
              onClick={() => {
                setLinkDraft(milestone.review?.previewUrl ?? '');
                setConfirmError(null);
                openOverlay(shown?.kind === 'attach-link' ? null : { kind: 'attach-link' });
              }}
            />
            {milestone.review?.previewUrl ? (
              <button
                type="button"
                data-testid="milestone-preview-link-remove"
                onClick={() => {
                  setConfirmError(null);
                  openOverlay(shown?.kind === 'remove-link' ? null : { kind: 'remove-link' });
                }}
                style={{ marginTop: 6, background: 'none', border: 0, padding: 0, color: 'var(--fg)', font: 'inherit', fontSize: 13, lineHeight: '18px', textDecoration: 'underline', cursor: 'pointer' }}
              >
                Remove link
              </button>
            ) : null}
          </DetailRow>
        ) : null}
        {staff ? (
          <TileLinkRows
            milestone={milestone}
            fixtures={fixtures}
            hostSlug={hostSlug}
            onFixture={onFixture}
            setTileLink={mutations.setTileLink}
          />
        ) : null}
        {clientSeesDetailsRow('approval', staff) && milestone.approval && milestone.approval !== 'unreviewed' && !needsYouLine ? (
          <DetailRow label="APPROVAL" wide>
            <ReadValue testId="milestone-approval">{APPROVAL_LABEL[milestone.approval]}</ReadValue>
          </DetailRow>
        ) : null}
        {clientSeesDetailsRow('review', staff) && reviewLine ? (
          <DetailRow label="LAST REVIEW" wide>
            <ReadValue testId="milestone-last-review">{reviewLine}</ReadValue>
          </DetailRow>
        ) : null}
        {staff ? (
          <p className="col-span-2 lg:col-span-1" data-testid="milestone-edit-hint" style={{ fontSize: 12, lineHeight: '18px', color: 'var(--muted)' }}>
            Staff only · click a value to change it
          </p>
        ) : null}
      </div>
    </Panel>
  ) : null;

  const sheet = shown && (phone || isConfirm(shown)) ? (
    <DetailsModal
      key={shown.kind}
      phone={phone}
      title={modalTitle(shown, milestone.name)}
      testId="milestone-details-modal"
      header={confirmHeader(shown)}
      focusCancel={isConfirm(shown) && shown.kind !== 'attach-link'}
      blueFocus={shown.kind === 'attach-link' || shown.kind === 'remove-link'}
      onClose={() => closeOverlay(true)}
    >
      {staff && shown.kind === 'status' ? (
        <StatusMenu current={statusNow} canClose={canClose} openCount={openCount} onPick={pickStatus} onClose={() => closeOverlay(true)} buildState={buildState} phase={milestone.designGate?.phase} sheet />
      ) : null}
      {shown.kind === 'owner' ? (
        <OwnerMenu people={owners} currentId={milestone.ownerContactId ?? null} currentName={milestone.ownerName} onPick={pickOwner} onClose={() => closeOverlay(true)} sheet />
      ) : null}
      {shown.kind === 'due' ? (
        <DueDateMenu value={milestone.dueDate ?? null} onPick={pickDue} onClose={() => closeOverlay(true)} sheet />
      ) : null}
      {shown.kind === 'project' ? (
        <ProjectMenu
          query={projectQuery}
          onQuery={setProjectQuery}
          targets={filteredTargets}
          currentName={projectNameLocal}
          sheet
          onPick={(target) => {
            setTone((current) => ({ ...current, project: 'pending' }));
            setOverlay({ kind: 'confirm-move', projectId: target.id, projectName: target.name });
          }}
          onClose={() => closeOverlay(true)}
          onLoadMore={onLoadMoreTargets}
        />
      ) : null}
      {shown.kind === 'visibility' ? (
        <VisibilityList
          published={milestone.publishToWarehaus}
          onPick={(publish) => {
            if (publish === milestone.publishToWarehaus) {
              closeOverlay();
              return;
            }
            setTone((current) => ({ ...current, visibility: 'pending' }));
            setOverlay(publish ? { kind: 'confirm-publish' } : { kind: 'confirm-unpublish' });
          }}
          onClose={() => closeOverlay(true)}
        />
      ) : null}
      {shown.kind === 'confirm-publish' ? (
        <ConfirmPublish
          milestoneName={milestone.name}
          clientName={clientName}
          projectName={projectNameLocal}
          busy={tone.visibility === 'saving'}
          error={confirmError}
          onCancel={() => closeOverlay(true)}
          onConfirm={() => confirmPublish(true)}
        />
      ) : null}
      {shown.kind === 'confirm-unpublish' ? (
        <ConfirmUnpublish
          milestoneName={milestone.name}
          busy={tone.visibility === 'saving'}
          error={confirmError}
          onCancel={() => closeOverlay(true)}
          onConfirm={() => confirmPublish(false)}
        />
      ) : null}
      {staff && shown.kind === 'attach-link' ? (
        <ConfirmFrame
          busy={linkBusy}
          error={confirmError}
          confirmLabel="Attach link"
          onCancel={() => closeOverlay(true)}
          onConfirm={confirmAttach}
        >
          <PreviewLinkField
            value={linkDraft}
            invalid={Boolean(confirmError)}
            onChange={(value) => {
              setLinkDraft(value);
              if (confirmError) setConfirmError(null);
            }}
          >
            <span className="ds-mono" style={{ fontSize: 12, lineHeight: '18px', color: 'var(--muted)' }}>
              https only. Team Vercel previews. Localhost and production stay off this milestone.
            </span>
          </PreviewLinkField>
        </ConfirmFrame>
      ) : null}
      {staff && shown.kind === 'remove-link' ? (
        <ConfirmFrame busy={linkBusy} error={confirmError} confirmLabel="Remove link" onCancel={() => closeOverlay(true)} onConfirm={confirmClear}>
          <p style={{ margin: 0, fontSize: 14, lineHeight: '21px' }}>
            The Vercel preview block leaves the review card. A local preview still unlocks Approve.
          </p>
        </ConfirmFrame>
      ) : null}
      {shown.kind === 'confirm-move' ? (
        <ConfirmMove
          milestoneName={milestone.name}
          fromName={projectName}
          toName={shown.projectName}
          taskCount={taskCount}
          doneCount={milestone.doneCount}
          published={milestone.publishToWarehaus}
          busy={tone.project === 'saving'}
          error={confirmError}
          onCancel={() => closeOverlay(true)}
          onConfirm={() => confirmMove({ id: shown.projectId, name: shown.projectName })}
        />
      ) : null}
    </DetailsModal>
  ) : null;

  const overlayNode = (
    <>
      {sheet}
      {staff ? moves.toast : null}
    </>
  );

  return { fields, overlay: overlayNode, askPublish, textBlurSave };
}

function isConfirm(overlay: DetailsOverlay): boolean {
  return overlay?.kind === 'confirm-publish' || overlay?.kind === 'confirm-unpublish' || overlay?.kind === 'confirm-move' || overlay?.kind === 'attach-link' || overlay?.kind === 'remove-link';
}

function previewHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return 'Preview attached';
  }
}

function initialOverlay(preview: string | null, targets: readonly MoveTarget[], staff: boolean): DetailsOverlay {
  if (preview === 'stage' || preview === 'stage-peter' || preview === 'status') return { kind: 'status' };
  if (preview === 'owner') return { kind: 'owner' };
  if (preview === 'due') return { kind: 'due' };
  if (preview === 'project') return { kind: 'project' };
  if (preview === 'visibility') return { kind: 'visibility' };
  if (preview === 'publish') return { kind: 'confirm-publish' };
  if (preview === 'unpublish') return { kind: 'confirm-unpublish' };
  if (preview === 'move' || preview === 'error') {
    const target = targets[0];
    if (!target) return null;
    return { kind: 'confirm-move', projectId: target.id, projectName: target.name };
  }
  if (staff && (preview === 'attach-link' || preview === 'preview-link-error')) return { kind: 'attach-link' };
  if (staff && preview === 'remove-link') return { kind: 'remove-link' };
  return null;
}

function initialTone(preview: string | null): Record<FieldKey, FieldTone> {
  const tone: Record<FieldKey, FieldTone> = { status: 'idle', owner: 'idle', due: 'idle', project: 'idle', visibility: 'idle' };
  if (preview === 'saving') tone.status = 'saving';
  if (preview === 'saved') tone.status = 'saved';
  if (preview === 'field-error') tone.status = 'error';
  if (preview === 'owner-due-error') {
    tone.owner = 'error';
    tone.due = 'error';
  }
  if (preview === 'discarded') tone.status = 'discarded';
  if (preview === 'publish' || preview === 'unpublish' || preview === 'visibility') tone.visibility = 'pending';
  if (preview === 'move' || preview === 'error') tone.project = preview === 'error' ? 'error' : 'pending';
  return tone;
}

function formatCreated(createdAt: number | null | undefined): string {
  if (createdAt == null) return '—';
  return new Date(createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function modalTitle(overlay: DetailsOverlay, name: string): string {
  if (!overlay) return name;
  if (overlay.kind === 'status') return 'Status';
  if (overlay.kind === 'owner') return 'Owner';
  if (overlay.kind === 'due') return 'Due date';
  if (overlay.kind === 'project') return 'Project';
  if (overlay.kind === 'visibility') return 'Visibility';
  if (overlay.kind === 'confirm-publish') return 'Publish to client?';
  if (overlay.kind === 'confirm-unpublish') return 'Hide from client?';
  if (overlay.kind === 'attach-link') return 'Attach preview link';
  if (overlay.kind === 'remove-link') return 'Remove preview link?';
  return `Move to ${overlay.projectName}?`;
}

/** Read-only detail value. Same padded row as a value button, without a chevron. */
function ReadValue({ testId, children }: { testId: string; children: ReactNode }) {
  return (
    <div
      className="mt-1 flex w-full items-center rounded-lg"
      style={{
        minHeight: 32,
        padding: '4px 8px',
        border: '1px solid transparent',
        color: 'var(--fg)',
        fontSize: 14,
        lineHeight: '21px',
      }}
    >
      <span data-testid={testId}>{children}</span>
    </div>
  );
}

function TileLinkRows({
  milestone,
  fixtures,
  hostSlug,
  onFixture,
  setTileLink,
}: {
  milestone: MilestoneRoadmapView;
  fixtures: boolean;
  hostSlug?: string;
  onFixture: (patch: { localPreviewUrl?: string | null; figmaUrl?: string | null }) => void;
  setTileLink?: (args: {
    hostSlug?: string;
    milestoneId: Id<'milestones'>;
    field: TileLinkField;
    url: string | null;
  }) => Promise<unknown>;
}) {
  const [field, setField] = useState<TileLinkField | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const current = (next: TileLinkField) => (next === 'localPreview' ? milestone.localPreviewUrl ?? null : milestone.figmaUrl ?? null);
  const open = (next: TileLinkField) => {
    setError(null);
    setDraft(current(next) ?? '');
    setField(next);
  };
  const save = async (next: TileLinkField, url: string | null) => {
    const decision = tileLinkChangeDecision({ field: next, from: current(next), to: url });
    if (!decision.ok) {
      setError(decision.reason);
      return;
    }
    setField(null);
    if (!decision.wrote) return;
    if (fixtures) {
      onFixture(next === 'localPreview' ? { localPreviewUrl: decision.url } : { figmaUrl: decision.url });
      return;
    }
    try {
      await setTileLink?.({
        hostSlug,
        milestoneId: milestone.id as Id<'milestones'>,
        field: next,
        url: decision.url,
      });
    } catch (err) {
      setField(next);
      setError(userFacingErrorMessage(err, 'Couldn’t save. Nothing changed. Try again.'));
    }
  };
  const row = (next: TileLinkField, label: string, testId: string, empty: string) => {
    const value = current(next);
    return (
      <DetailRow label={label} wide>
        <button
          type="button"
          data-testid={testId}
          onClick={() => open(next)}
          className="mt-1 flex w-full items-center rounded-lg text-left"
          style={{
            minHeight: 32,
            padding: '4px 8px',
            border: '1px solid transparent',
            background: 'transparent',
            color: 'var(--fg)',
            font: 'inherit',
            fontSize: 14,
            lineHeight: '21px',
            cursor: 'pointer',
          }}
        >
          <span>{value ? (next === 'localPreview' ? localPreviewHint(value) : 'Figma') : empty}</span>
        </button>
        {value ? (
          <button
            type="button"
            data-testid={`${testId}-clear`}
            onClick={() => void save(next, null)}
            style={{ marginTop: 6, background: 'none', border: 0, padding: 0, color: 'var(--fg)', font: 'inherit', fontSize: 13, lineHeight: '18px', textDecoration: 'underline', cursor: 'pointer' }}
          >
            Clear
          </button>
        ) : null}
        {field === next ? (
          <div className="mt-2 flex flex-col gap-2">
            <input
              data-testid={`${testId}-input`}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={next === 'localPreview' ? 'http://localhost:3200' : 'https://www.figma.com/design/…'}
              style={{ ...fieldStyle, width: '100%' }}
            />
            {error ? <p role="alert" style={{ margin: 0, color: 'var(--danger-text)', fontSize: 13 }}>{error}</p> : null}
            <div className="flex justify-end gap-2">
              <OutlineButton nowrap onClick={() => setField(null)}>Cancel</OutlineButton>
              <button type="button" onClick={() => void save(next, draft)} style={{ background: 'var(--accent)', color: 'var(--accent-fg)', border: 0, borderRadius: 9, padding: '8px 14px', fontSize: 14, cursor: 'pointer' }}>
                Save
              </button>
            </div>
          </div>
        ) : null}
      </DetailRow>
    );
  };
  return (
    <>
      {row('localPreview', 'LOCAL PREVIEW', 'milestone-local-preview-edit', 'Set local preview')}
      {row('figma', 'FIGMA', 'milestone-figma-edit', 'Set Figma link')}
    </>
  );
}

function DetailRow({
  label,
  wide,
  outlined,
  children,
}: {
  label: string;
  wide?: boolean;
  /** An editable picker draws its own label inside the outline. */
  outlined?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`relative ${wide ? 'col-span-2 lg:col-span-1' : ''}`}>
      {outlined ? null : <FieldLabel>{label}</FieldLabel>}
      {children}
    </div>
  );
}

/**
 * Editable picker trigger. A 1px outline with 10px corners, the field label
 * inside it, and the value below. `after` sits beside the trigger as its own
 * control (the status play button), never inside the button.
 */
function ValueButton({
  fieldLabel,
  label,
  testId,
  valueTestId,
  tone,
  open,
  locked,
  onClick,
  after,
  leading,
  trailing,
}: {
  fieldLabel: string;
  label: string;
  /** Before the value, such as the Building indicator. */
  leading?: ReactNode;
  /** Right after the value, such as " · Queued". */
  trailing?: ReactNode;
  testId: string;
  valueTestId: string;
  tone: FieldTone;
  open: boolean;
  locked?: boolean;
  onClick: () => void;
  after?: ReactNode;
}) {
  return (
    <div
      className="milestone-picker milestone-picker-field group flex w-full items-end gap-2"
      data-open={open ? 'true' : 'false'}
      data-picker-outline=""
      style={{
        boxSizing: 'border-box',
        padding: '6px 8px',
        ...(locked ? { borderStyle: 'dashed', borderColor: 'var(--border-2)' } : {}),
      }}
    >
      <button
        type="button"
        data-testid={testId}
        disabled={locked}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={onClick}
        className="flex min-w-0 flex-1 flex-col gap-1 bg-transparent text-left"
        style={{
          border: 0,
          padding: 0,
          color: 'var(--fg)',
          font: 'inherit',
          fontSize: 14,
          lineHeight: '21px',
          cursor: locked ? 'not-allowed' : 'pointer',
        }}
      >
        <span className="ds-mono" style={{ fontSize: 10, lineHeight: '15px', color: 'var(--muted)' }}>
          {fieldLabel}
        </span>
        <span className="flex w-full items-center gap-2">
          {leading}
          <span data-testid={valueTestId}>{label}</span>
          {trailing}
          {tone === 'saving' ? <ToneText>Saving…</ToneText> : null}
          {tone === 'saved' ? (
            <span className="inline-flex items-center gap-1" style={{ color: 'var(--muted)', fontSize: 12 }}>
              <TaskGlyph src="/icons/docs-check.svg" size={12} />
              Saved
            </span>
          ) : null}
          {tone === 'discarded' ? <ToneText>Change discarded</ToneText> : null}
          {locked ? (
            <span className="ml-auto text-[var(--muted)]" aria-hidden>
              <TaskGlyph src="/icons/task-lock.svg" size={14} />
            </span>
          ) : (
            <span className="ml-auto text-[var(--muted)] opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100" aria-hidden>
              <TaskGlyph src="/icons/task-chev-down.svg" size={14} />
            </span>
          )}
        </span>
      </button>
      {after}
    </div>
  );
}

function ToneText({ children }: { children: string }) {
  return <span style={{ color: 'var(--muted)', fontSize: 12, lineHeight: '18px' }}>{children}</span>;
}

export function FieldError({ text, onRetry, testId }: { text: string; onRetry: () => void; testId: string }) {
  return (
    <p role="alert" data-testid="milestone-details-error" style={{ marginTop: 6, fontSize: 13, lineHeight: '18px', color: 'var(--danger-text)' }}>
      <TaskGlyph src="/icons/docs-alert.svg" size={12} /> {text}{' '}
      <button type="button" data-testid={testId} onClick={onRetry} style={{ color: 'var(--danger-text)', background: 'none', border: 0, padding: 0, font: 'inherit', textDecoration: 'underline', cursor: 'pointer' }}>
        Retry
      </button>
    </p>
  );
}

function menuKey(event: ReactKeyboardEvent<HTMLDivElement>, onClose: () => void) {
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    onClose();
  }
}

const DIALOG_FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** Next or previous control inside the dialog, skipping an open menu layer. */
export function nextDialogFocus(anchor: HTMLElement, shiftKey: boolean): HTMLElement | null {
  const root = anchor.closest('[role="dialog"]') ?? anchor.closest('[data-page-scroll]') ?? anchor.ownerDocument.body;
  const nodes = [...root.querySelectorAll<HTMLElement>(DIALOG_FOCUSABLE)].filter((el) => {
    if (el.hasAttribute('disabled') || el.closest('[data-menu-layer]')) return false;
    return el.tabIndex >= 0;
  });
  if (nodes.length === 0) return anchor;
  const index = nodes.indexOf(anchor);
  if (index < 0) return shiftKey ? nodes[nodes.length - 1]! : nodes[0]!;
  const next = shiftKey ? index - 1 : index + 1;
  return nodes[(next + nodes.length) % nodes.length] ?? anchor;
}

export function menuButtons(root: ParentNode | null): HTMLElement[] {
  if (!root) return [];
  return [...root.querySelectorAll<HTMLElement>('button')].filter((button) => !button.hasAttribute('disabled'));
}

export const MILESTONE_STATUS_HINT =
  'Staff can set Shipped when every task that is not Parked is Done. Saves as soon as you pick.';

export const MILESTONE_STATUS_HINT_ID = 'milestone-status-hint';

/** Same clearance centered dialogs use so a phone sheet sits above the dock. */
const STATUS_SHEET_CLEARANCE = 'calc(82px + env(safe-area-inset-bottom, 0px))';

const MENU_OPTION_FOCUS =
  'focus-visible:[--tw-outline-style:solid] focus-visible:outline-2 focus-visible:outline-[var(--info)] focus-visible:outline-offset-2';

/**
 * The Status menu, Figma 727:10352. Any jump, forward or back. Shipped unlocks
 * when every non-Parked task is Done. While it is locked the option carries
 * the "N OPEN" tag and the hint points to Mark complete.
 */
export function StatusMenu({
  current,
  onPick,
  onClose,
  sheet,
  canClose = false,
  openCount = 0,
  buildState = null,
  phase = null,
}: {
  current: string;
  onPick: (status: MilestoneStatus) => void;
  /** The milestone's Building indicator. The current Building option pulses only while a run is live. */
  buildState?: BuildRunState | null;
  /** The design gate's Building phase, shown after the current Building option. */
  phase?: BuildingPhase | null;
  onClose: () => void;
  sheet?: boolean;
  canClose?: boolean;
  /** Tasks still open on the milestone. Shown on the locked Shipped option. */
  openCount?: number;
}) {
  const shippedLocked = statusOptionLock('Shipped', canClose) != null && current !== 'Shipped';
  return (
    <div
      role="listbox"
      aria-label="Status"
      data-testid="milestone-status-menu"
      onKeyDown={(event) => menuKey(event, onClose)}
      style={menuStyle(sheet, 400, true)}
    >
      {sheet ? <SheetHeader title="Status" onClose={onClose} /> : null}
      {MILESTONE_STATUSES.map((status) => {
        const lock = statusOptionLock(status, canClose);
        const selected = status === current;
        return (
          <button
            key={status}
            type="button"
            role="option"
            aria-selected={selected}
            aria-disabled={lock != null ? true : undefined}
            aria-describedby={lock ? MILESTONE_STATUS_HINT_ID : undefined}
            onClick={(event) => {
              if (lock) {
                event.preventDefault();
                return;
              }
              onPick(status);
            }}
            onKeyDown={(event) => {
              if (!lock || (event.key !== 'Enter' && event.key !== ' ')) return;
              event.preventDefault();
            }}
            className={`flex w-full items-center gap-2 text-left ${MENU_OPTION_FOCUS}`}
            style={{
              padding: 10,
              border: 0,
              borderRadius: 12,
              background: selected ? 'var(--surface-2)' : 'transparent',
              color: lock ? 'var(--muted)' : 'var(--fg)',
              font: 'inherit',
              fontSize: 14,
              lineHeight: '21px',
              cursor: lock ? 'not-allowed' : 'pointer',
            }}
          >
            {selected && status === 'Building' && buildState === 'live' ? <BuildingIndicator state="live" /> : null}
            <span className="whitespace-nowrap">
              {status}
              {selected ? <BuildingPhaseSuffix status={status} phase={phase} /> : null}
            </span>
            {lock === 'shipped' && openCount > 0 ? <Tag>{shippedOpenTag(openCount)}</Tag> : null}
            {lock ? <TaskGlyph src="/icons/task-lock.svg" size={14} /> : null}
            {selected && !lock ? <TaskGlyph src="/icons/docs-check.svg" size={16} /> : null}
          </button>
        );
      })}
      <p id={MILESTONE_STATUS_HINT_ID} style={{ margin: '8px 10px', fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: '18px', color: 'var(--muted)' }}>
        {shippedLocked ? shippedLockedReason(openCount) : MILESTONE_STATUS_HINT}
      </p>
    </div>
  );
}

export function ProjectMenu({
  query,
  onQuery,
  targets,
  currentName,
  onPick,
  onClose,
  onLoadMore,
  sheet,
}: {
  query: string;
  onQuery: (value: string) => void;
  targets: readonly MoveTarget[];
  currentName: string;
  onPick: (target: MoveTarget) => void;
  onClose: () => void;
  onLoadMore?: () => void;
  sheet?: boolean;
}) {
  return (
    <div data-testid="milestone-project-menu" onKeyDown={(event) => menuKey(event, onClose)} style={menuStyle(sheet, 360)}>
      {sheet ? <SheetHeader title="Project" onClose={onClose} /> : null}
      <input
        aria-label="Search projects"
        value={query}
        onChange={(event) => onQuery(event.target.value)}
        placeholder="Search projects"
        style={{
          width: '100%',
          marginBottom: 8,
          border: '1px solid var(--border)',
          borderRadius: 12,
          background: 'var(--surface-2)',
          color: 'var(--fg)',
          font: 'inherit',
          fontSize: 14,
          lineHeight: '21px',
          padding: '10px 12px',
        }}
      />
      {targets.length === 0 ? (
        <p style={{ padding: 10, fontSize: 14, color: 'var(--muted)' }}>No matching project.</p>
      ) : (
        targets.map((target) => (
          <button
            key={target.id}
            type="button"
            onClick={() => onPick(target)}
            className="flex w-full items-center text-left"
            style={{
              padding: 10,
              border: 0,
              borderRadius: 12,
              background: target.name === currentName ? 'var(--surface-2)' : 'transparent',
              color: 'var(--fg)',
              font: 'inherit',
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            {target.name}
          </button>
        ))
      )}
      {onLoadMore ? (
        <button type="button" onClick={onLoadMore} style={{ marginTop: 8, background: 'none', border: 0, color: 'var(--muted)', font: 'inherit', fontSize: 13, cursor: 'pointer' }}>
          More projects
        </button>
      ) : null}
      <p style={{ margin: '8px 10px 0', fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: '18px', color: 'var(--muted)' }}>
        Nothing moves until you confirm.
      </p>
    </div>
  );
}

function VisibilitySegment({ published, onPick }: { published: boolean; onPick: (publish: boolean) => void }) {
  return (
    <div data-testid="milestone-visibility-segment" className="mt-2 grid grid-cols-2 gap-1" style={{ border: '1px solid var(--border)', borderRadius: 14, padding: 4 }}>
      <SegmentButton selected={!published} onClick={() => onPick(false)}>Not published</SegmentButton>
      <SegmentButton selected={published} onClick={() => onPick(true)}>Published</SegmentButton>
    </div>
  );
}

function SegmentButton({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      style={{
        border: 0,
        borderRadius: 10,
        padding: '8px 6px',
        background: selected ? 'var(--surface-2)' : 'transparent',
        color: 'var(--fg)',
        font: 'inherit',
        fontSize: 13,
        lineHeight: '21px',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

function VisibilityList({
  published,
  onPick,
  onClose,
}: {
  published: boolean;
  onPick: (publish: boolean) => void;
  onClose: () => void;
}) {
  return (
    <div data-testid="milestone-visibility-sheet" onKeyDown={(event) => menuKey(event, onClose)} style={{ padding: 16 }}>
      <h2 style={{ fontSize: 20, lineHeight: '30px', fontWeight: 600 }}>Visibility</h2>
      {published ? null : (
        <p style={{ marginTop: 4, fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: '18px', color: 'var(--muted)' }}>Staff only · clients see nothing</p>
      )}
      <div className="mt-3 flex flex-col gap-1">
        <SegmentButton selected={!published} onClick={() => onPick(false)}>Not published</SegmentButton>
        <SegmentButton selected={published} onClick={() => onPick(true)}>Published</SegmentButton>
      </div>
    </div>
  );
}

function confirmHeader(overlay: DetailsOverlay): PortalModalHeader | undefined {
  if (overlay?.kind === 'confirm-move' || overlay?.kind === 'confirm-publish' || overlay?.kind === 'confirm-unpublish' || overlay?.kind === 'attach-link' || overlay?.kind === 'remove-link') {
    return 'default';
  }
  return undefined;
}

function DetailsModal({
  title,
  phone,
  testId,
  header,
  focusCancel = false,
  blueFocus = false,
  onClose,
  children,
}: {
  title: string;
  phone: boolean;
  testId: string;
  header?: PortalModalHeader;
  focusCancel?: boolean;
  blueFocus?: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <PortalModal
      testId={testId}
      scrimTestId="milestone-details-scrim"
      label={title}
      onClose={onClose}
      narrow={phone}
      sheet="bottom"
      width={640}
      header={header}
      focusCancel={focusCancel}
      blueFocus={blueFocus}
      showFooter={false}
    >
      {children}
    </PortalModal>
  );
}

export function PreviewLinkField({
  value,
  invalid,
  onChange,
  children,
}: {
  value: string;
  invalid: boolean;
  onChange: (value: string) => void;
  children?: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2" style={{ fontSize: 14, lineHeight: '21px' }}>
      <span>Preview link</span>
      <span
        className="needs-field block"
        style={{
          border: invalid ? '1px solid var(--danger)' : '1px solid var(--border)',
          borderRadius: 12,
          background: 'var(--surface-2)',
        }}
      >
        <input
          aria-label="Preview link"
          aria-invalid={invalid || undefined}
          data-testid="preview-link-input"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="https://warehaus-portal-…-warehaus-collective.vercel.app"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          style={{
            width: '100%',
            border: 0,
            borderRadius: 12,
            background: 'transparent',
            color: 'var(--fg)',
            padding: 12,
            font: 'inherit',
            outline: 'none',
          }}
        />
      </span>
      {children}
    </label>
  );
}

export function ConfirmFrame({
  busy,
  error,
  confirmLabel,
  onCancel,
  onConfirm,
  children,
}: {
  busy: boolean;
  error: string | null;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="px-6 py-2">{children}</div>
      {error ? (
        <p role="alert" data-testid="milestone-details-error" className="mx-6 mb-2" style={{ color: 'var(--danger-text)', fontSize: 14, lineHeight: '21px' }}>
          {error}
        </p>
      ) : null}
      <div className="flex flex-nowrap items-center justify-end gap-2 border-t px-6 py-4" style={{ borderColor: 'var(--border)' }}>
        <span className="ml-auto flex shrink-0 flex-nowrap items-center gap-2">
          <OutlineButton nowrap height={42} paddingInline={16} disabled={busy} onClick={onCancel}>
            Cancel
          </OutlineButton>
          <PrimaryButton testId="milestone-confirm-submit" className="shrink-0" height={42} paddingInline={16} disabled={busy} onClick={onConfirm}>
            {busy ? 'Saving…' : confirmLabel}
          </PrimaryButton>
        </span>
      </div>
    </div>
  );
}

function SummaryTable({ rows }: { rows: Array<[string, string]> }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 14, padding: '4px 16px' }}>
      {rows.map(([label, value], index) => (
        <div key={label} className="flex gap-3 py-3" style={{ borderTop: index === 0 ? 'none' : '1px solid var(--border)' }}>
          <span style={{ width: 120, flex: '0 0 auto', fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: '18px', color: 'var(--muted)' }}>{label}</span>
          <span style={{ fontSize: 14, lineHeight: '21px' }}>{value}</span>
        </div>
      ))}
    </div>
  );
}

function ConfirmMove(props: {
  milestoneName: string;
  fromName: string;
  toName: string;
  taskCount: number;
  doneCount: number;
  published: boolean;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const tasks = props.taskCount === 1 ? '1 task' : `${props.taskCount} tasks`;
  return (
    <ConfirmFrame
      busy={props.busy}
      error={props.error}
      confirmLabel={`Move milestone + ${props.taskCount} ${props.taskCount === 1 ? 'task' : 'tasks'}`}
      onCancel={props.onCancel}
      onConfirm={props.onConfirm}
    >
      <p style={{ fontSize: 14, lineHeight: '21px' }}>
        {props.milestoneName} and its {tasks} move from {props.fromName} to {props.toName}.
      </p>
      <div className="mt-3">
        <SummaryTable
          rows={[
            ['MILESTONE', props.milestoneName],
            ['TASKS', `${props.taskCount} tasks move with it · ${props.doneCount} complete`],
            ['FROM → TO', `${props.fromName} → ${props.toName}`],
            ['VISIBILITY', props.published ? 'Stays Shared with client' : 'Stays Not published'],
          ]}
        />
      </div>
      <p className="mt-3" style={{ fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: '18px', color: 'var(--muted)' }}>
        Nothing changes until you confirm. Resources and activity stay attached.
      </p>
    </ConfirmFrame>
  );
}

function ConfirmPublish(props: {
  milestoneName: string;
  clientName?: string | null;
  projectName: string;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const who = props.clientName ? `${props.clientName}’s client users` : 'Client users';
  return (
    <ConfirmFrame busy={props.busy} error={props.error} confirmLabel="Publish" onCancel={props.onCancel} onConfirm={props.onConfirm}>
      <p style={{ fontSize: 14, lineHeight: '21px' }}>
        {who} will see {props.milestoneName} in their Portal.
      </p>
      <div className="mt-3">
        <SummaryTable
          rows={[
            ['THEY SEE', 'Title, What we’re delivering, Done when, status and progress'],
            ['HIDDEN', 'Staff-only tasks, resources, notes and preview links'],
            ['WHO', `Client users on ${props.projectName}`],
          ]}
        />
      </div>
      <p className="mt-3" style={{ fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: '18px', color: 'var(--muted)' }}>
        Nothing changes until you confirm. You can unpublish any time.
      </p>
    </ConfirmFrame>
  );
}

function ConfirmUnpublish(props: {
  milestoneName: string;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <ConfirmFrame busy={props.busy} error={props.error} confirmLabel="Unpublish" onCancel={props.onCancel} onConfirm={props.onConfirm}>
      <p style={{ fontSize: 14, lineHeight: '21px' }}>{props.milestoneName} leaves the client Portal. Staff can still open it.</p>
      <p className="mt-3" style={{ fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: '18px', color: 'var(--muted)' }}>
        Nothing changes until you confirm.
      </p>
    </ConfirmFrame>
  );
}

function menuStyle(sheet?: boolean, _width = 400, clearDock = false): CSSProperties {
  if (sheet) {
    return {
      padding: '4px 12px 12px',
      ...(clearDock ? { paddingBottom: STATUS_SHEET_CLEARANCE } : {}),
    };
  }
  return {
    width: '100%',
    padding: 6,
    background: 'var(--surface)',
    border: '1px solid var(--border-2)',
    borderRadius: 18,
    boxShadow: '0 16px 40px rgba(0,0,0,0.5)',
  };
}

const MENU_GAP = 8;

/** Flip a menu above its anchor when it would not fit below, then clamp it inside the visible bounds. */
export function anchoredMenuBox(input: {
  anchor: { top: number; bottom: number; left: number; right: number };
  menu: { width: number; height: number };
  bounds: { top: number; right: number; bottom: number; left: number };
  preferUp?: boolean;
  align?: 'left' | 'right';
}): { top: number; left: number; placement: 'up' | 'down' } {
  const { anchor, menu, bounds, preferUp = false, align = 'right' } = input;
  const spaceBelow = bounds.bottom - anchor.bottom - MENU_GAP;
  const spaceAbove = anchor.top - bounds.top - MENU_GAP;
  const placement = preferUp || (spaceBelow < menu.height && spaceAbove >= menu.height) ? 'up' : 'down';
  let top = placement === 'up' ? anchor.top - MENU_GAP - menu.height : anchor.bottom + MENU_GAP;
  const minTop = bounds.top + MENU_GAP;
  const maxTop = Math.max(minTop, bounds.bottom - menu.height - MENU_GAP);
  top = Math.min(Math.max(top, minTop), maxTop);
  let left = align === 'left' ? anchor.left : anchor.right - menu.width;
  const minLeft = bounds.left + MENU_GAP;
  const maxLeft = Math.max(minLeft, bounds.right - menu.width - MENU_GAP);
  left = Math.min(Math.max(left, minLeft), maxLeft);
  return { top, left, placement };
}

function menuViewportBounds(): { top: number; right: number; bottom: number; left: number } {
  let bottom = window.innerHeight;
  const dock = document.querySelector('[data-testid="portal-dock"]');
  if (dock instanceof HTMLElement && getComputedStyle(dock).visibility !== 'hidden') {
    const dockTop = dock.getBoundingClientRect().top;
    if (dockTop < bottom) bottom = dockTop;
  }
  return { top: 0, right: window.innerWidth, bottom, left: 0 };
}

export function Popover({ up, onClose, children }: { up?: boolean; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLElement | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useLayoutEffect(() => {
    const node = ref.current;
    const row = node?.parentElement;
    const anchor = row?.querySelector<HTMLElement>('button') ?? null;
    anchorRef.current = anchor;
    if (!node || !row || typeof row.getBoundingClientRect !== 'function') return;
    const place = () => {
      const rect = row.getBoundingClientRect();
      const width = up ? 360 : 400;
      const box = anchoredMenuBox({
        anchor: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right },
        menu: { width, height: node.offsetHeight },
        bounds: menuViewportBounds(),
        preferUp: up,
      });
      node.style.position = 'fixed';
      node.style.width = `${width}px`;
      node.style.left = `${box.left}px`;
      node.style.top = `${box.top}px`;
      node.style.right = 'auto';
      node.style.bottom = 'auto';
      node.style.zIndex = '40';
      node.dataset.placement = box.placement;
    };
    place();
    node.querySelector<HTMLElement>('[data-menu-initial-focus]')?.focus({ preventScroll: true });
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place);
    observer?.observe(node);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
      observer?.disconnect();
    };
  }, [up]);
  useEffect(() => {
    const onPointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (ref.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onCloseRef.current();
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, []);
  useEffect(() => {
    return () => {
      const target = returnFocus.current ?? anchorRef.current;
      target?.focus({ preventScroll: true });
      window.requestAnimationFrame(() => target?.focus({ preventScroll: true }));
    };
  }, []);
  return (
    <div
      ref={ref}
      data-menu-layer=""
      className="ds-scope absolute z-30"
      style={up
        ? { right: 0, bottom: 'calc(100% + 8px)', width: 360, background: 'transparent' }
        : { right: 0, top: 'calc(100% + 8px)', width: 400, background: 'transparent' }}
      onKeyDown={(event) => {
        if (event.key === 'Tab') {
          event.preventDefault();
          event.stopPropagation();
          const anchor = anchorRef.current ?? (event.currentTarget as HTMLElement);
          returnFocus.current = nextDialogFocus(anchor, event.shiftKey);
          onCloseRef.current();
          return;
        }
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        const items = menuButtons(ref.current);
        const index = items.indexOf(document.activeElement as HTMLElement);
        if (index < 0 || items.length === 0) return;
        event.preventDefault();
        const next = event.key === 'ArrowDown' ? index + 1 : index - 1;
        items[(next + items.length) % items.length]?.focus({ preventScroll: true });
      }}
    >
      {children}
    </div>
  );
}

function SheetHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="mb-1 flex items-center px-2 py-2">
      <h2 style={{ fontSize: 20, lineHeight: '30px', fontWeight: 600 }}>{title}</h2>
      <button
        type="button"
        onClick={onClose}
        className="ml-auto rounded-[9px] px-3 py-2 focus-visible:[--tw-outline-style:solid] focus-visible:outline-2 focus-visible:outline-[var(--info)] focus-visible:outline-offset-2"
        style={{ background: 'none', border: 0, color: 'var(--muted)', font: 'inherit', fontSize: 14, lineHeight: '21px', cursor: 'pointer' }}
      >
        Close
      </button>
    </div>
  );
}

const MENU_FOOT = 'Saves as soon as you pick. Saved in the Portal.';

function optionStyle(selected: boolean): CSSProperties {
  return {
    padding: 10,
    border: 0,
    borderRadius: 12,
    background: selected ? 'var(--surface-2)' : 'transparent',
    color: 'var(--fg)',
    font: 'inherit',
    fontSize: 14,
    lineHeight: '21px',
    cursor: 'pointer',
    width: '100%',
  };
}

export function OwnerMenu({
  people,
  currentId,
  currentName,
  onPick,
  onClose,
  sheet,
  foot = MENU_FOOT,
}: {
  people: readonly OwnerChoice[];
  currentId: string | null;
  /** Shown when the saved name has no contact in this list. Never marks Unassigned. */
  currentName?: string | null;
  onPick: (id: string | null) => void;
  onClose: () => void;
  sheet?: boolean;
  foot?: string;
}) {
  const known = currentId != null && people.some((person) => person.id === currentId);
  const savedName = currentName?.trim() ?? '';
  const nameOnly = !known && savedName.length > 0;
  const options: Array<{ key: string; id: string | null; name: string; kind: 'name' | 'person' | 'none' }> = [
    ...(nameOnly ? [{ key: 'name-only', id: null, name: savedName, kind: 'name' as const }] : []),
    ...people.map((person) => ({ key: person.id, id: person.id, name: person.name, kind: 'person' as const })),
    { key: 'unassigned', id: null, name: 'Unassigned', kind: 'none' as const },
  ];
  return (
    <div role="listbox" aria-label="Owner" data-testid="milestone-owner-menu" onKeyDown={(event) => menuKey(event, onClose)} style={menuStyle(sheet)}>
      {sheet ? <SheetHeader title="Owner" onClose={onClose} /> : null}
      {options.map((option) => {
        const selected = option.kind === 'name' || (option.kind === 'person' && option.id === currentId) || (option.kind === 'none' && !nameOnly && currentId == null);
        return (
          <button
            key={option.key}
            type="button"
            role="option"
            aria-selected={selected}
            data-menu-initial-focus={selected ? '' : undefined}
            onClick={() => {
              if (option.kind === 'name') {
                onClose();
                return;
              }
              onPick(option.id);
            }}
            className="milestone-field flex w-full items-center gap-2 text-left"
            style={optionStyle(selected)}
          >
            <span className="min-w-0 flex-1">{option.name}</span>
            {selected ? <TaskGlyph src="/icons/docs-check.svg" size={16} /> : null}
          </button>
        );
      })}
      <p style={{ margin: '8px 10px', fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: '18px', color: 'var(--muted)' }}>{foot}</p>
    </div>
  );
}

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;

function monthCells(year: number, month: number): Array<number | null> {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const count = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: Array<number | null> = Array.from({ length: first }, () => null);
  for (let day = 1; day <= count; day += 1) cells.push(day);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function dateParts(value: string | null): { year: number; month: number; day: number | null } {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    return { year: year!, month: month!, day: day! };
  }
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: null };
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function DueDateMenu({
  value,
  onPick,
  onClose,
  sheet,
  foot = MENU_FOOT,
}: {
  value: string | null;
  onPick: (next: string | null) => void;
  onClose: () => void;
  sheet?: boolean;
  foot?: string;
}) {
  const initial = dateParts(value);
  const [cursor, setCursor] = useState({ year: initial.year, month: initial.month });
  const label = new Date(Date.UTC(cursor.year, cursor.month - 1, 1)).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const shift = (delta: number) => {
    const next = new Date(Date.UTC(cursor.year, cursor.month - 1 + delta, 1));
    setCursor({ year: next.getUTCFullYear(), month: next.getUTCMonth() + 1 });
  };
  return (
    <div role="dialog" aria-label="Due date" data-testid="milestone-due-menu" onKeyDown={(event) => menuKey(event, onClose)} style={menuStyle(sheet)}>
      {sheet ? <SheetHeader title="Due date" onClose={onClose} /> : null}
      <div className="flex items-center justify-between gap-2 px-2 py-2">
        <button type="button" className="milestone-field" aria-label="Previous month" onClick={() => shift(-1)} style={monthButton}>‹</button>
        <p style={{ margin: 0, fontSize: 14, lineHeight: '21px', fontWeight: 500 }}>{label}</p>
        <button type="button" className="milestone-field" aria-label="Next month" onClick={() => shift(1)} style={monthButton}>›</button>
      </div>
      <div className="grid grid-cols-7 gap-1 px-2" aria-hidden>
        {WEEKDAYS.map((day, index) => (
          <span key={`${day}-${index}`} className="ds-mono text-center" style={{ fontSize: 11, lineHeight: '16px', color: 'var(--muted)' }}>{day}</span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1 px-2">
        {monthCells(cursor.year, cursor.month).map((day, index) => {
          if (!day) return <span key={`empty-${index}`} />;
          const iso = `${cursor.year}-${pad(cursor.month)}-${pad(day)}`;
          const selected = iso === value;
          const today = todayIso();
          return (
            <button
              key={iso}
              type="button"
              aria-label={iso}
              aria-pressed={selected}
              data-menu-initial-focus={selected || (value == null && iso === today) ? '' : undefined}
              onClick={() => onPick(iso)}
              className="milestone-field"
              style={{
                width: 32,
                height: 32,
                margin: '0 auto',
                border: 0,
                borderRadius: selected ? 8 : 999,
                background: selected ? 'var(--fg)' : 'transparent',
                color: selected ? 'var(--bg)' : 'var(--fg)',
                font: 'inherit',
                fontSize: 14,
                lineHeight: '32px',
                cursor: 'pointer',
              }}
            >
              {day}
            </button>
          );
        })}
      </div>
      <button type="button" className="milestone-field mt-2 text-left" onClick={() => onPick(null)} style={{ background: 'none', border: 0, color: 'var(--fg)', font: 'inherit', fontSize: 14, lineHeight: '21px', padding: '8px 10px', cursor: 'pointer' }}>
        Clear date
      </button>
      <p style={{ margin: '4px 10px 8px', fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: '18px', color: 'var(--muted)' }}>{foot}</p>
    </div>
  );
}

const monthButton: CSSProperties = {
  width: 32,
  height: 32,
  border: 0,
  borderRadius: 9,
  background: 'transparent',
  color: 'var(--fg)',
  font: 'inherit',
  fontSize: 18,
  lineHeight: '32px',
  cursor: 'pointer',
};

function Tag({ children }: { children: string }) {
  return (
    <span style={{ flexShrink: 0, border: '1px solid var(--border-2)', borderRadius: 999, padding: '3px 8px', fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: '18px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
      {children}
    </span>
  );
}

// Re-export so the blur rule stays next to the panel that refuses to edit title and description.
export { textBlurSave };
