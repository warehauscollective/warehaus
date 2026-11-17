'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import type { MilestoneReviewHistoryItem, MilestoneReviewView, MilestoneRoadmapView } from '@convex/_lib/milestones';
import {
  NOTES_REQUIRED,
  formatReviewStamp,
  iterationOutcome,
  type DesignCheck,
} from '@convex/_lib/milestoneReview';
import { userFacingErrorMessage } from '@convex/_lib/userFacingError';
import { OutlineButton, PrimaryButton } from '@/components/ui/primitives';

export const APPROVAL_SAVE_ERROR = 'Couldn’t save your approval. Nothing changed. Try again.';
export const APPROVED_READONLY = 'Read-only · merging now · moves to Shipped when you run deploy main';
export const WAITING_COPY = 'App Developer Lead posts the localhost link here and in Grok Bot chat when the build is ready.';
export const NEXT_BUILD_COPY = 'Waiting on local build. The next preview link shows here and in Grok Bot chat.';

export type ReviewVisual = 'ready' | 'waiting' | 'fixes' | 'saving' | 'error' | 'approved' | 'changes';
export type ReviewDialogKind = 'approve' | 'changes';

export type ReviewSurfaceModel = {
  milestoneId: string;
  iteration: number;
  workStatus: 'draft' | 'active' | 'ready';
  approval: 'unreviewed' | 'approved' | 'changes_requested';
  previewUrl: string | null;
  prNumber: number | null;
  prTitle: string | null;
  branch: string | null;
  commit: string | null;
  builtAt: number | null;
  designCheck: DesignCheck;
  designCheckNote: string | null;
  history: MilestoneReviewHistoryItem[];
  tasks: { id: string; name: string }[];
  resultTasks?: { name: string }[];
};

export function reviewShouldShow(input: {
  workStatus: string;
  approval: string;
  historyLength: number;
}): boolean {
  return input.workStatus === 'ready' || input.approval !== 'unreviewed' || input.historyLength > 0;
}

export function deriveReviewVisual(model: ReviewSurfaceModel, forced?: ReviewVisual | null): ReviewVisual {
  if (forced) return forced;
  if (model.approval === 'approved') return 'approved';
  if (model.approval === 'changes_requested') return 'changes';
  if (!model.previewUrl) return 'waiting';
  if (model.designCheck === 'fixes') return 'fixes';
  return 'ready';
}

function designLabel(check: DesignCheck): string {
  if (check === 'pass') return 'DESIGN PASS';
  if (check === 'fixes') return 'FIXES NEEDED';
  return 'DESIGN CHECK · PENDING';
}

function previewHref(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `http://${url}`;
}

function StatusDot({ color }: { color: string }) {
  return (
    <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true" style={{ color, flex: '0 0 auto' }}>
      <circle cx="4" cy="4" r="4" fill="currentColor" />
    </svg>
  );
}

const eyebrowStyle = {
  fontSize: 12,
  lineHeight: '18px',
  letterSpacing: '2.64px',
  color: 'var(--muted)',
  margin: 0,
} as const;

