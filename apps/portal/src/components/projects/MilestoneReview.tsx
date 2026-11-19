'use client';

import { useEffect, useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import type { MilestoneReviewHistoryItem, MilestoneReviewView, MilestoneRoadmapView } from '@convex/_lib/milestones';
import {
  NOTES_REQUIRED,
  formatReviewStamp,
  isPeterEmail,
  iterationOutcome,
  type DesignCheck,
} from '@convex/_lib/milestoneReview';
import { userFacingErrorMessage } from '@convex/_lib/userFacingError';
import { usePortalAuth } from '@/hooks/usePortalAuth';
import { OutlineButton, PrimaryButton } from '@/components/ui/primitives';
import { MilestoneDialog } from './milestoneChrome';

export const APPROVAL_SAVE_ERROR = 'Couldn’t save your approval. Nothing changed. Try again.';
export const APPROVED_READONLY = 'Read-only · stage stays Ready to Ship. Merge and deploy wait on GitHub and Vercel.';
export const APPROVED_DESIGN = 'Read-only · merging and deploying · Shipped is set automatically on merge';
export const WAITING_COPY = 'A protected preview builds when this is ready for review. The link shows here and in Grok Bot chat.';
export const NEXT_BUILD_COPY = 'The next preview builds when iteration 3 is ready for review. The link shows here and in Grok Bot chat.';
export const DEPLOY_FOOTER = 'Approve & deploy merges to main and ships to production · Peter only';

export type ReviewVisual =
  | 'ready'
  | 'waiting'
  | 'building'
  | 'preview-failed'
  | 'fixes'
  | 'saving'
  | 'error'
  | 'approved'
  | 'changes'
  | 'delete-failed'
  | 'couldnt-remove';
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
  /** Open design fixes. The approve dialog counts them from this, not from copy. */
  designFixCount?: number;
  /** Fixture-only. The live card does not claim a deploy is running. */
  designApprovedCopy?: boolean;
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

function ClockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <circle cx="6" cy="6" r="4.25" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M6 3.4V6.1L7.7 7.1" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path d="M7 1.6 12.6 12H1.4L7 1.6Z" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M7 5.2v2.6" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="7" cy="9.6" r="0.7" fill="currentColor" />
    </svg>
  );
}

function DesignStatusIcon({ check }: { check: DesignCheck }) {
  if (check === 'pass') return <CheckIcon />;
  if (check === 'fixes') return <span style={{ color: 'var(--danger-text)', display: 'inline-flex' }}><AlertIcon /></span>;
  return <ClockIcon />;
}

