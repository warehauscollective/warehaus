'use client';

import { useEffect, useState } from 'react';
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
import { MilestoneDialog } from './milestoneChrome';

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
  milestoneName?: string;
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

function designPillLabel(check: DesignCheck): string {
  if (check === 'pass') return 'DESIGN CHECK · PASS';
  if (check === 'fixes') return 'DESIGN CHECK · FIXES NEEDED';
  return 'DESIGN CHECK · PENDING';
}

function designCheckWords(check: DesignCheck): string {
  if (check === 'pass') return 'pass';
  if (check === 'fixes') return 'fixes needed';
  return 'pending';
}

function shortReviewDate(ms: number): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' }).format(new Date(ms));
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M2.2 6.2 4.7 8.7 9.8 3.4" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

export const REVIEW_CARD_FOOTER = 'Approve marks it complete and lets it merge · going live still needs deploy main';

function DesignCheckPill({ check }: { check: DesignCheck }) {
  return (
    <span
      className="ds-mono"
      data-testid="design-check-pill"
      style={{
        border: '1px solid var(--border-2)',
        borderRadius: 999,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 8px',
        fontSize: 12,
        lineHeight: '18px',
        color: 'var(--fg)',
        whiteSpace: 'nowrap',
      }}
    >
      <CheckIcon />
      {designPillLabel(check)}
    </span>
  );
}

function ExternalLinkIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: '0 0 auto', marginTop: 2 }}>
      <path d="M6 3H3.5A1.5 1.5 0 0 0 2 4.5v8A1.5 1.5 0 0 0 3.5 14h8A1.5 1.5 0 0 0 13 12.5V10" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M9 2h5v5M14 2 7.5 8.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function PreviewBox({ url }: { url: string }) {
  return (
    <div
      data-testid="review-preview-box"
      style={{
        border: '1px solid var(--border)',
        borderRadius: 18,
        padding: '14px 16px',
        display: 'flex',
        gap: 12,
        alignItems: 'flex-start',
      }}
    >
      <ExternalLinkIcon />
      <div className="flex min-w-0 flex-col gap-1">
        <a href={previewHref(url)} target="_blank" rel="noreferrer" style={{ color: 'var(--fg)', textDecoration: 'underline', fontSize: 14, lineHeight: '21px' }}>
          Open local preview
        </a>
        <p className="ds-mono" style={{ margin: 0, fontSize: 12, lineHeight: '18px' }}>{url}</p>
        <p className="ds-mono" style={{ margin: 0, fontSize: 12, lineHeight: '18px', color: 'var(--muted)' }}>Runs on your Mac · test data</p>
      </div>
    </div>
  );
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
  hint,
  onClose,
  onConfirm,
  footer,
  contained = false,
  cover = false,
  confirmOnEnter = false,
  children,
}: {
  phone: boolean;
  label: string;
  hint?: string;
  onClose: () => void;
  onConfirm?: () => void;
  footer?: React.ReactNode;
  contained?: boolean;
  cover?: boolean;
  confirmOnEnter?: boolean;
  children: React.ReactNode;
}) {
  return (
    <MilestoneDialog
      title={label}
      phone={phone}
      hint={hint}
      onClose={onClose}
      onConfirm={onConfirm}
      footer={footer}
      contained={contained}
      cover={cover}
      confirmOnEnter={confirmOnEnter}
      trapFocus={!contained}
      testId="milestone-review-dialog"
    >
      {children}
    </MilestoneDialog>
  );
}