export function ReviewScrim({
  phone,
  label,
  onClose,
  children,
}: {
  phone: boolean;
  label: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  const dialog = (
    <div
      className="ds-scope"
      role="presentation"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 90,
        background: 'rgba(0,0,0,0.1)',
        backdropFilter: 'blur(40px)',
        WebkitBackdropFilter: 'blur(40px)',
        display: 'flex',
        alignItems: phone ? 'flex-end' : 'center',
        justifyContent: 'center',
        padding: phone ? 0 : 24,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onClick={(event) => event.stopPropagation()}
        style={{
          width: phone ? '100%' : 'min(100%, 560px)',
          maxHeight: phone ? '100dvh' : 'min(880px, calc(100dvh - 72px))',
          overflow: 'auto',
          background: 'var(--surface)',
          color: 'var(--fg)',
          border: '1px solid var(--border)',
          borderRadius: phone ? '16px 16px 0 0' : 16,
          padding: phone ? 20 : 28,
        }}
      >
        {children}
      </div>
    </div>
  );
  if (typeof document === 'undefined') return dialog;
  return createPortal(dialog, document.body);
}

export function ReviewDialogBody({
  kind,
  iteration,
  tasks,
  notes,
  onNotes,
  selected,
  onToggle,
  busy,
  fieldError,
  onCancel,
  onSubmit,
}: {
  kind: ReviewDialogKind;
  iteration: number;
  tasks: { id: string; name: string }[];
  notes: string;
  onNotes: (value: string) => void;
  selected: string[];
  onToggle: (id: string) => void;
  busy: boolean;
  fieldError: string | null;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const approve = kind === 'approve';
  return (
    <div className="flex flex-col gap-4">
      <h2 className="type-heading" style={{ fontSize: 20, lineHeight: '30px', margin: 0 }}>
        {approve ? 'Approve milestone' : 'Request changes'}
      </h2>
      <p style={{ margin: 0, fontSize: 14, lineHeight: '21px', color: 'var(--muted)' }}>
        {approve
          ? 'Marks milestone complete and lets it merge. Going live still needs deploy main.'
          : 'Notes become tasks in this milestone. The stage goes back to Building.'}
      </p>
      <label className="flex flex-col gap-2" style={{ fontSize: 14 }}>
        <span>{approve ? 'Log note' : 'What needs to change? *'}</span>
        <textarea
          value={notes}
          onChange={(event) => onNotes(event.target.value)}
          rows={4}
          style={{
            width: '100%',
            border: '1px solid var(--border)',
            borderRadius: 12,
            background: 'var(--bg)',
            color: 'var(--fg)',
            padding: 12,
            font: 'inherit',
          }}
        />
      </label>
      {fieldError ? (
        <p role="alert" style={{ margin: 0, color: 'var(--danger)', fontSize: 14 }}>
          {fieldError}
        </p>
      ) : null}
      {!approve ? (
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ fontSize: 14, marginBottom: 8 }}>Applies to (optional)</legend>
          {tasks.length === 0 ? (
            <p style={{ margin: 0, color: 'var(--muted)', fontSize: 13 }}>Leave all unticked to apply to the whole milestone.</p>
          ) : (
            <ul className="flex flex-col gap-2" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {tasks.map((task) => (
                <li key={task.id}>
                  <label className="flex items-center gap-2" style={{ fontSize: 14 }}>
                    <input
                      type="checkbox"
                      checked={selected.includes(task.id)}
                      onChange={() => onToggle(task.id)}
                    />
                    {task.name}
                  </label>
                </li>
              ))}
            </ul>
          )}
          <p style={{ margin: '8px 0 0', color: 'var(--muted)', fontSize: 12 }}>
            Leave all unticked to apply to the whole milestone.
          </p>
        </fieldset>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2">
        <OutlineButton onClick={onCancel} disabled={busy}>Cancel</OutlineButton>
        <PrimaryButton onClick={onSubmit} disabled={busy}>
          {busy ? (approve ? 'Approving…' : 'Starting…') : approve ? 'Approve' : `Start iteration ${iteration + 1}`}
        </PrimaryButton>
      </div>
    </div>
  );
}

export function MilestoneReviewSurface({
  model,
  layout,
  phone = false,
  forced,
  swap = false,
  closeToken = 0,
  onActive,
  onApprove,
  onRequestChanges,
}: {
  model: ReviewSurfaceModel;
  layout: 'card' | 'row';
  phone?: boolean;
  forced?: ReviewVisual | null;
  /** Task detail replaces itself with the confirm. The page card uses a scrim. */
  swap?: boolean;
  closeToken?: number;
  onActive?: (open: boolean) => void;
  onApprove?: (notes: string) => Promise<void>;
  onRequestChanges?: (notes: string, taskIds: string[]) => Promise<void>;
}) {
  const [dialog, setDialog] = useState<ReviewDialogKind | null>(null);
  const [notes, setNotes] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState<'approve' | 'changes' | null>(null);
  const [failedKind, setFailedKind] = useState<ReviewDialogKind>('approve');
  useEffect(() => {
    onActive?.(dialog != null);
  }, [dialog, onActive]);
  useEffect(() => {
    if (closeToken > 0) setDialog(null);
  }, [closeToken]);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [cardError, setCardError] = useState(false);
  const visual = cardError && !forced ? 'error' : busy && !forced ? 'saving' : deriveReviewVisual(model, forced);
  const locked = visual === 'approved' || visual === 'changes' || visual === 'waiting' || visual === 'saving';
  const latest = model.history[0] ?? null;
  const stamp = latest ? formatReviewStamp(latest.decidedAt) : null;
  const who = latest?.decidedByName ?? 'Peter';

  const submit = async () => {
    if (busy) return;
    if (dialog === 'changes' && !notes.trim()) {
      setFieldError(NOTES_REQUIRED);
      return;
    }
    const kind = dialog;
    if (!kind) return;
    setFieldError(null);
    setBusy(kind);
    setFailedKind(kind);
    try {
      if (kind === 'approve') await onApprove?.(notes.trim());
      else await onRequestChanges?.(notes.trim(), selected);
      setCardError(false);
      setDialog(null);
    } catch {
      setCardError(true);
      setDialog(null);
    } finally {
      setBusy(null);
    }
  };

  const eyebrow =
    visual === 'approved'
      ? `APPROVED · ITERATION ${model.iteration}`
      : visual === 'changes'
        ? `BUILDING · ITERATION ${model.iteration}`
        : phone && layout === 'row'
          ? `READY TO SHIP · ITERATION ${model.iteration}`
          : `READY TO SHIP · ITERATION ${model.iteration} · ${designLabel(visual === 'waiting' ? 'pending' : model.designCheck)}`;

  const actions = (
    <div className={phone || layout === 'row' && phone ? 'flex w-full gap-2' : 'flex gap-2'} style={phone ? { width: '100%' } : undefined}>
      {visual === 'error' ? (
        <PrimaryButton
          onClick={() => {
            setCardError(false);
            setDialog(failedKind);
          }}
        >
          Try again
        </PrimaryButton>
      ) : (
        <>
          <OutlineButton
            disabled={locked}
            onClick={() => {
              setFieldError(null);
              setDialog('changes');
            }}
          >
            {busy === 'changes' ? 'Starting…' : 'Request changes'}
          </OutlineButton>
          <PrimaryButton
            disabled={locked}
            onClick={() => {
              setFieldError(null);
              setDialog('approve');
            }}
          >
            {busy === 'approve' || visual === 'saving' ? 'Approving…' : 'Approve'}
          </PrimaryButton>
        </>
      )}
    </div>
  );

  const preview = model.previewUrl ? (
    <a href={previewHref(model.previewUrl)} target="_blank" rel="noreferrer" style={{ color: 'var(--fg)', fontSize: 14, lineHeight: '21px' }}>
      Open local preview ↗
    </a>
  ) : (
    <span style={{ color: 'var(--muted)', fontSize: 14 }}>Waiting on local build</span>
  );

  const meta = model.previewUrl ? (
    <p className="ds-mono" style={{ margin: 0, fontSize: 12, lineHeight: '18px', color: 'var(--muted)' }}>
      {model.previewUrl} · your Mac · test data
    </p>
  ) : (
    <p style={{ margin: 0, fontSize: 13, lineHeight: '20px', color: 'var(--muted)' }}>{WAITING_COPY}</p>
  );

  const body = (
    <div
      data-testid={layout === 'row' ? 'task-review-row' : 'milestone-review-card'}
      data-review-state={visual}
      className={layout === 'row' ? (phone ? 'flex flex-col gap-2.5' : 'flex items-center gap-3') : 'flex flex-col gap-5'}
      style={{
        background: layout === 'row' ? 'var(--surface-2)' : 'var(--surface)',
        border: visual === 'error' ? '1px solid var(--danger)' : visual === 'waiting' ? '1px dashed var(--border)' : `1px solid ${layout === 'row' ? 'var(--border-2, var(--border))' : 'var(--border)'}`,
        borderRadius: layout === 'row' ? 18 : 12,
        padding: layout === 'row' ? '12px 16px' : '32px 28px',
        opacity: visual === 'waiting' ? 1 : 1,
      }}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <StatusDot color={visual === 'fixes' || visual === 'error' ? 'var(--danger)' : visual === 'approved' ? 'var(--success, var(--fg))' : 'var(--fg)'} />
          <p className="ds-mono" style={eyebrowStyle}>{eyebrow}</p>
        </div>
        {layout === 'card' && model.prNumber ? (
          <h2 className="type-heading" style={{ fontSize: 20, lineHeight: '30px', margin: 0 }}>
            {`PR #${model.prNumber}${model.prTitle ? ` · ${model.prTitle}` : ''}`}
          </h2>
        ) : null}
        {visual === 'approved' ? (
          <>
            <p style={{ margin: 0, fontSize: 14, lineHeight: '21px' }}>{`Approved by ${who}${stamp ? ` · ${stamp}` : ''}`}</p>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>{APPROVED_READONLY}</p>
          </>
        ) : visual === 'changes' ? (
          <>
            <h2 className="type-heading" style={{ fontSize: 20, lineHeight: '30px', margin: 0 }}>Changes requested</h2>
            {latest?.notes ? <p style={{ margin: 0, fontSize: 14, lineHeight: '21px' }}>{latest.notes}</p> : null}
            <p className="ds-mono" style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>
              {`${who}${stamp ? ` · ${stamp}` : ''} · applies to ${latest?.taskCount ?? model.resultTasks?.length ?? 0} tasks`}
            </p>
            {(model.resultTasks ?? []).map((task) => (
              <p key={task.name} className="ds-mono" style={{ margin: 0, fontSize: 12 }}>
                {`NEW · IT. ${model.iteration} · ${task.name}`}
              </p>
            ))}
            <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>{NEXT_BUILD_COPY}</p>
          </>
        ) : (
          <>
            {preview}
            {meta}
            {visual === 'fixes' && model.designCheckNote ? (
              <p style={{ margin: 0, fontSize: 13, lineHeight: '20px', color: 'var(--muted)' }}>{model.designCheckNote}</p>
            ) : null}
            {visual === 'error' ? (
              <p role="alert" style={{ margin: 0, fontSize: 14, color: 'var(--danger)' }}>{APPROVAL_SAVE_ERROR}</p>
            ) : null}
            {layout === 'card' && (model.branch || model.commit) ? (
              <p className="ds-mono" style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>
                {[model.branch, model.commit, model.builtAt ? formatReviewStamp(model.builtAt) : null].filter(Boolean).join(' · ')}
              </p>
            ) : null}
          </>
        )}
      </div>
      {visual === 'approved' || visual === 'changes' ? null : actions}
    </div>
  );

  const history = layout === 'card' && model.history.length > 0 ? (
    <section data-testid="milestone-iterations" className="flex flex-col gap-2">
      <h3 className="ds-mono" style={{ ...eyebrowStyle, color: 'var(--fg)' }}>ITERATIONS</h3>
      <ul className="flex flex-col gap-2" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {model.history.map((item) => (
          <li key={`${item.iteration}-${item.decidedAt}`} style={{ fontSize: 14, lineHeight: '21px' }}>
            <span className="ds-mono" style={{ fontSize: 12, color: 'var(--muted)' }}>
              {`${item.iteration} · ${formatReviewStamp(item.decidedAt)} · ${iterationOutcome({
                iteration: item.iteration,
                currentIteration: model.iteration,
                decision: item.decision,
                workStatus: model.workStatus,
              })}`}
            </span>
            {item.notes ? ` · ${item.notes}` : ''}
          </li>
        ))}
      </ul>
    </section>
  ) : null;

  const dialogNode = dialog ? (
    <ReviewDialogBody
      kind={dialog}
      iteration={model.iteration}
      tasks={model.tasks}
      notes={notes}
      onNotes={(value) => {
        setNotes(value);
        if (value.trim()) setFieldError(null);
      }}
      selected={selected}
      onToggle={(id) => setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))}
      busy={busy != null}
      fieldError={fieldError}
      onCancel={() => setDialog(null)}
      onSubmit={() => void submit()}
    />
  ) : null;

  if (swap && dialogNode) return dialogNode;

  return (
    <div className="flex flex-col gap-4">
      {body}
      {history}
      {dialogNode && !swap ? (
        <ReviewScrim phone={phone} label={dialog === 'approve' ? 'Approve milestone' : 'Request changes'} onClose={() => setDialog(null)}>
          {dialogNode}
        </ReviewScrim>
      ) : null}
    </div>
  );
}