function StyledCheckbox({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange?: () => void;
}) {
  return (
    <span style={{ position: 'relative', width: 16, height: 16, flex: '0 0 auto' }}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        style={{ position: 'absolute', inset: 0, margin: 0, opacity: 0, cursor: disabled ? 'default' : 'pointer' }}
      />
      <span
        aria-hidden="true"
        style={{
          display: 'flex',
          width: 16,
          height: 16,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 4,
          border: '1.5px solid var(--border-2)',
          background: checked ? 'var(--fg)' : 'transparent',
          color: 'var(--bg)',
        }}
      >
        {checked ? <svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 5.2 4.1 7.2 8 2.8" fill="none" stroke="currentColor" strokeWidth="1.4" /></svg> : null}
      </span>
    </span>
  );
}

export const REVIEW_CARD_FOOTER = DEPLOY_FOOTER;

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
      <DesignStatusIcon check={check} />
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

function PreviewBox({ url, commit, iteration }: { url: string; commit: string | null; iteration: number }) {
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
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <a href={previewHref(url)} target="_blank" rel="noreferrer" style={{ color: 'var(--fg)', textDecoration: 'underline', fontSize: 14, lineHeight: '21px' }}>
          Open preview
        </a>
        <p className="ds-mono" style={{ margin: 0, fontSize: 12, lineHeight: '18px', overflowWrap: 'anywhere' }}>{url}</p>
        <p className="ds-mono" style={{ margin: 0, fontSize: 12, lineHeight: '18px' }}>{`Built from ${commit ?? 'the latest commit'} · Iteration ${iteration}`}</p>
        <p className="ds-mono" style={{ margin: 0, fontSize: 12, lineHeight: '18px', color: 'var(--muted)' }}>Protected Vercel preview · test data · sign in</p>
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
    designFixCount?: number;
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
      {approve && context?.designCheck === 'fixes' && context.designFixCount ? (
        <p style={{ margin: 0, fontSize: 14, lineHeight: '21px' }}>
          {`${context.designFixCount} design ${context.designFixCount === 1 ? 'fix is' : 'fixes are'} still open…`}
        </p>
      ) : null}
      {approve ? (
        <div style={{ fontSize: 14, lineHeight: '21px' }}>
          <p style={{ margin: 0 }}>Marks approved. Engineering merges to main and deploys production next.</p>
          <p style={{ margin: 0 }}>This ships to production.</p>
          <p style={{ margin: 0 }}>You can’t undo this from the Portal.</p>
          <p style={{ margin: '8px 0 0', color: 'var(--muted)', fontSize: 12, lineHeight: '18px' }}>
            Merge and deploy wait on GitHub and Vercel. This records the approval and leaves the stage at Ready to Ship.
          </p>
        </div>
      ) : (
        <>
          <p className="ds-mono" style={{ margin: 0, fontSize: 12, lineHeight: '18px', letterSpacing: '2.64px', textTransform: 'uppercase', color: 'var(--muted)' }}>
            {context ? `${context.milestoneName} · Iteration ${context.iteration}${context.prNumber != null ? ` · PR #${context.prNumber}` : ''}` : ''}
          </p>
          <label className="flex flex-col gap-2" style={{ fontSize: 14 }}>
            <span>What needs to change? *</span>
            <textarea
              value={notes}
              onChange={(event) => onNotes(event.target.value)}
              rows={4}
              style={{
                width: '100%',
                border: fieldError ? '1px solid var(--danger)' : '1px solid var(--border)',
                borderRadius: 12,
                background: 'var(--surface-2)',
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
                        <StyledCheckbox checked={checked} onChange={() => onToggle(task.id)} />
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
          <p className="ds-mono" style={{ margin: 0, fontSize: 12, lineHeight: '18px', color: 'var(--muted)' }}>
            {`Starts iteration ${context ? context.iteration + 1 : ''}. Your notes become tasks in this milestone and the stage moves back to Building.`}
          </p>
        </>
      )}
      {fieldError ? (
        <p role="alert" className="flex items-start gap-2" style={{ margin: 0, color: 'var(--danger-text)', fontSize: 14, lineHeight: '21px' }}>
          <AlertIcon />
          <span>{fieldError}</span>
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
  submitLabel,
  onCancel,
  onSubmit,
}: {
  approve: boolean;
  iteration: number;
  busy: boolean;
  phone?: boolean;
  /** Replaces the default submit label. A failed save uses Try again. */
  submitLabel?: string;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const buttonClass = phone ? 'w-full' : undefined;
  const label = busy
    ? approve
      ? 'Merging and deploying…'
      : 'Starting…'
    : submitLabel ?? (approve ? 'Approve & deploy' : `Start iteration ${iteration + 1}`);
  return (
    <>
      <OutlineButton onClick={onCancel} disabled={busy} className={buttonClass}>Cancel</OutlineButton>
      {approve ? (
        <button
          type="button"
          onClick={onSubmit}
          disabled={busy}
          className={buttonClass}
          style={{
            background: '#f59e0b',
            color: '#0a0a0b',
            border: 0,
            borderRadius: 9,
            padding: '12px 16px',
            fontSize: 14,
            fontWeight: 500,
            opacity: busy ? 0.7 : 1,
            cursor: busy ? 'wait' : 'pointer',
          }}
        >
          {label}
        </button>
      ) : (
        <PrimaryButton onClick={onSubmit} disabled={busy} className={buttonClass}>
          {label}
        </PrimaryButton>
      )}
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
  isPeter = false,
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
  /** Approve & deploy is Peter only. Request changes stays for staff. */
  isPeter?: boolean;
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
  const locked = visual === 'approved' || visual === 'changes' || visual === 'waiting' || visual === 'building' || visual === 'preview-failed' || visual === 'delete-failed' || visual === 'couldnt-remove';
  const blocked = locked || visual === 'saving';
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
        : visual === 'delete-failed' || visual === 'couldnt-remove'
      ? `APPROVED · ITERATION ${model.iteration}`
      : `READY TO SHIP · ITERATION ${model.iteration}`;
  const dim = visual === 'waiting' ? 0.4 : 0.55;

  const buttonClass = phone ? 'w-full' : undefined;
  const requestChanges = (
    <OutlineButton
      nowrap={!phone}
      className={buttonClass}
      disabled={visual === 'error' ? false : blocked}
      disabledOpacity={visual === 'error' ? undefined : dim}
      onClick={() => {
        setCardError(false);
        setFieldError(null);
        setDialog('changes');
      }}
    >
      {busy === 'changes' ? 'Starting…' : 'Request changes'}
    </OutlineButton>
  );
  const primary = (
    <button
      type="button"
      className={buttonClass}
      data-testid="approve-deploy"
      disabled={visual === 'error' ? false : blocked}
      onClick={() => {
        setCardError(false);
        setFieldError(null);
        setDialog(visual === 'error' ? failedKind ?? 'approve' : 'approve');
      }}
      style={{
        background: '#f59e0b',
        color: '#0a0a0b',
        border: 0,
        borderRadius: 9,
        padding: '12px 16px',
        fontSize: 14,
        fontWeight: 500,
        opacity: visual === 'error' ? 1 : visual === 'saving' ? 0.7 : blocked ? dim : 1,
        cursor: visual === 'error' || !blocked ? 'pointer' : 'not-allowed',
        whiteSpace: 'nowrap',
      }}
    >
      {visual === 'error' ? 'Try again' : busy === 'approve' || visual === 'saving' ? 'Approving…' : 'Approve & deploy'}
    </button>
  );
  const actions = (
    <div className={phone ? 'flex w-full flex-col gap-2' : 'flex shrink-0 gap-2'} style={phone ? { width: '100%' } : undefined}>
      {phone ? <>{isPeter ? primary : null}{requestChanges}</> : <>{requestChanges}{isPeter ? primary : null}</>}
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
            <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>{model.designApprovedCopy ? APPROVED_DESIGN : APPROVED_READONLY}</p>
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
                  <StyledCheckbox checked={false} disabled />
                  {task.name}
                </span>
                <span className="ds-mono" style={{ whiteSpace: 'nowrap', fontSize: 11, border: '1px solid var(--border-2)', borderRadius: 999, padding: '2px 8px' }}>{`NEW · IT. ${model.iteration}`}</span>
              </label>
            ))}
            <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>{NEXT_BUILD_COPY}</p>
          </>
        ) : (
          <>
            {model.previewUrl && visual !== 'building' && visual !== 'preview-failed' && visual !== 'delete-failed' && visual !== 'couldnt-remove' ? <PreviewBox url={model.previewUrl} commit={model.commit} iteration={model.iteration} /> : visual === 'building' || visual === 'preview-failed' || visual === 'delete-failed' || visual === 'couldnt-remove' ? (
              <div role="status" style={{ border: visual === 'building' ? '1px dashed var(--border)' : `1px solid ${visual === 'delete-failed' ? '#f59e0b' : 'var(--danger)'}`, borderRadius: 18, padding: 16 }}>
                <p style={{ margin: 0, fontSize: 14, lineHeight: '21px' }}>
                  {visual === 'building' ? 'Building preview…' : visual === 'preview-failed' ? 'Preview failed to build' : visual === 'delete-failed' ? 'Removing preview… · retrying automatically' : "Couldn't remove preview"}
                </p>
                <p className="ds-mono" style={{ margin: '4px 0 0', fontSize: 12, lineHeight: '18px', color: visual === 'delete-failed' ? '#f59e0b' : 'var(--muted)' }}>
                  {visual === 'building'
                    ? 'Protected Vercel preview for this iteration · usually a few minutes. The link shows here and in Grok Bot chat.'
                    : visual === 'preview-failed'
                      ? 'Nothing changed. The milestone stays at Ready to Ship until a preview exists.'
                      : visual === 'delete-failed'
                        ? 'Delete failed · retrying automatically. Staff see this. Peter and clients see the approved card.'
                        : 'Vercel build still exists. Staff can retry. Peter and clients do not see Retry.'}
                </p>
              </div>
            ) : (
              <div data-testid="review-waiting-box" className="flex items-start gap-3" style={{ border: '1px dashed var(--border-2)', borderRadius: 18, padding: 16 }}>
                <ClockIcon />
                <div>
                  <p style={{ margin: 0, fontSize: 14, lineHeight: '21px' }}>Waiting for review build</p>
                  <p className="ds-mono" style={{ margin: '4px 0 0', fontSize: 12, lineHeight: '18px', color: 'var(--muted)' }}>{WAITING_COPY}</p>
                </div>
              </div>
            )}
            {visual === 'fixes' && model.designCheckNote ? (
              <p style={{ margin: 0, fontSize: 13, lineHeight: '20px', color: 'var(--muted)' }}>{model.designCheckNote}</p>
            ) : null}
            {visual === 'error' ? (
              <div role="alert" data-testid="review-error-box" className="flex items-start gap-2" style={{ border: '1px solid var(--danger)', borderRadius: 16, padding: '12px 14px', color: 'var(--danger-text)' }}>
                <AlertIcon />
                <p style={{ margin: 0, fontSize: 14, lineHeight: '21px' }}>{APPROVAL_SAVE_ERROR}</p>
              </div>
            ) : null}
          </>
        )}
      </div>
      {visual === 'approved' || visual === 'changes' || visual === 'delete-failed' || visual === 'couldnt-remove' ? null : (
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
      label={dialog === 'approve' ? 'Approve and ship to production?' : 'Request changes'}
      hint={dialog === 'changes' ? '⌘↵ to submit · Esc to close' : '↵ to confirm · Esc to close'}
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
          designFixCount: model.designFixCount,
        }}
      />
    </ReviewScrim>
  ) : null;

  if (swap && dialogNode) return dialogNode;

  const row = (
    <div
      data-testid="task-review-row"
      data-review-state={visual}
      className={phone ? 'flex w-full min-w-0 flex-col gap-3' : 'flex items-center justify-between gap-4'}
      style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, padding: '12px 16px', boxSizing: 'border-box', maxWidth: '100%' }}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="ds-mono" style={{ ...eyebrowStyle, whiteSpace: phone ? 'normal' : 'nowrap' }}>
          {phone ? eyebrow : `${eyebrow} · ${designPillLabel(visual === 'waiting' ? 'pending' : model.designCheck)}`}
        </p>
        {model.previewUrl ? (
          <>
            <a href={previewHref(model.previewUrl)} style={{ fontSize: 14, color: 'var(--fg)', textDecoration: 'underline' }}>Open preview</a>
            <p className="ds-mono" style={{ margin: 0, fontSize: 12, lineHeight: '18px', color: 'var(--muted)', whiteSpace: phone ? 'normal' : 'nowrap', overflowWrap: 'anywhere' }}>{`${model.previewUrl} · Protected Vercel preview · test data`}</p>
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
  isPeter,
}: {
  milestone: MilestoneRoadmapView;
  hostSlug?: string;
  phone?: boolean;
  isPeter?: boolean;
}) {
  const auth = usePortalAuth();
  const peter = isPeter ?? isPeterEmail(auth.authUser?.email);
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
      isPeter={peter}
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