export function ReviewDialogBody({
  kind,
  tasks,
  notes,
  onNotes,
  selected,
  onToggle,
  fieldError,
  context,
}: {
  kind: ReviewDialogKind;
  tasks: { id: string; name: string }[];
  notes: string;
  onNotes: (value: string) => void;
  selected: string[];
  onToggle: (id: string) => void;
  fieldError: string | null;
  context?: {
    milestoneName: string;
    iteration: number;
    prNumber: number | null;
    commit: string | null;
    designCheck: DesignCheck;
  };
}) {
  const approve = kind === 'approve';
  const contextLine = context
    ? [context.prNumber != null ? `PR #${context.prNumber}` : null, context.commit, `design check ${designCheckWords(context.designCheck)}`]
        .filter(Boolean)
        .join(' · ')
    : null;
  return (
    <div className="flex flex-col gap-3">
      {context ? (
        <p style={{ margin: 0, fontSize: 14, lineHeight: '21px', fontWeight: 600 }}>
          {`${context.milestoneName} · Iteration ${context.iteration}`}
        </p>
      ) : null}
      {contextLine ? (
        <p className="ds-mono" style={{ margin: 0, fontSize: 12, lineHeight: '18px', color: 'var(--muted)' }}>{contextLine}</p>
      ) : null}
      {approve ? (
        <>
          <p style={{ margin: 0, border: '1px solid var(--border-2)', borderRadius: 16, padding: '12px 14px', fontSize: 14, lineHeight: '21px' }}>
            Marks milestone complete and lets it merge. Going live still needs deploy main.
          </p>
          <p style={{ margin: 0, fontSize: 14, lineHeight: '21px', color: 'var(--muted)' }}>
            Logged as “Approved by Peter” with the date and time, in the Portal and in Grok Bot chat.
          </p>
        </>
      ) : (
        <>
          <p style={{ margin: 0, fontSize: 14, lineHeight: '21px', color: 'var(--muted)' }}>
            {`Starts iteration ${context ? context.iteration + 1 : ''}. Notes become tasks in this milestone. The stage goes back to Building.`}
          </p>
          <label className="flex flex-col gap-2" style={{ fontSize: 14 }}>
            <span>What needs to change? *</span>
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
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend style={{ fontSize: 14, marginBottom: 8 }}>Applies to (optional)</legend>
            {tasks.length > 0 ? (
              <ul className="flex flex-col gap-2" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {tasks.map((task) => {
                  const checked = selected.includes(task.id);
                  return (
                    <li key={task.id}>
                      <label className="flex items-center gap-2" style={{ fontSize: 14 }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => onToggle(task.id)}
                          style={{ width: 16, height: 16, accentColor: 'var(--fg)' }}
                        />
                        {task.name}
                      </label>
                    </li>
                  );
                })}
              </ul>
            ) : null}
            <p style={{ margin: tasks.length > 0 ? '8px 0 0' : 0, color: 'var(--muted)', fontSize: 12 }}>
              Leave all unticked to apply to the whole milestone.
            </p>
          </fieldset>
        </>
      )}
      {fieldError ? (
        <p role="alert" style={{ margin: 0, color: 'var(--danger-text)', fontSize: 14 }}>
          {fieldError}
        </p>
      ) : null}
    </div>
  );
}

