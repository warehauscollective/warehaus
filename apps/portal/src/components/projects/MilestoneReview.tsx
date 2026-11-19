'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import type { MilestoneReviewHistoryItem, MilestoneReviewView, MilestoneRoadmapView } from '@convex/_lib/milestones';
import {
  NOTES_REQUIRED,
  RETRY_WAITS_ON_TOKENS,
  formatReviewStamp,
  isPeterEmail,
  type DesignCheck,
  type PreviewBuildStatus,
  type PreviewDeleteStatus,
} from '@convex/_lib/milestoneReview';
import { userFacingErrorMessage } from '@convex/_lib/userFacingError';
import { assertStaffPreviewLink, reviewRetryLiveOnClient, staffMayAttachPreviewLink } from '@convex/_lib/previewLink';
import { usePortalAuth } from '@/hooks/usePortalAuth';
import { PortalModal, type PortalModalHeader } from '@/components/ui/PortalModal';
import { OutlineButton, PrimaryButton } from '@/components/ui/primitives';
import { MilestoneDialog } from './milestoneChrome';
import { ConfirmFrame } from './milestoneDetailsEdit';

export const APPROVAL_SAVE_ERROR = 'Couldn’t save your approval. Nothing changed. Try again.';
export const APPROVED_AWAITING = 'Approved · awaiting merge and deploy.';
export const APPROVED_DEPLOYING = 'Merging and deploying…';
export const RECORDING_APPROVAL = 'Recording approval…';
export const APPROVING_LABEL = 'Approving…';
export const SAVING_APPROVAL_COPY = 'Saving your approval in the Portal. Engineering will merge to main and deploy production next.';
export const APPROVE_CONFIRM_COPY = 'Approve records the decision, then engineering merges to main and deploys.';
export const APPROVE_CONFIRM_TITLE = 'Approve this milestone?';
export const PREVIEW_REMOVED = 'Preview removed after approval · Vercel build deleted';
export const RETRY_FAILED = 'Retry didn’t start. Nothing changed.';
export const STAFF_RETRY_LINE = 'STAFF ONLY · Peter and clients don’t see Retry.';
/** Same muted opacity as Request changes while a preview build is held. */
export const RETRY_DISABLED_OPACITY = 0.4;
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
export type PreviewLinkMode = 'attach' | 'remove';

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
  previewBuild?: PreviewBuildStatus | null;
  previewBuildAttempt?: number | null;
  previewBuildAt?: number | null;
  previewDelete?: PreviewDeleteStatus | null;
  previewDeleteAttempt?: number | null;
  previewDeleteAt?: number | null;
  /** Set only after a real production deploy. Absent means it has not started. */
  deployFinishedAt?: number | null;
  /** Set only once merge and deploy have actually started. Absent until #113. */
  deployStartedAt?: number | null;
  /** Set when staff attach the link. A worker preview leaves this empty. */
  previewAttachedAt?: number | null;
  history: MilestoneReviewHistoryItem[];
  tasks: { id: string; name: string }[];
  resultTasks?: { name: string }[];
  milestoneName?: string;
  /** Open design fixes. The approve dialog counts them from this, not from copy. */
  designFixCount?: number;
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
  if (model.approval === 'approved') {
    if (model.previewDelete === 'removing') return 'delete-failed';
    if (model.previewDelete === 'failed') return 'couldnt-remove';
    return 'approved';
  }
  if (model.approval === 'changes_requested') return 'changes';
  if (model.previewBuild === 'building') return 'building';
  if (model.previewBuild === 'failed') return 'preview-failed';
  if (model.workStatus === 'ready' && model.previewUrl && model.previewAttachedAt != null) return 'ready';
  if (!model.previewUrl) return 'waiting';
  if (model.designCheck === 'fixes') return 'fixes';
  return 'ready';
}

/** Peter keeps the plain Approved card while a delete is still failing. Staff keep the status cards. */
export function reviewVisualForViewer(visual: ReviewVisual, isPeter: boolean): ReviewVisual {
  if (isPeter && (visual === 'delete-failed' || visual === 'couldnt-remove')) return 'approved';
  return visual;
}

