'use client';

import { useEffect, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import type { Id } from '@convex/_generated/dataModel';
import {
  DETAIL_STATUS_LABEL,
  MILESTONE_DETAIL_STATUSES,
  MILESTONE_STAGES,
  clientSeesDetailsRow,
  detailStatusDecision,
  detailStatusLabel,
  effectiveDetailStatus,
  effectiveStage,
  isPeterEmail,
  stageOptionLock,
  textBlurSave,
  workStatusForDetail,
  type MilestoneDetailStatus,
  type MilestoneStage,
} from '@convex/_lib/milestoneDetails';
import type { MilestoneRoadmapView } from '@convex/_lib/milestones';
import { TaskGlyph } from '@/components/tasks/TaskGlyph';
import { OutlineButton, PrimaryButton } from '@/components/ui/primitives';
import { FieldLabel, FieldValue, Panel } from './milestoneChrome';

const APPROVAL_LABEL = {
  unreviewed: 'Unreviewed',
  approved: 'Approved',
  changes_requested: 'Changes requested',
} as const;

export type MoveTarget = { id: string; name: string };

export type DetailsOverlay =
  | null
  | { kind: 'stage' }
  | { kind: 'status' }
  | { kind: 'project' }
  | { kind: 'visibility' }
  | { kind: 'confirm-publish' }
  | { kind: 'confirm-unpublish' }
  | { kind: 'confirm-move'; projectId: string; projectName: string };

type FieldKey = 'status' | 'stage' | 'project' | 'visibility';
type FieldTone = 'idle' | 'saving' | 'saved' | 'error' | 'pending' | 'discarded';

type DetailMutations = {
  setDetailStatus: (args: {
    hostSlug?: string;
    milestoneId: Id<'milestones'>;
    detailStatus: MilestoneDetailStatus;
  }) => Promise<unknown>;
  setStage: (args: { hostSlug?: string; milestoneId: Id<'milestones'>; stage: MilestoneStage }) => Promise<unknown>;
  setPublish: (args: { hostSlug?: string; milestoneId: Id<'milestones'>; publishToWarehaus: boolean }) => Promise<unknown>;
  moveProject: (args: { hostSlug?: string; milestoneId: Id<'milestones'>; projectId: Id<'projects'> }) => Promise<unknown>;
};

export function useMilestoneDetailEdits({
  milestone,
  projectName,
  currentProjectId,
  clientName,
  staff,
  fixtures,
  hostSlug,
  viewerEmail,
  moveTargets,
  preview = null,
  showFields,
  reviewLine,
  suspended,
  onClaim,
  onFixture,
  onLoadMoreTargets,
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
    detailStatus?: MilestoneDetailStatus;
    stage?: MilestoneStage;
    workStatus?: MilestoneRoadmapView['workStatus'];
    publishToWarehaus?: boolean;
  }) => void;
  onLoadMoreTargets?: () => void;
  mutations: DetailMutations;
}) {
  const peter = isPeterEmail(viewerEmail) || preview === 'stage-peter';
  const [phone, setPhone] = useState(false);
  const [ready, setReady] = useState(false);
  const [overlay, setOverlay] = useState<DetailsOverlay>(() => initialOverlay(preview, moveTargets));
  const [tone, setTone] = useState<Record<FieldKey, FieldTone>>(() => initialTone(preview));
  const [fieldError, setFieldError] = useState<string | null>(preview === 'field-error' ? 'Couldn’t save.' : null);
  const [confirmError, setConfirmError] = useState<string | null>(
    preview === 'error' ? 'Couldn’t move the milestone. Nothing changed. Try again.' : null,
  );
  const [projectQuery, setProjectQuery] = useState('');
  const [projectNameLocal, setProjectNameLocal] = useState(projectName);
  const shownStage = preview === 'locked' ? 'Awaiting Go' : stageLabel(milestone);
  const shownStatus = statusLabel(milestone);
  const stageNow = preview === 'locked' ? 'Awaiting Go' : effectiveStage(milestone);
  const stageLocked = staff && stageNow === 'Awaiting Go' && !peter;
  const taskCount = milestone.openCount + milestone.doneCount;

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

  const openOverlay = (next: DetailsOverlay) => {
    onClaim();
    setConfirmError(preview === 'error' ? confirmError : null);
    setOverlay(next);
  };

  const askPublish = () => {
    openOverlay(milestone.publishToWarehaus ? { kind: 'confirm-unpublish' } : { kind: 'confirm-publish' });
    setTone((current) => ({ ...current, visibility: 'pending' }));
  };

  const closeOverlay = (discarded = false) => {
    if (discarded && overlay?.kind === 'stage') setTone((current) => ({ ...current, stage: 'discarded' }));
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
    } catch {
      setTone((current) => ({ ...current, [key]: 'error' }));
      setFieldError(key === 'project' ? 'Couldn’t move.' : 'Couldn’t save.');
    }
  };

  const pickStatus = (status: MilestoneDetailStatus) => {
    const decision = detailStatusDecision({ from: effectiveDetailStatus(milestone), to: status });
    setOverlay(null);
    if (!decision.ok || !decision.wrote) return;
    if (fixtures) {
      const workStatus = workStatusForDetail(decision.status);
      onFixture({
        detailStatus: decision.status,
        ...(workStatus ? { workStatus } : {}),
      });
      setTone((current) => ({ ...current, status: 'saved' }));
      return;
    }
    void runField('status', () =>
      mutations.setDetailStatus({
        hostSlug,
        milestoneId: milestone.id as Id<'milestones'>,
        detailStatus: decision.status,
      }),
    );
  };

  const pickStage = (stage: MilestoneStage) => {
    if (stageOptionLock({ stage, peter })) return;
    if (stageLocked) return;
    const from = preview === 'locked' ? 'Awaiting Go' : effectiveStage(milestone);
    if (stage === from) {
      setOverlay(null);
      return;
    }
    setOverlay(null);
    if (fixtures) {
      onFixture({ stage });
      setTone((current) => ({ ...current, stage: 'saved' }));
      return;
    }
    void runField('stage', () =>
      mutations.setStage({ hostSlug, milestoneId: milestone.id as Id<'milestones'>, stage }),
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
        setConfirmError('Couldn’t move the milestone. Nothing changed. Try again.');
      });
  };

  const filteredTargets = moveTargets.filter((target) => {
    const query = projectQuery.trim().toLowerCase();
    if (!query) return true;
    return target.name.toLowerCase().includes(query);
  });

  const fields = showFields ? (
    <Panel testId="milestone-details">
      <div className="grid grid-cols-2 gap-5 lg:grid-cols-1" data-details-ready={ready ? 'true' : 'false'} data-phone={phone ? 'true' : 'false'} data-details-state={preview ?? 'idle'}>
        <p className="ds-mono col-span-2 hidden md:block lg:col-span-1" style={{ fontSize: 11, letterSpacing: '0.08em', color: 'var(--muted)' }}>
          DETAILS
        </p>
        <DetailRow label="STATUS">
          {staff ? (
            <ValueButton
              testId="milestone-status-edit"
              valueTestId="milestone-work-status"
              label={shownStatus}
              tone={tone.status}
              open={overlay?.kind === 'status'}
              onClick={() => openOverlay(overlay?.kind === 'status' ? null : { kind: 'status' })}
            />
          ) : (
            <FieldValue>
              <span data-testid="milestone-work-status">{shownStatus}</span>
            </FieldValue>
          )}
          {tone.status === 'error' && fieldError ? <FieldError text={fieldError} onRetry={() => pickStatus(effectiveDetailStatus(milestone) === 'draft' ? 'in_progress' : 'draft')} /> : null}
          {overlay?.kind === 'status' && !phone ? (
            <StatusMenu current={effectiveDetailStatus(milestone)} onPick={pickStatus} onClose={() => closeOverlay(true)} />
          ) : null}
        </DetailRow>
        <DetailRow label="STAGE">
          {staff ? (
            <ValueButton
              testId={stageLocked ? 'milestone-stage-locked' : 'milestone-stage-edit'}
              valueTestId="milestone-stage"
              label={shownStage}
              tone={tone.stage}
              open={overlay?.kind === 'stage'}
              locked={stageLocked}
              onClick={() => {
                if (stageLocked) return;
                openOverlay(overlay?.kind === 'stage' ? null : { kind: 'stage' });
              }}
            />
          ) : (
            <FieldValue>
              <span data-testid="milestone-stage">{shownStage}</span>
            </FieldValue>
          )}
          {stageLocked ? (
            <p data-testid="milestone-stage-lock-note" style={{ marginTop: 6, fontSize: 12, lineHeight: '18px', color: 'var(--muted)' }}>
              Waiting on Peter’s go · only Peter changes it from here
            </p>
          ) : null}
          {tone.stage === 'error' && fieldError ? <FieldError text={fieldError} onRetry={() => pickStage('Planning')} /> : null}
          {overlay?.kind === 'stage' && !phone ? (
            <StageMenu peter={peter} current={stageNow} onPick={pickStage} onClose={() => closeOverlay(true)} />
          ) : null}
        </DetailRow>
        {clientSeesDetailsRow('owner', staff) ? (
          <DetailRow label="OWNER">
            <FieldValue>
              <span data-testid="milestone-owner">—</span>
            </FieldValue>
          </DetailRow>
        ) : null}
        {clientSeesDetailsRow('creator', staff) ? (
          <DetailRow label="CREATOR">
            <FieldValue>
              <span data-testid="milestone-creator">—</span>
            </FieldValue>
          </DetailRow>
        ) : null}
        <DetailRow label="CREATED">
          <FieldValue>
            <span data-testid="milestone-created">{formatCreated(milestone.createdAt)}</span>
          </FieldValue>
        </DetailRow>
        <DetailRow label="DUE DATE">
          <FieldValue>
            <span data-testid="milestone-due">—</span>
          </FieldValue>
        </DetailRow>
        <DetailRow label="PROJECT" wide>
          {staff ? (
            <ValueButton
              testId="milestone-project-edit"
              valueTestId="milestone-project"
              label={projectNameLocal}
              tone={tone.project}
              open={overlay?.kind === 'project' || overlay?.kind === 'confirm-move'}
              onClick={() => openOverlay(overlay?.kind === 'project' ? null : { kind: 'project' })}
            />
          ) : (
            <FieldValue>
              <span data-testid="milestone-project">{projectNameLocal}</span>
            </FieldValue>
          )}
          {tone.project === 'error' && fieldError ? <FieldError text={fieldError} onRetry={() => { const target = moveTargets[0]; if (target) confirmMove(target); }} /> : null}
          {overlay?.kind === 'project' && !phone ? (
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
          ) : null}
        </DetailRow>
        {clientSeesDetailsRow('visibility', staff) ? (
          <DetailRow label="VISIBILITY" wide>
            <ValueButton
              testId="milestone-visibility-edit"
              valueTestId="milestone-publish"
              label={milestone.publishToWarehaus ? 'Shared with client' : 'Not published'}
              tone={tone.visibility}
              open={overlay?.kind === 'visibility' || overlay?.kind === 'confirm-publish' || overlay?.kind === 'confirm-unpublish'}
              onClick={() => openOverlay(overlay?.kind === 'visibility' ? null : { kind: 'visibility' })}
            />
            {overlay?.kind === 'visibility' && !phone ? (
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
            {tone.visibility === 'error' && fieldError ? <FieldError text={fieldError} onRetry={askPublish} /> : null}
          </DetailRow>
        ) : null}
        {milestone.approval !== 'unreviewed' ? (
          <DetailRow label="APPROVAL" wide>
            <FieldValue>
              <span data-testid="milestone-approval">{APPROVAL_LABEL[milestone.approval]}</span>
            </FieldValue>
          </DetailRow>
        ) : null}
        {reviewLine ? (
          <DetailRow label="LAST REVIEW" wide>
            <FieldValue>
              <span data-testid="milestone-last-review">{reviewLine}</span>
            </FieldValue>
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

  const sheet = overlay && (phone || isConfirm(overlay)) ? (
    <DetailsModal
      phone={phone}
      title={modalTitle(overlay, milestone.name)}
      testId="milestone-details-modal"
      onClose={() => closeOverlay(true)}
    >
      {overlay.kind === 'stage' ? (
        <StageMenu peter={peter} current={stageNow} onPick={pickStage} onClose={() => closeOverlay(true)} sheet />
      ) : null}
      {overlay.kind === 'status' ? (
        <StatusMenu current={effectiveDetailStatus(milestone)} onPick={pickStatus} onClose={() => closeOverlay(true)} sheet />
      ) : null}
      {overlay.kind === 'project' ? (
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
      {overlay.kind === 'visibility' ? (
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
      {overlay.kind === 'confirm-publish' ? (
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
      {overlay.kind === 'confirm-unpublish' ? (
        <ConfirmUnpublish
          milestoneName={milestone.name}
          busy={tone.visibility === 'saving'}
          error={confirmError}
          onCancel={() => closeOverlay(true)}
          onConfirm={() => confirmPublish(false)}
        />
      ) : null}
      {overlay.kind === 'confirm-move' ? (
        <ConfirmMove
          milestoneName={milestone.name}
          fromName={projectName}
          toName={overlay.projectName}
          taskCount={taskCount}
          doneCount={milestone.doneCount}
          published={milestone.publishToWarehaus}
          busy={tone.project === 'saving'}
          error={confirmError}
          onCancel={() => closeOverlay(true)}
          onConfirm={() => confirmMove({ id: overlay.projectId, name: overlay.projectName })}
        />
      ) : null}
    </DetailsModal>
  ) : null;

  return { fields, overlay: sheet, askPublish, textBlurSave };
}

function isConfirm(overlay: DetailsOverlay): boolean {
  return overlay?.kind === 'confirm-publish' || overlay?.kind === 'confirm-unpublish' || overlay?.kind === 'confirm-move';
}

function initialOverlay(preview: string | null, targets: readonly MoveTarget[]): DetailsOverlay {
  if (preview === 'stage' || preview === 'stage-peter') return { kind: 'stage' };
  if (preview === 'status') return { kind: 'status' };
  if (preview === 'project') return { kind: 'project' };
  if (preview === 'visibility') return { kind: 'visibility' };
  if (preview === 'publish') return { kind: 'confirm-publish' };
  if (preview === 'unpublish') return { kind: 'confirm-unpublish' };
  if (preview === 'move' || preview === 'error') {
    const target = targets[0];
    if (!target) return null;
    return { kind: 'confirm-move', projectId: target.id, projectName: target.name };
  }
  return null;
}

function initialTone(preview: string | null): Record<FieldKey, FieldTone> {
  const tone: Record<FieldKey, FieldTone> = { status: 'idle', stage: 'idle', project: 'idle', visibility: 'idle' };
  if (preview === 'saving') tone.stage = 'saving';
  if (preview === 'saved') tone.stage = 'saved';
  if (preview === 'field-error') tone.stage = 'error';
  if (preview === 'discarded') tone.stage = 'discarded';
  if (preview === 'publish' || preview === 'unpublish' || preview === 'visibility') tone.visibility = 'pending';
  if (preview === 'move' || preview === 'error') tone.project = preview === 'error' ? 'error' : 'pending';
  return tone;
}

function statusLabel(milestone: MilestoneRoadmapView): string {
  if (milestone.detailStatus) return detailStatusLabel(milestone.detailStatus);
  if (milestone.approval === 'approved') return 'Approved';
  if (milestone.workStatus === 'draft') return 'Draft';
  if (milestone.workStatus === 'ready') return 'Ready for review';
  return 'In progress';
}

function stageLabel(milestone: MilestoneRoadmapView): string {
  if (milestone.stage) return milestone.stage;
  if (milestone.approval === 'approved') return 'Shipped';
  if (milestone.workStatus === 'draft') return 'Planning';
  return 'Building';
}

function formatCreated(createdAt: number | null | undefined): string {
  if (createdAt == null) return '—';
  return new Date(createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function modalTitle(overlay: DetailsOverlay, name: string): string {
  if (!overlay) return name;
  if (overlay.kind === 'stage') return 'Stage';
  if (overlay.kind === 'status') return 'Status';
  if (overlay.kind === 'project') return 'Project';
  if (overlay.kind === 'visibility') return 'Visibility';
  if (overlay.kind === 'confirm-publish') return 'Publish to client?';
  if (overlay.kind === 'confirm-unpublish') return 'Hide from client?';
  return `Move to ${overlay.projectName}?`;
}

function DetailRow({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={wide ? 'col-span-2 lg:col-span-1' : undefined}>
      <FieldLabel>{label}</FieldLabel>
      {children}
    </div>
  );
}

function ValueButton({
  label,
  testId,
  valueTestId,
  tone,
  open,
  locked,
  onClick,
}: {
  label: string;
  testId: string;
  valueTestId: string;
  tone: FieldTone;
  open: boolean;
  locked?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      disabled={locked}
      onClick={onClick}
      className="group mt-1 flex w-full items-center gap-2 rounded-lg text-left focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2"
      style={{
        minHeight: 32,
        padding: '4px 8px',
        border: locked ? '1px dashed var(--border-2)' : open ? '1px solid var(--accent)' : '1px solid transparent',
        background: 'transparent',
        color: 'var(--fg)',
        font: 'inherit',
        fontSize: 14,
        lineHeight: '21px',
        cursor: locked ? 'not-allowed' : 'pointer',
      }}
    >
      <span data-testid={valueTestId}>{label}</span>
      {tone === 'saving' ? <ToneText>Saving…</ToneText> : null}
      {tone === 'saved' ? (
        <span className="inline-flex items-center gap-1" style={{ color: 'var(--muted)', fontSize: 12 }}>
          <TaskGlyph src="/icons/docs-check.svg" size={12} />
          Saved
        </span>
      ) : null}
      {tone === 'pending' ? <ToneText>Confirm…</ToneText> : null}
      {tone === 'discarded' ? <ToneText>Change discarded</ToneText> : null}
      {locked ? (
        <span className="ml-auto text-[var(--muted)]" aria-hidden>
          <TaskGlyph src="/icons/task-lock.svg" size={14} />
        </span>
      ) : (
        <span className="ml-auto text-[var(--muted)] opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-visible:opacity-100" aria-hidden>
          <TaskGlyph src="/icons/task-chev-down.svg" size={14} />
        </span>
      )}
    </button>
  );
}

function ToneText({ children }: { children: string }) {
  return <span style={{ color: 'var(--muted)', fontSize: 12, lineHeight: '18px' }}>{children}</span>;
}

function FieldError({ text, onRetry }: { text: string; onRetry: () => void }) {
  return (
    <p role="alert" data-testid="milestone-details-error" style={{ marginTop: 6, fontSize: 13, lineHeight: '18px', color: 'var(--danger-text)' }}>
      <TaskGlyph src="/icons/docs-alert.svg" size={12} /> {text}{' '}
      <button type="button" onClick={onRetry} style={{ color: 'var(--danger-text)', background: 'none', border: 0, padding: 0, font: 'inherit', textDecoration: 'underline', cursor: 'pointer' }}>
        Retry
      </button>
    </p>
  );
}

function menuKey(event: ReactKeyboardEvent<HTMLDivElement>, onClose: () => void) {
  if (event.key === 'Escape') {
    event.preventDefault();
    onClose();
  }
}

function StageMenu({
  peter,
  current,
  onPick,
  onClose,
  sheet,
}: {
  peter: boolean;
  current: string;
  onPick: (stage: MilestoneStage) => void;
  onClose: () => void;
  sheet?: boolean;
}) {
  return (
    <div
      role="listbox"
      aria-label="Stage"
      data-testid="milestone-stage-menu"
      onKeyDown={(event) => menuKey(event, onClose)}
      style={menuStyle(sheet)}
    >
      {MILESTONE_STAGES.map((stage) => {
        const lock = stageOptionLock({ stage, peter });
        const selected = stage === current;
        return (
          <button
            key={stage}
            type="button"
            role="option"
            aria-selected={selected}
            aria-disabled={lock != null}
            disabled={lock != null}
            onClick={() => onPick(stage)}
            className="flex w-full items-center gap-2 text-left"
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
            <span className="min-w-0 flex-1">{stage}</span>
            {lock === 'peter' ? <Tag>PETER’S CALL</Tag> : null}
            {lock === 'shipped' ? <Tag>AFTER DEPLOY MAIN</Tag> : null}
            {lock ? <TaskGlyph src="/icons/task-lock.svg" size={14} /> : null}
            {selected && !lock ? <TaskGlyph src="/icons/docs-check.svg" size={16} /> : null}
          </button>
        );
      })}
      <p style={{ margin: '8px 10px', fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: '18px', color: 'var(--muted)' }}>
        Only Peter can move a milestone into Awaiting Go or Ready to Ship. Shipped is set by deploy main. Saves as soon as you pick.
      </p>
    </div>
  );
}

function StatusMenu({
  current,
  onPick,
  onClose,
  sheet,
}: {
  current: MilestoneDetailStatus;
  onPick: (status: MilestoneDetailStatus) => void;
  onClose: () => void;
  sheet?: boolean;
}) {
  return (
    <div role="listbox" aria-label="Status" data-testid="milestone-status-menu" onKeyDown={(event) => menuKey(event, onClose)} style={menuStyle(sheet)}>
      {MILESTONE_DETAIL_STATUSES.map((status) => {
        const selected = status === current;
        return (
          <button
            key={status}
            type="button"
            role="option"
            aria-selected={selected}
            onClick={() => onPick(status)}
            className="flex w-full items-center gap-2 text-left"
            style={{
              padding: 10,
              border: 0,
              borderRadius: 12,
              background: selected ? 'var(--surface-2)' : 'transparent',
              color: 'var(--fg)',
              font: 'inherit',
              fontSize: 14,
              lineHeight: '21px',
              cursor: 'pointer',
            }}
          >
            <span className="flex-1">{DETAIL_STATUS_LABEL[status]}</span>
            {selected ? <TaskGlyph src="/icons/docs-check.svg" size={16} /> : null}
          </button>
        );
      })}
      <p style={{ margin: '8px 10px', fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: '18px', color: 'var(--muted)' }}>
        Saves as soon as you pick.
      </p>
    </div>
  );
}

function ProjectMenu({
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
      <div className="mt-3 flex flex-col gap-1">
        <SegmentButton selected={!published} onClick={() => onPick(false)}>Not published</SegmentButton>
        <SegmentButton selected={published} onClick={() => onPick(true)}>Published</SegmentButton>
      </div>
    </div>
  );
}

function DetailsModal({
  title,
  phone,
  testId,
  onClose,
  children,
}: {
  title: string;
  phone: boolean;
  testId: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      role="presentation"
      data-testid="milestone-details-scrim"
      className={phone ? 'fixed inset-0 flex items-end' : 'fixed inset-0 flex items-center justify-center p-4'}
      style={{ zIndex: 80, background: 'rgba(0, 0, 0, 0.10)', backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)' }}
      onClick={onClose}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-testid={testId}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        style={
          phone
            ? {
                width: '100%',
                maxHeight: '92dvh',
                overflow: 'auto',
                background: 'var(--surface)',
                borderTop: '2px solid var(--border-2)',
                borderRadius: '28px 28px 0 0',
                boxShadow: 'none',
              }
            : {
                width: 'min(100%, 640px)',
                maxHeight: '90dvh',
                overflow: 'auto',
                background: 'var(--surface)',
                border: '2px solid var(--border-2)',
                borderRadius: 28,
                boxShadow: '0 16px 48px rgba(0,0,0,0.24)',
              }
        }
      >
        {phone ? (
          <div aria-hidden style={{ width: 36, height: 4, borderRadius: 99, background: 'var(--border-2)', margin: '10px auto 0' }} />
        ) : null}
        {children}
      </div>
    </div>
  );
}

function ConfirmFrame({
  title,
  busy,
  error,
  confirmLabel,
  onCancel,
  onConfirm,
  children,
}: {
  title: string;
  busy: boolean;
  error: string | null;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-3 px-6 py-4">
        <h2 style={{ fontSize: 20, lineHeight: '30px', fontWeight: 600 }}>{title}</h2>
        <button type="button" onClick={onCancel} className="ml-auto" style={{ background: 'none', border: 0, color: 'var(--muted)', font: 'inherit', fontSize: 14, cursor: 'pointer' }}>
          Close
        </button>
      </div>
      <div className="px-6 py-2">{children}</div>
      {error ? (
        <p role="alert" data-testid="milestone-details-error" className="mx-6 mb-2" style={{ color: 'var(--danger-text)', fontSize: 14, lineHeight: '21px' }}>
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2 border-t px-6 py-4" style={{ borderColor: 'var(--border)' }}>
        <span className="mr-auto" style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--muted)' }}>
          Esc to cancel
        </span>
        <OutlineButton height={42} paddingInline={16} disabled={busy} onClick={onCancel}>
          Cancel
        </OutlineButton>
        <PrimaryButton testId="milestone-confirm-submit" height={42} paddingInline={16} disabled={busy} onClick={onConfirm}>
          {busy ? 'Saving…' : confirmLabel}
        </PrimaryButton>
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
      title={`Move to ${props.toName}?`}
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
    <ConfirmFrame title="Publish to client?" busy={props.busy} error={props.error} confirmLabel="Publish" onCancel={props.onCancel} onConfirm={props.onConfirm}>
      <p style={{ fontSize: 14, lineHeight: '21px' }}>
        {who} will see {props.milestoneName} in their Portal.
      </p>
      <div className="mt-3">
        <SummaryTable
          rows={[
            ['THEY SEE', 'Title, What we’re delivering, Done when, stage, status and progress'],
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
    <ConfirmFrame title="Hide from client?" busy={props.busy} error={props.error} confirmLabel="Unpublish" onCancel={props.onCancel} onConfirm={props.onConfirm}>
      <p style={{ fontSize: 14, lineHeight: '21px' }}>{props.milestoneName} leaves the client Portal. Staff can still open it.</p>
      <p className="mt-3" style={{ fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: '18px', color: 'var(--muted)' }}>
        Nothing changes until you confirm.
      </p>
    </ConfirmFrame>
  );
}

function menuStyle(sheet?: boolean, width = 320): CSSProperties {
  if (sheet) return { padding: 12 };
  return {
    marginTop: 8,
    width,
    maxWidth: '100%',
    padding: 6,
    background: 'var(--surface)',
    border: '1px solid var(--border-2)',
    borderRadius: 18,
    boxShadow: '0 16px 40px rgba(0,0,0,0.5)',
  };
}

function Tag({ children }: { children: string }) {
  return (
    <span style={{ border: '1px solid var(--border-2)', borderRadius: 999, padding: '3px 8px', fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: '18px', color: 'var(--muted)' }}>
      {children}
    </span>
  );
}

// Re-export so the blur rule stays next to the panel that refuses to edit title and description.
export { textBlurSave };