export function ReviewDialogActions({
  approve,
  iteration,
  busy,
  phone = false,
  onCancel,
  onSubmit,
}: {
  approve: boolean;
  iteration: number;
  busy: boolean;
  phone?: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const buttonClass = phone ? 'w-full' : undefined;
  return (
    <>
      <OutlineButton onClick={onCancel} disabled={busy} className={buttonClass}>Cancel</OutlineButton>
      <PrimaryButton onClick={onSubmit} disabled={busy} className={buttonClass}>
        {busy ? (approve ? 'Approving…' : 'Starting…') : approve ? 'Approve' : `Start iteration ${iteration + 1}`}
      </PrimaryButton>
    </>
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
        : `READY TO SHIP · ITERATION ${model.iteration}`;
  const dim = visual === 'waiting' ? 0.4 : 0.55;

  const buttonClass = phone ? 'w-full' : undefined;
  const actions = (
    <div className={phone ? 'flex w-full flex-col gap-2' : 'flex gap-2'} style={phone ? { width: '100%' } : undefined}>
      {visual === 'error' ? (
        <>
          <OutlineButton
            className={buttonClass}
            onClick={() => {
              setCardError(false);
              setDialog('changes');
            }}
          >
            Request changes
          </OutlineButton>
          <PrimaryButton
            className={buttonClass}
            onClick={() => {
              setCardError(false);
              setDialog(failedKind ?? 'approve');
            }}
          >
            Try again
          </PrimaryButton>
        </>
      ) : (
        <>
          <OutlineButton
            className={buttonClass}
            disabled={locked}
            disabledOpacity={dim}
            onClick={() => {
              setFieldError(null);
              setDialog('changes');
            }}
          >
            {busy === 'changes' ? 'Starting…' : 'Request changes'}
          </OutlineButton>
          <PrimaryButton
            className={buttonClass}
            disabled={locked}
            disabledOpacity={dim}
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

  const body = (
    <div
      data-review-state={visual}
      className="flex flex-col gap-5"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className={phone ? 'flex flex-col items-start gap-2' : 'flex items-center justify-between gap-3'}>
          <div className="flex min-w-0 items-center gap-2">
            <StatusDot color={visual === 'fixes' || visual === 'error' ? 'var(--danger)' : visual === 'approved' ? 'var(--success, var(--fg))' : 'var(--fg)'} />
            <p className="ds-mono" style={{ ...eyebrowStyle, whiteSpace: 'nowrap' }}>{eyebrow}</p>
          </div>
          {visual === 'changes' ? null : <DesignCheckPill check={visual === 'waiting' ? 'pending' : model.designCheck} />}
        </div>
        {layout === 'card' && model.prNumber ? (
          <h2 className="type-heading" style={{ fontSize: 20, lineHeight: '30px', margin: 0 }}>
            {`PR #${model.prNumber}${model.prTitle ? ` · ${model.prTitle}` : ''}`}
          </h2>
        ) : null}
        {layout === 'card' && (model.branch || model.commit) && visual !== 'changes' && visual !== 'approved' ? (
          <p className="ds-mono" style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>
            {[model.branch, model.commit, model.builtAt ? formatReviewStamp(model.builtAt) : null].filter(Boolean).join(' · ')}
          </p>
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
            {(model.resultTasks ?? model.tasks.map((task) => ({ name: task.name }))).map((task) => (
              <label key={task.name} className="flex items-center justify-between gap-3" style={{ fontSize: 14 }}>
                <span className="flex items-center gap-2">
                  <input type="checkbox" disabled style={{ width: 16, height: 16, accentColor: 'var(--fg)' }} />
                  {task.name}
                </span>
                <span className="ds-mono" style={{ whiteSpace: 'nowrap', fontSize: 11, border: '1px solid var(--border-2)', borderRadius: 999, padding: '2px 8px' }}>{`NEW · IT. ${model.iteration}`}</span>
              </label>
            ))}
            <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>{NEXT_BUILD_COPY}</p>
          </>
        ) : (
          <>
            {model.previewUrl ? <PreviewBox url={model.previewUrl} /> : (
              <div data-testid="review-waiting-box" style={{ border: '1px dashed var(--border-2)', borderRadius: 18, padding: 16 }}>
                <p style={{ margin: 0, fontSize: 13, lineHeight: '20px', color: 'var(--muted)' }}>{WAITING_COPY}</p>
              </div>
            )}
            {visual === 'fixes' && model.designCheckNote ? (
              <p style={{ margin: 0, fontSize: 13, lineHeight: '20px', color: 'var(--muted)' }}>{model.designCheckNote}</p>
            ) : null}
            {visual === 'error' ? (
              <div role="alert" data-testid="review-error-box" style={{ border: '1px solid var(--danger)', borderRadius: 16, padding: '12px 14px' }}>
                <p style={{ margin: 0, fontSize: 14, lineHeight: '21px', color: 'var(--danger-text)' }}>{APPROVAL_SAVE_ERROR}</p>
              </div>
            ) : null}
          </>
        )}
      </div>
      {visual === 'approved' || visual === 'changes' ? null : (
        <div className={phone ? 'flex flex-col gap-3' : 'flex items-center justify-between gap-4'}>
          {layout === 'card' ? (
            <p className="ds-mono" style={{ margin: 0, fontSize: 12, lineHeight: '18px', color: 'var(--muted)', flex: '1 1 auto' }}>{REVIEW_CARD_FOOTER}</p>
          ) : null}
          {actions}
        </div>
      )}
    </div>
  );

  const listed = new Set(model.history.map((item) => item.iteration));
  const iterationRows = [
    ...(!listed.has(model.iteration) && visual !== 'approved'
      ? [{
          key: `current-${model.iteration}`,
          iteration: model.iteration,
          at: model.builtAt,
          tag: (visual === 'changes' ? 'Building' : 'In review') as 'Building' | 'In review',
          notes: visual === 'changes' ? '2 tasks from your notes + design re-check' : model.prNumber ? `PR #${model.prNumber}${model.prTitle ? ` · ${model.prTitle}` : ''}` : '',
        }]
      : []),
    ...model.history.map((item) => ({
      key: `${item.iteration}-${item.decidedAt}`,
      iteration: item.iteration,
      at: item.decidedAt,
      tag: iterationOutcome({
        iteration: item.iteration,
        currentIteration: model.iteration,
        decision: item.decision,
        workStatus: model.workStatus,
      }),
      notes: item.notes,
    })),
  ];

  const history = layout === 'card' && iterationRows.length > 0 ? (
    <section data-testid="milestone-iterations" className="flex flex-col gap-2">
      <h3 className="type-heading" style={{ fontSize: 16, lineHeight: '24px', margin: 0 }}>{`Iterations · ${iterationRows.length}`}</h3>
      <ul className="flex flex-col" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {iterationRows.map((item) => (
          <li key={item.key} style={{ borderTop: '1px solid var(--border)', padding: '12px 0' }}>
            <div className="flex items-center justify-between gap-3">
              <span className="ds-mono" style={{ fontSize: 12, lineHeight: '18px', whiteSpace: 'nowrap' }}>
                {`ITERATION ${item.iteration}`}
                {item.at ? <span style={{ color: 'var(--muted)' }}>{` ${shortReviewDate(item.at)}`}</span> : null}
              </span>
              <span className="ds-mono" style={{ whiteSpace: 'nowrap', border: '1px solid var(--border-2)', borderRadius: 999, padding: '3px 8px', fontSize: 12, lineHeight: '18px' }}>
                {item.tag}
              </span>
            </div>
            {item.notes ? <p style={{ margin: '8px 0 0', fontSize: 14, lineHeight: '21px' }}>{item.notes}</p> : null}
          </li>
        ))}
      </ul>
    </section>
  ) : null;

  const dialogNode = dialog ? (
    <ReviewScrim
      phone={phone}
      label={dialog === 'approve' ? 'Approve milestone' : 'Request changes'}
      hint={dialog === 'changes' ? '⌘↵ to submit · Esc to close' : '↵ to approve · Esc to close'}
      confirmOnEnter={dialog === 'approve'}
      onClose={() => setDialog(null)}
      onConfirm={() => void submit()}
      footer={
        <ReviewDialogActions
          approve={dialog === 'approve'}
          iteration={model.iteration}
          busy={busy != null}
          phone={phone}
          onCancel={() => setDialog(null)}
          onSubmit={() => void submit()}
        />
      }
    >
      <ReviewDialogBody
        kind={dialog}
        tasks={model.tasks}
        notes={notes}
        onNotes={(value) => {
          setNotes(value);
          if (value.trim()) setFieldError(null);
        }}
        selected={selected}
        onToggle={(id) => setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))}
        fieldError={fieldError}
        context={{
          milestoneName: model.milestoneName ?? 'Milestone',
          iteration: model.iteration,
          prNumber: model.prNumber,
          commit: model.commit,
          designCheck: model.designCheck,
        }}
      />
    </ReviewScrim>
  ) : null;

  if (swap && dialogNode) return dialogNode;

  const row = (
    <div
      data-testid="task-review-row"
      data-review-state={visual}
      className={phone ? 'flex flex-col gap-3' : 'flex items-center justify-between gap-4'}
      style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, padding: '12px 16px' }}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <p className="ds-mono" style={{ ...eyebrowStyle, whiteSpace: 'nowrap' }}>{`${eyebrow} · ${designPillLabel(visual === 'waiting' ? 'pending' : model.designCheck)}`}</p>
        {model.previewUrl ? (
          <>
            <a href={`http://${model.previewUrl}`} style={{ fontSize: 14, color: 'var(--fg)', textDecoration: 'underline' }}>Open local preview</a>
            <p className="ds-mono" style={{ margin: 0, fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{`${model.previewUrl} · your Mac · test data`}</p>
          </>
        ) : null}
      </div>
      {visual === 'approved' || visual === 'changes' ? null : actions}
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      {layout === 'row' ? row : (
        <div data-testid="milestone-review-card" data-review-state={visual} className="flex flex-col gap-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 28, padding: '32px 28px' }}>
          {body}
          {history}
        </div>
      )}
      {dialogNode}
    </div>
  );
}

export function reviewModelFromMilestone(
  milestone: Pick<MilestoneRoadmapView, 'id' | 'name' | 'workStatus' | 'approval' | 'rows'> & { review: MilestoneReviewView },
): ReviewSurfaceModel {
  return {
    milestoneId: milestone.id,
    milestoneName: milestone.name,
    iteration: milestone.review.iteration,
    workStatus: milestone.workStatus,
    approval: milestone.approval ?? 'unreviewed',
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
  if (!review || !reviewShouldShow({ workStatus: milestone.workStatus, approval: milestone.approval ?? 'unreviewed', historyLength: review.history.length })) {
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