/** The removal line needs a recorded delete, not approval by itself. */
export function previewRemovalRecorded(model: Pick<ReviewSurfaceModel, 'previewDelete' | 'previewDeleteAt'>): boolean {
  return model.previewDelete === 'removed' && typeof model.previewDeleteAt === 'number';
}

function designPillLabel(check: DesignCheck): string {
  if (check === 'pass') return 'DESIGN CHECK · PASS';
  if (check === 'fixes') return 'DESIGN CHECK · FIXES NEEDED';
  return 'DESIGN CHECK · PENDING';
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M2.2 6.2 4.7 8.7 9.8 3.4" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function Spinner({ size = 16 }: { size?: number }) {
  return (
    <>
      <style>{'@keyframes review-spin{to{transform:rotate(360deg)}}'}</style>
      <span
        aria-hidden="true"
        style={{
          width: size,
          height: size,
          flex: '0 0 auto',
          borderRadius: '50%',
          border: '1.5px solid var(--border-2)',
          borderTopColor: 'currentColor',
          animation: 'review-spin 0.8s linear infinite',
        }}
      />
    </>
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
  hideClose = false,
  actionsRow = false,
  hideChromeBelow = false,
  spinner = false,
  header,
  focusCancel = false,
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
  hideClose?: boolean;
  actionsRow?: boolean;
  hideChromeBelow?: boolean;
  spinner?: boolean;
  /** Approve uses the compact confirm header. Request changes keeps the dialog chrome. */
  header?: PortalModalHeader;
  focusCancel?: boolean;
  children: React.ReactNode;
}) {
  if (header) {
    return (
      <PortalModal
        testId="milestone-review-dialog"
        label={label}
        onClose={onClose}
        narrow={phone}
        sheet="bottom"
        header={header}
        showIcon={spinner}
        icon="spinner"
        showFooter={false}
        cover={cover}
        locked={spinner}
        focusCancel={focusCancel}
        confirmOnEnter={confirmOnEnter}
        onConfirm={onConfirm}
      >
        <div style={{ padding: phone ? '8px 16px' : '8px 24px' }}>{children}</div>
        {footer ? (
          <div style={{ display: 'flex', flexWrap: 'nowrap', alignItems: 'center', justifyContent: 'flex-end', gap: 8, padding: phone ? '16px 16px 24px' : '16px 24px 20px' }}>
            {footer}
          </div>
        ) : null}
      </PortalModal>
    );
  }
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
      hideClose={hideClose}
      actionsRow={actionsRow}
      hideChromeBelow={hideChromeBelow}
      spinner={spinner}
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
  saving = false,
  context,
}: {
  kind: ReviewDialogKind;
  tasks: { id: string; name: string }[];
  notes: string;
  onNotes: (value: string) => void;
  selected: string[];
  onToggle: (id: string) => void;
  fieldError: string | null;
  /** Phase-1 save. The title is “Recording approval…” and the button is “Approving…”. */
  saving?: boolean;
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
  return (
    <div className="flex flex-col gap-3">
      {approve ? (
        saving ? (
          <div style={{ fontSize: 14, lineHeight: '21px' }}>
            <p style={{ margin: 0 }}>{SAVING_APPROVAL_COPY}</p>
          </div>
        ) : (
          <div style={{ fontSize: 14, lineHeight: '21px' }}>
            <p style={{ margin: 0 }}>{APPROVE_CONFIRM_COPY}</p>
            <p style={{ margin: 0 }}>You can’t undo this from the Portal.</p>
          </div>
        )
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
      ? APPROVING_LABEL
      : 'Starting…'
    : submitLabel ?? (approve ? 'Approve & deploy' : `Start iteration ${iteration + 1}`);
  const row = phone && approve;
  return (
    <>
      {busy && approve ? null : (
        <OutlineButton onClick={onCancel} disabled={busy} className={row ? undefined : buttonClass}>Cancel</OutlineButton>
      )}
      {approve ? (
        <button
          type="button"
          onClick={onSubmit}
          disabled={busy}
          className={row ? 'inline-flex items-center justify-center gap-2' : `inline-flex items-center justify-center gap-2 ${buttonClass ?? ''}`}
          style={{
            background: '#f59e0b',
            color: '#0a0a0b',
            border: 0,
            borderRadius: 9,
            padding: '12px 16px',
            fontSize: 14,
            fontWeight: 500,
            opacity: busy ? 0.4 : 1,
            cursor: busy ? 'wait' : 'pointer',
          }}
        >
          {busy ? <Spinner size={14} /> : null}
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

function RetryControl({
  phone,
  busy = false,
  onRetry,
  error = null,
}: {
  phone: boolean;
  busy?: boolean;
  onRetry?: () => void;
  error?: string | null;
}) {
  const live = Boolean(onRetry);
  return (
    <div className={phone ? 'flex w-full flex-col items-start gap-1.5 pt-1.5' : 'flex flex-wrap items-center gap-2.5 pt-1.5'}>
      <button
        type="button"
        disabled={!live || busy}
        aria-busy={busy || undefined}
        data-testid="review-retry"
        title={live ? undefined : RETRY_WAITS_ON_TOKENS}
        onClick={onRetry}
        style={{
          boxSizing: 'border-box',
          border: '1px solid var(--border)',
          borderRadius: 9,
          height: 44,
          padding: '0 16px',
          background: 'transparent',
          color: 'var(--fg)',
          fontFamily: 'var(--font-body)',
          fontSize: 14,
          fontWeight: 500,
          width: phone ? '100%' : undefined,
          opacity: live || busy ? 1 : RETRY_DISABLED_OPACITY,
          cursor: !live ? 'not-allowed' : busy ? 'wait' : 'pointer',
        }}
      >
        {busy ? 'Retrying…' : 'Retry'}
      </button>
      <p className="ds-mono" style={{ margin: 0, fontSize: 12, lineHeight: '18px', color: 'var(--muted)' }}>{STAFF_RETRY_LINE}</p>
      {live || busy ? null : (
        <p data-testid="review-retry-unavailable" className="ds-mono" style={{ margin: 0, fontSize: 12, lineHeight: '18px', color: 'var(--muted)' }}>{RETRY_WAITS_ON_TOKENS}</p>
      )}
      {error ? (
        <p role="alert" data-testid="review-retry-error" className="flex items-start gap-2" style={{ margin: 0, flex: '1 0 100%', color: 'var(--danger-text)', fontSize: 14, lineHeight: '21px' }}>
          <AlertIcon />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}

function PreviewLifecycle({
  visual,
  model,
  phone,
  isPeter,
  retrying = false,
  retryError = null,
  onRetry,
}: {
  visual: ReviewVisual;
  model: ReviewSurfaceModel;
  phone: boolean;
  isPeter: boolean;
  retrying?: boolean;
  retryError?: string | null;
  onRetry?: () => void;
}) {
  const failedAt = visual === 'preview-failed' ? model.previewBuildAt : model.previewDeleteAt;
  const attempt = visual === 'preview-failed' ? model.previewBuildAttempt : model.previewDeleteAttempt;
  const stamp = failedAt ? formatReviewStamp(failedAt) : null;
  const border = visual === 'building' ? '1px dashed var(--border)' : visual === 'delete-failed' ? '1px solid var(--portal-warning)' : '1px solid var(--danger)';
  const title = visual === 'building'
    ? 'Building preview…'
    : visual === 'preview-failed'
      ? 'Preview failed to build'
      : visual === 'delete-failed'
        ? 'Removing preview… · retrying automatically'
        : "Couldn't remove preview";
  const detail = visual === 'building'
    ? `Protected Vercel preview for iteration ${model.iteration} · usually a few minutes. The link shows here and in Grok Bot chat.`
    : visual === 'preview-failed'
      ? 'Nothing changed. The milestone stays at Ready to Ship until a preview exists.'
      : visual === 'delete-failed'
        ? `Delete failed${stamp ? ` at ${stamp}` : ''}${attempt ? ` · attempt ${attempt}` : ''}`
        : `Vercel build still exists${stamp ? ` · last attempt ${stamp}` : ''}${attempt ? ` · ${attempt} attempts` : ''}`;
  const showRetry = !isPeter && (visual === 'preview-failed' || visual === 'couldnt-remove');
  return (
    <div role="status" className="flex items-start gap-3" style={{ border, borderRadius: 18, padding: '14px 16px' }}>
      {visual === 'building' ? <Spinner /> : <span style={{ color: visual === 'delete-failed' ? 'var(--portal-warning)' : 'var(--danger-text)', display: 'inline-flex' }}><AlertIcon /></span>}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p style={{ margin: 0, fontSize: 14, lineHeight: '21px', color: visual === 'delete-failed' ? 'var(--portal-warning)' : undefined }}>{title}</p>
        <p className="ds-mono" style={{ margin: 0, fontSize: 12, lineHeight: '18px', color: visual === 'delete-failed' ? 'var(--portal-warning)' : 'var(--muted)' }}>{detail}</p>
        {visual === 'delete-failed' ? (
          <p className="ds-mono" style={{ margin: 0, fontSize: 12, lineHeight: '18px', color: 'var(--muted)' }}>
            Staff see this. Peter and clients see the approved card until the delete succeeds.
          </p>
        ) : null}
        {showRetry ? <RetryControl phone={phone} busy={retrying} onRetry={onRetry} error={retryError} /> : null}
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
  isPeter = false,
  initialDialog = null,
  initialError = null,
  retrying = false,
  retryError = null,
  onRetry,
  saveFailed = false,
  cover = false,
  onApprove,
  onRequestChanges,
  staffAttach = false,
  initialLink = null,
  initialLinkError = null,
  initialLinkUrl = '',
  onAttach,
  onClear,
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
  /** Opens one dialog for fixture QA. The page still keeps a single modal. */
  initialDialog?: ReviewDialogKind | null;
  /** Notes-missing error for the request-changes fixture. */
  initialError?: string | null;
  /** Pending Retry. Live clicks set this while the mutation is in flight. */
  retrying?: boolean;
  /** Inline Retry failure. Live clicks set this when the mutation fails. */
  retryError?: string | null;
  /** Live retry. Fixtures omit this, so Retry stays disabled there. */
  onRetry?: () => void | Promise<void>;
  /** Confirm dialog after a failed save. The button reads Try again. */
  saveFailed?: boolean;
  /** Keep the dialog inside its frame. The live dialog stays fixed on the page. */
  cover?: boolean;
  onApprove?: (notes: string) => Promise<void>;
  onRequestChanges?: (notes: string, taskIds: string[]) => Promise<void>;
  /** Staff only. Clients never receive this control. */
  staffAttach?: boolean;
  initialLink?: PreviewLinkMode | null;
  initialLinkError?: string | null;
  initialLinkUrl?: string;
  onAttach?: (url: string) => Promise<void>;
  onClear?: () => Promise<void>;
}) {
  const [dialog, setDialog] = useState<ReviewDialogKind | null>(initialDialog);
  const [linkMode, setLinkMode] = useState<PreviewLinkMode | null>(initialLink);
  const [linkUrl, setLinkUrl] = useState(initialLinkUrl);
  const [linkError, setLinkError] = useState<string | null>(initialLinkError);
  const [linkBusy, setLinkBusy] = useState(false);
  const showAttach = staffMayAttachPreviewLink({ staff: staffAttach });
  const [notes, setNotes] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState<'approve' | 'changes' | null>(null);
  const [failedKind, setFailedKind] = useState<ReviewDialogKind>('approve');
  useEffect(() => {
    onActive?.(dialog != null || linkMode != null);
  }, [dialog, linkMode, onActive]);
  useEffect(() => {
    if (closeToken > 0) {
      setDialog(null);
      setLinkMode(null);
    }
  }, [closeToken]);
  const [fieldError, setFieldError] = useState<string | null>(initialError);
  const [cardError, setCardError] = useState(false);
  const [retryBusy, setRetryBusy] = useState(false);
  const [retryFailure, setRetryFailure] = useState<string | null>(null);
  const retryLock = useRef(false);
  const retryPending = Boolean(retrying || retryBusy);
  const retryMessage = retryFailure ?? retryError;
  const runRetry = onRetry
    ? () => {
        if (retryLock.current || retryPending) return;
        retryLock.current = true;
        setRetryFailure(null);
        setRetryBusy(true);
        void Promise.resolve(onRetry()).catch((err: unknown) => {
          setRetryFailure(userFacingErrorMessage(err, RETRY_FAILED));
        }).finally(() => {
          retryLock.current = false;
          setRetryBusy(false);
        });
      }
    : undefined;
  const derived = cardError && !forced ? 'error' : busy && !forced ? 'saving' : deriveReviewVisual(model, forced);
  const visual = reviewVisualForViewer(derived, isPeter);
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
  const changesHeld = visual === 'building' || visual === 'preview-failed';
  const requestChanges = (
    <OutlineButton
      nowrap={!phone}
      className={buttonClass}
      testId="request-changes"
      disabled={changesHeld || (visual === 'error' ? false : blocked)}
      disabledOpacity={changesHeld ? 0.4 : visual === 'error' ? undefined : dim}
      onClick={() => {
      setCardError(false);
      setFieldError(null);
      setLinkMode(null);
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
        setLinkMode(null);
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
          {visual === 'changes' ? null : <DesignCheckPill check={visual === 'waiting' || visual === 'building' || visual === 'preview-failed' ? 'pending' : model.designCheck} />}
        </div>
        {layout === 'card' && model.prNumber ? (
          <h2 className="type-heading" style={{ fontSize: 20, lineHeight: '30px', margin: 0 }}>
            {`PR #${model.prNumber}${model.prTitle ? ` · ${model.prTitle}` : ''}`}
          </h2>
        ) : null}
        {layout === 'card' && (model.branch || model.commit) && visual !== 'changes' && visual !== 'approved' && visual !== 'delete-failed' && visual !== 'couldnt-remove' ? (
          <p className="ds-mono" style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>
            {visual === 'building'
              ? `${model.branch ?? 'branch'} · building preview`
              : visual === 'preview-failed'
                ? `${model.branch ?? 'branch'} · preview build failed`
                : [model.branch, model.commit, model.builtAt ? formatReviewStamp(model.builtAt) : null].filter(Boolean).join(' · ')}
          </p>
        ) : null}
        {visual === 'approved' || visual === 'delete-failed' || visual === 'couldnt-remove' ? (
          <>
            <p style={{ margin: 0, fontSize: 14, lineHeight: '21px' }}>{`Approved by ${who}${stamp ? ` · ${stamp}` : ''}`}</p>
            {model.deployFinishedAt ? (
              <p className="ds-mono" style={{ margin: 0, fontSize: 12, lineHeight: '18px', color: 'var(--muted)' }}>
                Read-only · deploy finished · Shipped is set automatically on merge
              </p>
            ) : model.deployStartedAt ? (
              <p style={{ margin: 0, fontSize: 14, lineHeight: '21px' }}>{APPROVED_DEPLOYING}</p>
            ) : (
              <p style={{ margin: 0, fontSize: 14, lineHeight: '21px' }}>{APPROVED_AWAITING}</p>
            )}
            {visual === 'approved' && previewRemovalRecorded(model) ? (
              <p data-testid="preview-removed" className="ds-mono" style={{ margin: 0, fontSize: 12, lineHeight: '18px', color: 'var(--muted)' }}>{PREVIEW_REMOVED}</p>
            ) : null}
            {visual === 'delete-failed' || visual === 'couldnt-remove' ? (
              <PreviewLifecycle visual={visual} model={model} phone={phone} isPeter={isPeter} retrying={retryPending} retryError={retryMessage} onRetry={runRetry} />
            ) : null}
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
            {model.previewUrl && visual !== 'building' && visual !== 'preview-failed' ? <PreviewBox url={model.previewUrl} commit={model.commit} iteration={model.iteration} /> : visual === 'building' || visual === 'preview-failed' ? (
              <PreviewLifecycle visual={visual} model={model} phone={phone} isPeter={isPeter} retrying={retryPending} retryError={retryMessage} onRetry={runRetry} />
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
            {showAttach ? (
              <div data-testid="preview-link-actions" className={phone ? 'flex w-full flex-col gap-2' : 'flex flex-wrap gap-2'}>
                <OutlineButton
                  nowrap={!phone}
                  className={phone ? 'w-full' : undefined}
                  testId="attach-preview-link"
                  onClick={() => {
                    setDialog(null);
                    setLinkError(null);
                    setLinkUrl(model.previewUrl ?? '');
                    setLinkMode('attach');
                  }}
                >
                  Attach preview link
                </OutlineButton>
                {model.previewUrl ? (
                  <OutlineButton
                    nowrap={!phone}
                    className={phone ? 'w-full' : undefined}
                    testId="remove-preview-link"
                    onClick={() => {
                      setDialog(null);
                      setLinkError(null);
                      setLinkMode('remove');
                    }}
                  >
                    Remove link
                  </OutlineButton>
                ) : null}
              </div>
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

  const submitLink = async () => {
    if (linkBusy || !linkMode) return;
    if (linkMode === 'attach') {
      const checked = assertStaffPreviewLink(linkUrl);
      if (!checked.ok) {
        setLinkError(checked.reason);
        return;
      }
      if (!onAttach) {
        setLinkMode(null);
        return;
      }
      setLinkBusy(true);
      setLinkError(null);
      try {
        await onAttach(checked.href);
        setLinkMode(null);
      } catch (err) {
        setLinkError(userFacingErrorMessage(err, 'Couldn’t save the preview link. Nothing changed.'));
      } finally {
        setLinkBusy(false);
      }
      return;
    }
    if (!onClear) {
      setLinkMode(null);
      return;
    }
    setLinkBusy(true);
    setLinkError(null);
    try {
      await onClear();
      setLinkMode(null);
    } catch (err) {
      setLinkError(userFacingErrorMessage(err, 'Couldn’t remove the preview link. Nothing changed.'));
    } finally {
      setLinkBusy(false);
    }
  };

  const phoneConfirm = phone && dialog === 'approve';
  const savingApproval = busy === 'approve';
  const dialogNode = dialog ? (
    <ReviewScrim
      phone={phone}
      label={dialog === 'approve' ? (savingApproval ? RECORDING_APPROVAL : APPROVE_CONFIRM_TITLE) : 'Request changes'}
      spinner={savingApproval}
      confirmOnEnter={dialog === 'approve'}
      hideClose={phoneConfirm || savingApproval}
      actionsRow={phoneConfirm}
      hideChromeBelow={dialog === 'approve' || dialog === 'changes'}
      header={dialog === 'approve' ? 'compact' : 'default'}
      focusCancel={dialog === 'approve'}
      cover={cover}
      onClose={() => setDialog(null)}
      onConfirm={() => void submit()}
      footer={
        <ReviewDialogActions
          approve={dialog === 'approve'}
          iteration={model.iteration}
          busy={busy != null}
          phone={phone}
          submitLabel={saveFailed && dialog === 'approve' ? 'Try again' : undefined}
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
        fieldError={saveFailed && dialog === 'approve' ? APPROVAL_SAVE_ERROR : fieldError}
        saving={savingApproval}
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

  const linkDialog = linkMode ? (
    <PortalModal
      testId="preview-link-dialog"
      label={linkMode === 'attach' ? 'Attach preview link' : 'Remove preview link?'}
      onClose={() => {
        if (!linkBusy) setLinkMode(null);
      }}
      narrow={phone}
      sheet="bottom"
      header="default"
      showFooter={false}
      cover={cover}
      locked={linkBusy}
      focusCancel={linkMode === 'remove'}
      onConfirm={() => void submitLink()}
      confirmOnEnter={linkMode === 'remove'}
    >
      <ConfirmFrame
        busy={linkBusy}
        error={linkError}
        confirmLabel={linkMode === 'attach' ? 'Attach link' : 'Remove link'}
        onCancel={() => setLinkMode(null)}
        onConfirm={() => void submitLink()}
      >
        {linkMode === 'attach' ? (
          <label className="flex flex-col gap-2" style={{ fontSize: 14, lineHeight: '21px' }}>
            <span>Preview link</span>
            <input
              aria-label="Preview link"
              data-testid="preview-link-input"
              value={linkUrl}
              onChange={(event) => {
                setLinkUrl(event.target.value);
                if (linkError) setLinkError(null);
              }}
              placeholder="https://warehaus-portal-…-warehaus-collective.vercel.app"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              style={{
                width: '100%',
                border: linkError ? '1px solid var(--danger)' : '1px solid var(--border)',
                borderRadius: 12,
                background: 'var(--surface-2)',
                color: 'var(--fg)',
                padding: 12,
                font: 'inherit',
              }}
            />
            <span className="ds-mono" style={{ fontSize: 12, lineHeight: '18px', color: 'var(--muted)' }}>
              https only. Team Vercel previews. Localhost and production stay off this milestone.
            </span>
          </label>
        ) : (
          <p style={{ margin: 0, fontSize: 14, lineHeight: '21px' }}>
            Peter won’t see Approve & deploy until a preview link is attached again.
          </p>
        )}
      </ConfirmFrame>
    </PortalModal>
  ) : null;

  if (swap && (dialogNode || linkDialog)) return dialogNode ?? linkDialog;

  const row = (
    <div
      data-testid="task-review-row"
      data-review-state={visual}
      className={phone ? 'flex w-full min-w-0 flex-col gap-3' : 'flex items-center justify-between gap-4'}
      style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, padding: '12px 16px', boxSizing: 'border-box', maxWidth: '100%' }}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="ds-mono" style={{ ...eyebrowStyle, whiteSpace: phone ? 'normal' : 'nowrap' }}>
          {phone ? eyebrow : `${eyebrow} · ${designPillLabel(visual === 'waiting' || visual === 'building' || visual === 'preview-failed' ? 'pending' : model.designCheck)}`}
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
        </div>
      )}
      {dialog ? dialogNode : linkDialog}
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
    previewBuild: milestone.review.previewBuild,
    previewBuildAttempt: milestone.review.previewBuildAttempt,
    previewBuildAt: milestone.review.previewBuildAt,
    previewDelete: milestone.review.previewDelete,
    previewDeleteAttempt: milestone.review.previewDeleteAttempt,
    previewDeleteAt: milestone.review.previewDeleteAt,
    deployFinishedAt: milestone.review.deployFinishedAt,
    previewAttachedAt: milestone.review.previewAttachedAt,
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
  const retryPreview = useMutation(api.milestones.retryReviewPreview);
  const attachPreviewLink = useMutation(api.milestones.attachPreviewLink);
  const clearPreviewLink = useMutation(api.milestones.clearPreviewLink);
  const retryLive = reviewRetryLiveOnClient(process.env.NEXT_PUBLIC_CONVEX_URL);
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
      staffAttach
      onAttach={async (url) => {
        const result = await attachPreviewLink({ milestoneId: model.milestoneId as Id<'milestones'>, url });
        if (!result.ok) throw new Error(result.reason);
      }}
      onClear={async () => {
        await clearPreviewLink({ milestoneId: model.milestoneId as Id<'milestones'> });
      }}
      onRetry={
        peter || !retryLive
          ? undefined
          : async () => {
              const result = await retryPreview({ milestoneId: model.milestoneId as Id<'milestones'> });
              if (!result.ok) throw new Error(result.reason);
            }
      }
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