export function reviewModelFromMilestone(
  milestone: Pick<MilestoneRoadmapView, 'id' | 'workStatus' | 'approval' | 'rows'> & { review: MilestoneReviewView },
): ReviewSurfaceModel {
  return {
    milestoneId: milestone.id,
    iteration: milestone.review.iteration,
    workStatus: milestone.workStatus,
    approval: milestone.approval,
    previewUrl: milestone.review.previewUrl,
    prNumber: milestone.review.prNumber,
    prTitle: milestone.review.prTitle,
    branch: milestone.review.branch,
    commit: milestone.review.commit,
    builtAt: milestone.review.builtAt,
    designCheck: milestone.review.designCheck,
    designCheckNote: milestone.review.designCheckNote,
    history: milestone.review.history,
    tasks: milestone.rows.map((row) => ({ id: row.id, name: row.name })),
  };
}

export function MilestoneReviewLive({
  milestone,
  hostSlug,
  phone = false,
}: {
  milestone: MilestoneRoadmapView;
  hostSlug?: string;
  phone?: boolean;
}) {
  const approve = useMutation(api.milestones.approve);
  const requestChanges = useMutation(api.milestones.requestChanges);
  const review = milestone.review;
  if (!review || !reviewShouldShow({ workStatus: milestone.workStatus, approval: milestone.approval, historyLength: review.history.length })) {
    return null;
  }
  const model = reviewModelFromMilestone({ ...milestone, review });
  return (
    <MilestoneReviewSurface
      model={model}
      layout="card"
      phone={phone}
      onApprove={async (notes) => {
        await approve({
          hostSlug,
          milestoneId: model.milestoneId as Id<'milestones'>,
          iteration: model.iteration,
          notes,
        });
      }}
      onRequestChanges={async (notes, taskIds) => {
        try {
          await requestChanges({
            hostSlug,
            milestoneId: model.milestoneId as Id<'milestones'>,
            iteration: model.iteration,
            notes,
            taskIds: taskIds as Id<'tasks'>[],
          });
        } catch (err) {
          throw new Error(userFacingErrorMessage(err, APPROVAL_SAVE_ERROR));
        }
      }}
    />
  );
}
