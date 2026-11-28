'use client';

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { peterMayApproveDeploy } from '@convex/_lib/previewLink';
import { DESIGN_APPROVAL_STATUSES, peterMayApproveDesign } from '@convex/_lib/designApproval';
import { localPreviewHint, tileLinkChangeDecision, type TileLinkField } from '@convex/_lib/tileLinks';
import { userFacingErrorMessage } from '@convex/_lib/userFacingError';
import { nextStatus, statusOptionLock, type MilestoneStatus } from '@convex/_lib/milestoneStatus';
import type { MilestoneRoadmapView } from '@convex/_lib/milestones';
import { PortalModal } from '@/components/ui/PortalModal';
import { OutlineButton } from '@/components/ui/primitives';
import { useMaxWidth } from '@/lib/design/useMaxWidth';
import { StatusMenu } from './milestoneDetailsEdit';
import { useBuildRunState } from './BuildingIndicator';
import { DesignChangesDialog, type DesignChangesInput } from './DesignChangesDialog';
import { TileStatusControl, useMilestoneStatusMoves } from './MilestoneStatusControl';
import { APPROVE_CONFIRM_COPY, APPROVE_CONFIRM_TITLE, RECORDING_APPROVAL, SAVING_APPROVAL_COPY } from './MilestoneReview';
import {
  MilestoneListButton,
  StatusChip,
  fieldStyle,
} from './milestoneChrome';
import { AWAITING_MERGE_LINE, milestoneTileHeadline, milestoneTileStatus, ProgressCopy, tileMetaLine, StaffOnlyChip, taskTotal, boardTaskCounts } from './milestoneTile';

const TILE_MENU_WIDTH = 320;

const TILE_MENU_GAP = 8;

/** Place the desktop status menu inside the visible scroll area. Flip above the chip when the menu fits there and not below. */
export function tileStageMenuBox(input: {
  chip: { top: number; right: number; bottom: number };
  menu: { width: number; height: number };
  bounds: { top: number; right: number; bottom: number; left: number };
}): { top: number; left: number; placement: 'up' | 'down' } {
  const { chip, menu, bounds } = input;
  const spaceBelow = bounds.bottom - chip.bottom - TILE_MENU_GAP;
  const spaceAbove = chip.top - bounds.top - TILE_MENU_GAP;
  const placement = spaceBelow < menu.height && spaceAbove >= menu.height ? 'up' : 'down';
  let top = placement === 'up' ? chip.top - TILE_MENU_GAP - menu.height : chip.bottom + TILE_MENU_GAP;
  const minTop = bounds.top + TILE_MENU_GAP;
  const maxTop = Math.max(minTop, bounds.bottom - menu.height - TILE_MENU_GAP);
  top = Math.min(Math.max(top, minTop), maxTop);
  let left = chip.right - menu.width;
  const minLeft = bounds.left + TILE_MENU_GAP;
  const maxLeft = Math.max(minLeft, bounds.right - menu.width - TILE_MENU_GAP);
  left = Math.min(Math.max(left, minLeft), maxLeft);
  return { top, left, placement };
}

function visibleMenuBounds(anchor: HTMLElement): { top: number; right: number; bottom: number; left: number } {
  const scroll = anchor.closest('[data-page-scroll]');
  const scrollRect = scroll?.getBoundingClientRect();
  const top = scrollRect ? Math.max(0, scrollRect.top) : 0;
  const left = scrollRect ? Math.max(0, scrollRect.left) : 0;
  const right = scrollRect ? Math.min(window.innerWidth, scrollRect.right) : window.innerWidth;
  let bottom = scrollRect ? Math.min(window.innerHeight, scrollRect.bottom) : window.innerHeight;
  const dock = document.querySelector('[data-testid="portal-dock"]');
  if (dock instanceof HTMLElement && getComputedStyle(dock).visibility !== 'hidden') {
    const dockTop = dock.getBoundingClientRect().top;
    if (dockTop < bottom) bottom = dockTop;
  }
  return { top, right, bottom, left };
}

function TileStagePopover({
  anchorRef,
  children,
}: {
  anchorRef: RefObject<HTMLDivElement | null>;
  children: ReactNode;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    setHost(document.body);
  }, []);
  useLayoutEffect(() => {
    const menu = menuRef.current;
    const anchor = anchorRef.current;
    if (!menu || !anchor || !host) return;
    const place = () => {
      const chip = anchor.getBoundingClientRect();
      const box = tileStageMenuBox({
        chip: { top: chip.top, right: chip.right, bottom: chip.bottom },
        menu: { width: TILE_MENU_WIDTH, height: menu.offsetHeight },
        bounds: visibleMenuBounds(anchor),
      });
      menu.style.position = 'fixed';
      menu.style.top = `${box.top}px`;
      menu.style.left = `${box.left}px`;
      menu.style.right = 'auto';
      menu.style.bottom = 'auto';
      menu.style.width = `${TILE_MENU_WIDTH}px`;
      menu.style.zIndex = '60';
      menu.dataset.placement = box.placement;
    };
    place();
    const current = menu.querySelector<HTMLButtonElement>('[role="option"][aria-selected="true"]:not(:disabled)');
    current?.focus({ preventScroll: true });
    const scroll = anchor.closest('[data-page-scroll]');
    scroll?.addEventListener('scroll', place, { passive: true });
    window.addEventListener('resize', place);
    const observer = new ResizeObserver(place);
    observer.observe(menu);
    return () => {
      scroll?.removeEventListener('scroll', place);
      window.removeEventListener('resize', place);
      observer.disconnect();
    };
  }, [anchorRef, host]);
  const node = (
    <div
      ref={menuRef}
      className="ds-scope"
      data-testid="tile-stage-popover"
      style={{
        position: 'absolute',
        top: 'calc(100% + 8px)',
        right: 0,
        width: TILE_MENU_WIDTH,
        zIndex: 40,
        background: 'transparent',
      }}
    >
      {children}
    </div>
  );
  return host ? createPortal(node, host) : node;
}

function TileLinkIcon({ kind }: { kind: 'preview' | 'figma' }) {
  const preview = kind === 'preview';
  return (
    <svg width={preview ? 12 : 16} height={preview ? 12 : 16} viewBox={preview ? '0 0 12 12' : '0 0 16 16'} fill="none" aria-hidden="true" style={preview ? undefined : { color: 'var(--muted)' }}>
      {preview ? (
        <>
          <rect x="1" y="2" width="10" height="7" rx="1" stroke="currentColor" strokeWidth="1.2" />
          <path d="M5 4.5L7.2 5.5L5 6.5V4.5Z" fill="currentColor" />
          <path d="M4 10.5H8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </>
      ) : (
        <path d="M2 5.5V3H6M10 3H14V5.5M14 9.5V12H10M6 12H2V9.5" stroke="currentColor" strokeWidth="1.33" />
      )}
    </svg>
  );
}

function initialTileMenu(preview?: string | null): boolean {
  return preview === 'menu';
}

const TILE_LINK_SAVE_ERROR = 'Couldn’t save the link. Nothing changed.';

export const DESIGN_CONFIRM_TITLE = 'Approve the designs for this milestone?';
export const DESIGN_CONFIRM_COPY = 'Records your approval. Build tasks unlock and the runner starts building them.';
export const DESIGN_WAITING_NOTE = 'Waiting on design approval';

/** Under the chip once Peter approved: "Designs approved · Peter · Nov 25". */
export function designsApprovedLine(at: number): string {
  const day = new Date(at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' });
  return `Designs approved · Peter · ${day}`;
}

export function MilestoneListCard({
  milestone,
  staff,
  isPeter = false,
  fixtures = false,
  onOpen,
  onSetStatus,
  onAdvance,
  onApprove,
  onApproveDesign,
  onRequestDesignChanges,
  onSetLink,
  openConfirm = false,
  phone = false,
  cover = false,
  stagePreview = null,
  linkPreview = null,
  narrow = false,
  closeout = null,
}: {
  /** Staff "…" control: Mark complete, Archive, or Restore. Clients never get one. */
  closeout?: ReactNode;
  milestone: MilestoneRoadmapView;
  staff: boolean;
  isPeter?: boolean;
  fixtures?: boolean;
  onOpen: () => void;
  /** Staff pick a status from the menu, or undo a play. `expected` is the status last seen. */
  onSetStatus?: (status: MilestoneStatus, expected: MilestoneStatus) => void | Promise<unknown>;
  /** The play button. One step forward from `expected` to `next`. */
  onAdvance?: (expected: MilestoneStatus, next: MilestoneStatus) => void | Promise<unknown>;
  onApprove?: (iteration: number) => Promise<unknown>;
  /** Peter's Approve designs, before build. */
  onApproveDesign?: () => Promise<unknown>;
  /** Peter's Request design changes, beside Approve designs. */
  onRequestDesignChanges?: (input: DesignChangesInput) => Promise<unknown>;
  /** Staff set or clear a tile link. Empty url clears it. */
  onSetLink?: (field: TileLinkField, url: string | null) => void | Promise<unknown>;
  /** Fixture QA opens the one confirm without a click. */
  openConfirm?: boolean;
  /** Fixture phone sheet. The live tile follows the viewport. */
  phone?: boolean;
  /** Board column. Keeps the stacked tile even when the viewport is wide. */
  narrow?: boolean;
  /** Fixture dialog stays inside its frame instead of covering the page. */
  cover?: boolean;
  /** Fixture QA. `menu` opens the status menu. */
  stagePreview?: string | null;
  /** Fixture QA. `focus` opens the link modal. `error` opens it on the save failure. */
  linkPreview?: string | null;
}) {
  const [confirm, setConfirm] = useState(openConfirm);
  const [linkField, setLinkField] = useState<TileLinkField | null>(null);
  const [linkDraft, setLinkDraft] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);
  const viewportSheet = useMaxWidth(767);
  // The tile chip switches at lg (1024). Below that, the phone pill is the one on screen.
  const tilePhone = useMaxWidth(1023);
  const phoneSheet = phone || tilePhone;
  const [stageMenuOpen, setStageMenuOpen] = useState(() => (staff ? initialTileMenu(stagePreview) : false));
  const menuAnchorRef = useRef<HTMLDivElement>(null);
  const chipRef = useRef<HTMLButtonElement>(null);
  const desktopMenuWasOpen = useRef(false);
  const [deploying, setDeploying] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);
  const [designConfirm, setDesignConfirm] = useState(false);
  const [designChangesOpen, setDesignChangesOpen] = useState(false);
  const [approvingDesign, setApprovingDesign] = useState(false);
  const [designError, setDesignError] = useState<string | null>(null);
  useEffect(() => {
    if (!staff || stagePreview !== 'menu') return;
    setConfirm(false);
    setStageMenuOpen(true);
  }, [staff, stagePreview]);
  useEffect(() => {
    if (!fixtures || (linkPreview !== 'focus' && linkPreview !== 'error')) return;
    setLinkField('localPreview');
    setLinkDraft(linkPreview === 'error' ? 'http://localhost:3200' : '');
    setLinkError(linkPreview === 'error' ? TILE_LINK_SAVE_ERROR : null);
  }, [fixtures, linkPreview]);
  useEffect(() => {
    if (phoneSheet) {
      desktopMenuWasOpen.current = false;
      return;
    }
    if (stageMenuOpen) {
      desktopMenuWasOpen.current = true;
      return;
    }
    if (!desktopMenuWasOpen.current) return;
    desktopMenuWasOpen.current = false;
    const chip = chipRef.current;
    chip?.focus({ preventScroll: true });
    const frame = window.requestAnimationFrame(() => chip?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [stageMenuOpen, phoneSheet]);
  useEffect(() => {
    if (!stageMenuOpen || phoneSheet) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (target instanceof Element && target.closest('[data-testid="tile-stage-popover"]')) return;
      if (target instanceof Element && target.closest('[data-milestone-status-trigger]')) return;
      setStageMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setStageMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [stageMenuOpen, phoneSheet]);
  const canDeploy = peterMayApproveDeploy({
    staff,
    isPeter,
    status: milestone.status,
    approval: milestone.approval,
    // Either preview unlocks Approve: the Vercel link or the local build.
    previewUrl: milestone.review?.previewUrl || milestone.review?.localPreviewUrl || milestone.localPreviewUrl,
  });
  const canApproveDesign = peterMayApproveDesign({
    staff,
    isPeter,
    status: milestone.status,
    designApprovedAt: milestone.designApprovedAt,
    gate: milestone.designGate,
  });
  // Staff see the approval under the chip until build is over.
  const designApproved =
    staff && Boolean(milestone.designApprovedAt) && (DESIGN_APPROVAL_STATUSES as readonly string[]).includes(milestone.status);
  const confirmDesign = () => {
    if (!onApproveDesign) {
      setDesignConfirm(false);
      return;
    }
    setApprovingDesign(true);
    setDesignError(null);
    void onApproveDesign().then(() => setDesignConfirm(false)).catch((err) => {
      setDesignError(userFacingErrorMessage(err, 'Couldn’t save your approval. Nothing changed. Try again.'));
    }).finally(() => setApprovingDesign(false));
  };
  const confirmDeploy = () => {
    if (fixtures || !milestone.review || !onApprove) {
      setConfirm(false);
      return;
    }
    setDeploying(true);
    setDeployError(null);
    void onApprove(milestone.review.iteration).then(() => setConfirm(false)).catch((err) => {
      setDeployError(userFacingErrorMessage(err, 'Couldn’t save your approval. Nothing changed. Try again.'));
    }).finally(() => setDeploying(false));
  };
  const total = taskTotal(milestone);
  // Worked out on the server from the whole task set. Clients get no canClose.
  const canClose = milestone.canClose ?? false;
  const openCount = milestone.openCount;
  const moves = useMilestoneStatusMoves({
    status: milestone.status,
    canClose,
    onAdvance: (expected) => onAdvance?.(expected, nextStatus(expected) ?? expected),
    onSet: (next, expected) => onSetStatus?.(next, expected),
  });
  const stage = milestoneTileStatus({ status: moves.shown });
  const buildState = useBuildRunState(moves.shown, milestone.buildRun, staff);
  const subtasks = boardTaskCounts(milestone).nested;
  const awaitingMerge = staff && milestone.approval === 'approved' && milestone.status !== 'Shipped';
  const dateLine = milestoneTileHeadline({
    staff,
    approval: milestone.approval,
    status: milestone.status,
    decidedAt: milestone.decidedAt,
    dueDate: milestone.dueDate,
  });
  const meta = tileMetaLine({
    resources: milestone.resources.length,
    createdVia: staff ? milestone.createdVia : null,
  });
  const showStaffOnly = staff && milestone.publishToWarehaus === false;
  const localUrl = staff ? milestone.localPreviewUrl ?? null : null;
  const figmaUrl = staff ? milestone.figmaUrl ?? null : null;
  const previewHint = staff ? localPreviewHint(localUrl) : null;
  const openLinkEditor = (field: TileLinkField) => {
    setLinkError(null);
    setLinkDraft(field === 'localPreview' ? (localUrl ?? '') : (figmaUrl ?? ''));
    setLinkField(field);
  };
  const writeLink = async (field: TileLinkField, url: string | null) => {
    if (linkBusy) return;
    setLinkBusy(true);
    setLinkError(null);
    try {
      await onSetLink?.(field, url);
      setLinkField(null);
    } catch (err) {
      setLinkError(userFacingErrorMessage(err, TILE_LINK_SAVE_ERROR));
    } finally {
      setLinkBusy(false);
    }
  };
  const saveLink = () => {
    if (!linkField || linkBusy) return;
    const decision = tileLinkChangeDecision({
      field: linkField,
      from: linkField === 'localPreview' ? localUrl : figmaUrl,
      to: linkDraft,
    });
    if (!decision.ok) {
      setLinkError(decision.reason);
      return;
    }
    if (!decision.wrote) {
      setLinkField(null);
      return;
    }
    void writeLink(linkField, decision.url);
  };
  const closeStageMenu = () => setStageMenuOpen(false);
  const toggleMenu = () => {
    setConfirm(false);
    moves.clearError();
    setStageMenuOpen((current) => !current);
  };
  const pickStatus = (next: MilestoneStatus) => {
    if (statusOptionLock(next, canClose)) return;
    setStageMenuOpen(false);
    void moves.pick(next).catch(() => undefined);
  };
  const showDeploy = confirm && !stageMenuOpen;
  const stageTrigger = staff ? (
    <TileStatusControl
      status={stage.label}
      saving={moves.saving}
      open={stageMenuOpen}
      onToggle={toggleMenu}
      playTo={moves.playTo}
      onPlay={() => {
        setStageMenuOpen(false);
        moves.play();
      }}
      buttonRef={chipRef}
      bare={canDeploy || canApproveDesign || designApproved}
      buildState={buildState}
      phase={milestone.designGate?.phase}
      deploy={milestone.deploy}
    />
  ) : (
    <StatusChip label={stage.label} glyph={stage.glyph} live={buildState === 'live'} />
  );
  const approveButton = canDeploy ? (
    <button
      type="button"
      data-testid="tile-approve-deploy"
      onClick={() => { setStageMenuOpen(false); setConfirm(true); }}
      style={{ width: '100%', height: 42, border: 0, borderRadius: 0, background: '#f59e0b', color: '#0a0a0b', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}
    >
      Approve
    </button>
  ) : null;
  const approveDesignButton = canApproveDesign ? (
    <button
      type="button"
      data-testid="tile-approve-designs"
      onClick={() => { setStageMenuOpen(false); setConfirm(false); setDesignConfirm(true); }}
      style={{ width: '100%', height: 42, border: 0, borderRadius: 0, background: '#f59e0b', color: '#0a0a0b', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}
    >
      Approve designs
    </button>
  ) : null;
  // Request design changes sits under Approve designs on a visual milestone.
  const canRequestDesignChanges = canApproveDesign && milestone.designGate?.visual === true && Boolean(onRequestDesignChanges);
  const designWaitingNote =
    canApproveDesign && milestone.designGate?.phase === 'design-approval' ? (
      <p
        data-testid="tile-design-waiting"
        className="ds-mono"
        style={{ margin: 0, padding: '8px 12px', fontSize: 12, lineHeight: '18px', color: 'var(--muted)', borderTop: '1px solid var(--border-2)' }}
      >
        {DESIGN_WAITING_NOTE}
      </p>
    ) : null;
  const requestDesignChangesButton = canRequestDesignChanges ? (
    <button
      type="button"
      data-testid="tile-request-design-changes"
      onClick={() => { setStageMenuOpen(false); setConfirm(false); setDesignConfirm(false); setDesignChangesOpen(true); }}
      style={{ width: '100%', height: 36, border: 0, borderTop: '1px solid var(--border-2)', borderRadius: 0, background: 'transparent', color: 'var(--fg)', fontSize: 13, cursor: 'pointer' }}
    >
      Request design changes
    </button>
  ) : null;
  const designTasks = milestone.rows
    .filter((row) => row.kind === 'design')
    .map((row) => ({ id: row.id, name: row.name }));
  const designApprovedStrip = designApproved && milestone.designApprovedAt ? (
    <p
      data-testid="tile-designs-approved"
      className="ds-mono"
      style={{ margin: 0, padding: 12, fontSize: 12, lineHeight: '18px', color: 'var(--fg)', background: 'var(--surface-elevated)' }}
    >
      {designsApprovedLine(milestone.designApprovedAt)}
    </p>
  ) : null;
  // The sheet closes if the gate stops offering the approval while it is open.
  const showDesignConfirm = designConfirm && canApproveDesign && !stageMenuOpen;
  const linkButtonStyle = (dimmed: boolean): CSSProperties => ({
    boxSizing: 'border-box',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    height: 32,
    border: '1px solid var(--border-2)',
    borderRadius: 9,
    padding: '0 10px',
    background: 'transparent',
    color: 'var(--fg)',
    fontFamily: 'var(--font-mono), ui-monospace, monospace',
    fontSize: 11,
    lineHeight: '16px',
    letterSpacing: '0.04em',
    textDecoration: 'none',
    cursor: 'pointer',
    opacity: dimmed ? 0.4 : 1,
  });
  return (
    <article
      data-testid={`milestone-${milestone.id}`}
      data-narrow={narrow ? 'true' : undefined}
      className={narrow ? 'flex flex-col gap-4' : 'flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_max-content] lg:items-start lg:justify-start lg:gap-x-6 lg:gap-y-0'}
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--panel-radius, 12px)',
        padding: 24,
      }}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex min-w-0 flex-nowrap items-center justify-between gap-3">
          <h2 data-testid="milestone-name" className={narrow ? 'text-[21px] leading-[32px]' : 'text-[21px] leading-[32px] lg:text-[20px] lg:leading-[30px]'} style={{ fontFamily: 'var(--font-geist), var(--font-body)', fontWeight: 500 }}>
            {milestone.name}
          </h2>
          {dateLine ? (
            <p data-testid="milestone-due" className="shrink-0" style={{ fontSize: 12, lineHeight: '18px', color: 'var(--muted)' }}>
              {dateLine}
            </p>
          ) : null}
        </div>
        <p data-testid="milestone-objective" style={{ fontSize: 14, lineHeight: '21px', color: 'var(--muted)' }}>
          {milestone.objective}
        </p>
        {meta ? (
          <div className={showStaffOnly ? 'flex min-w-0 max-w-full items-center' : undefined} style={showStaffOnly ? { gap: 16 } : undefined}>
            <p
              data-testid="milestone-meta"
              className="min-w-0 max-w-full truncate"
              style={{ margin: 0, fontSize: 12, lineHeight: '18px', color: 'var(--muted)', overflowWrap: 'anywhere' }}
            >
              {meta}
            </p>
            {showStaffOnly ? <StaffOnlyChip /> : null}
          </div>
        ) : null}
        <div className={narrow ? 'flex w-full min-w-0 flex-col items-start gap-4' : 'flex w-full min-w-0 flex-col items-start gap-4 md:flex-row md:flex-wrap md:items-center'}>
          <MilestoneListButton tone="outline" onClick={onOpen}>
            {stage.label === 'Ready to Ship' && !narrow ? (
              <>
                <span className="lg:hidden">Open milestone</span>
                <span className="hidden lg:inline">Milestone Details</span>
              </>
            ) : (
              'Open milestone'
            )}
          </MilestoneListButton>
          {staff ? (
            localUrl ? (
              <a data-testid="milestone-local-preview" className={narrow ? undefined : 'lg:order-1'} href={localUrl} style={linkButtonStyle(false)}>
                <TileLinkIcon kind="preview" />
                {narrow ? 'Preview' : (
                  <>
                    <span className="lg:hidden">Preview</span>
                    <span className="hidden lg:inline">Local preview</span>
                  </>
                )}
              </a>
            ) : (
              <button type="button" data-testid="milestone-local-preview" className={narrow ? undefined : 'lg:order-1'} onClick={() => openLinkEditor('localPreview')} style={linkButtonStyle(true)}>
                <TileLinkIcon kind="preview" />
                {narrow ? 'Preview' : (
                  <>
                    <span className="lg:hidden">Preview</span>
                    <span className="hidden lg:inline">Local preview</span>
                  </>
                )}
              </button>
            )
          ) : null}
          {staff && figmaUrl ? (
            <a data-testid="milestone-figma" className="lg:order-3" href={figmaUrl} target="_blank" rel="noreferrer" style={linkButtonStyle(false)}>
              <TileLinkIcon kind="figma" />
              Figma
            </a>
          ) : null}
          {previewHint ? (
            <span data-testid="milestone-preview-hint" className="lg:order-2" style={{ fontSize: 12, lineHeight: '18px', color: 'var(--muted)' }}>
              {previewHint}
            </span>
          ) : null}
        </div>
      </div>
      <div className={narrow ? 'flex w-full flex-col items-start gap-3' : 'flex w-full flex-col items-start gap-3 lg:ml-auto lg:w-max lg:min-w-[174px] lg:items-end'}>
        <div className="flex w-full items-start gap-2">
        <div className="relative min-w-0 flex-1" ref={menuAnchorRef}>
          {canDeploy || canApproveDesign || designApproved ? (
            <div
              data-testid="milestone-stage-action"
              className={narrow ? 'w-full' : 'w-full lg:w-[174px]'}
              style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid var(--border-2)', borderRadius: 9, background: 'var(--surface)' }}
            >
              {stageTrigger}
              {approveButton}
              {designWaitingNote}
              {approveDesignButton}
              {requestDesignChangesButton}
              {designApprovedStrip}
            </div>
          ) : stageTrigger}
          {staff && stageMenuOpen && !phoneSheet ? (
            <TileStagePopover anchorRef={menuAnchorRef}>
              <StatusMenu current={stage.label} canClose={canClose} openCount={openCount} onPick={pickStatus} onClose={closeStageMenu} buildState={buildState} phase={milestone.designGate?.phase} />
            </TileStagePopover>
          ) : null}
        </div>
        {staff && closeout ? (
          <span data-testid="milestone-overflow-slot" className="inline-flex shrink-0" style={{ marginTop: 3 }}>
            {closeout}
          </span>
        ) : null}
        </div>
        {awaitingMerge ? (
          <p
            data-testid="milestone-awaiting"
            style={{
              margin: 0,
              width: '100%',
              boxSizing: 'border-box',
              border: '1px solid var(--border)',
              borderRadius: 9,
              padding: '8px 10px',
              fontSize: 12,
              lineHeight: '18px',
              color: 'var(--fg)',
            }}
          >
            {AWAITING_MERGE_LINE}
          </p>
        ) : null}
        <span
          className={narrow ? 'ds-mono max-w-full whitespace-normal' : 'ds-mono max-w-full whitespace-normal lg:w-max lg:max-w-none lg:whitespace-nowrap'}
          data-testid="milestone-progress"
          style={{
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: '4px 12px',
            fontSize: 11,
            lineHeight: '17px',
            color: 'var(--muted)',
          }}
        >
          {narrow ? (
            <ProgressCopy done={milestone.doneCount} total={total} nested={subtasks} phone />
          ) : (
            <>
              <span className="lg:hidden">
                <ProgressCopy done={milestone.doneCount} total={total} nested={subtasks} phone />
              </span>
              <span className="hidden lg:inline">
                <ProgressCopy done={milestone.doneCount} total={total} nested={subtasks} phone={false} />
              </span>
            </>
          )}
        </span>
      </div>
      {linkField ? (
        <PortalModal
          testId="milestone-tile-link"
          label={linkField === 'localPreview' ? 'Local preview' : 'Figma'}
          onClose={() => {
            if (!linkBusy) setLinkField(null);
          }}
          narrow={viewportSheet}
          sheet="bottom"
          width={480}
          showFooter={false}
          blueFocus
          locked={linkBusy}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '8px 24px 20px' }}>
            <input
              data-testid="milestone-tile-link-input"
              value={linkDraft}
              onChange={(event) => {
                setLinkDraft(event.target.value);
                if (linkError) setLinkError(null);
              }}
              placeholder={linkField === 'localPreview' ? 'http://localhost:3200' : 'https://www.figma.com/design/…'}
              style={{ ...fieldStyle, width: '100%' }}
              disabled={linkBusy}
            />
            {linkError ? (
              <p role="alert" data-testid="milestone-tile-link-error" style={{ margin: 0, color: 'var(--danger-text)', fontSize: 13, lineHeight: '18px' }}>
                {linkError}
              </p>
            ) : null}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              {(linkField === 'localPreview' ? localUrl : figmaUrl) ? (
                <OutlineButton
                  nowrap
                  onClick={() => {
                    if (!linkField || linkBusy) return;
                    void writeLink(linkField, null);
                  }}
                >
                  Clear
                </OutlineButton>
              ) : null}
              <OutlineButton nowrap onClick={() => { if (!linkBusy) setLinkField(null); }}>Cancel</OutlineButton>
              <button type="button" onClick={saveLink} disabled={linkBusy} style={{ background: 'var(--accent)', color: 'var(--accent-fg)', border: 0, borderRadius: 9, padding: '8px 14px', fontSize: 14, cursor: 'pointer', opacity: linkBusy ? 0.4 : 1 }}>
                Save
              </button>
            </div>
          </div>
        </PortalModal>
      ) : null}
      {moves.error ? (
        <p role="alert" data-testid="tile-status-error" className="lg:col-span-2" style={{ margin: 0, color: 'var(--danger-text)', fontSize: 13, lineHeight: '18px' }}>
          {moves.error}
        </p>
      ) : null}
      {staff ? moves.toast : null}
      {showDeploy ? (
        <PortalModal
          testId="milestone-deploy-confirm"
          label={deploying ? RECORDING_APPROVAL : APPROVE_CONFIRM_TITLE}
          onClose={() => {
            if (!deploying) setConfirm(false);
          }}
          narrow={phone || viewportSheet}
          sheet="bottom"
          header="compact"
          blueFocus
          showIcon={deploying}
          icon="spinner"
          showFooter={false}
          cover={cover}
          focusCancel
          locked={deploying}
          onConfirm={confirmDeploy}
          confirmOnEnter
        >
          <div style={{ padding: phone || viewportSheet ? '8px 16px' : '8px 24px' }}>
            {deploying ? (
              <>
                <p style={{ margin: 0, fontSize: 14, lineHeight: '21px' }}>{SAVING_APPROVAL_COPY}</p>
              </>
            ) : (
              <>
                <p style={{ margin: 0, fontSize: 14, lineHeight: '21px' }}>{APPROVE_CONFIRM_COPY}</p>
                <p style={{ margin: 0, fontSize: 14, lineHeight: '21px' }}>You can’t undo this from the Portal.</p>
              </>
            )}
            {deployError ? <p role="alert" style={{ color: 'var(--danger-text)', fontSize: 14 }}>{deployError}</p> : null}
          </div>
          <div style={{ display: 'flex', flexWrap: 'nowrap', justifyContent: 'flex-end', gap: 8, padding: phone || viewportSheet ? '16px 16px 24px' : '16px 24px 20px' }}>
            {deploying ? null : <OutlineButton nowrap onClick={() => setConfirm(false)}>Cancel</OutlineButton>}
            <button type="button" disabled={deploying} onClick={confirmDeploy} className="inline-flex shrink-0 items-center justify-center gap-2" style={{ background: '#f59e0b', color: '#0a0a0b', border: 0, borderRadius: 9, padding: '8px 14px', fontSize: 14, whiteSpace: 'nowrap', opacity: deploying ? 0.4 : 1 }}>
              {deploying ? 'Approving…' : 'Approve'}
            </button>
          </div>
        </PortalModal>
      ) : null}
      {showDesignConfirm ? (
        <PortalModal
          testId="milestone-design-confirm"
          label={DESIGN_CONFIRM_TITLE}
          onClose={() => {
            if (!approvingDesign) setDesignConfirm(false);
          }}
          narrow={phone || viewportSheet}
          sheet="bottom"
          header="compact"
          blueFocus
          showIcon={approvingDesign}
          icon="spinner"
          showFooter={false}
          cover={cover}
          focusCancel
          locked={approvingDesign}
          onConfirm={confirmDesign}
          confirmOnEnter
        >
          <div style={{ padding: phone || viewportSheet ? '8px 16px' : '8px 24px' }}>
            <p style={{ margin: 0, fontSize: 14, lineHeight: '21px' }}>{DESIGN_CONFIRM_COPY}</p>
            <p style={{ margin: 0, fontSize: 14, lineHeight: '21px' }}>Nothing merges or deploys.</p>
            {designError ? <p role="alert" style={{ color: 'var(--danger-text)', fontSize: 14 }}>{designError}</p> : null}
          </div>
          <div style={{ display: 'flex', flexWrap: 'nowrap', justifyContent: 'flex-end', gap: 8, padding: phone || viewportSheet ? '16px 16px 24px' : '16px 24px 20px' }}>
            {approvingDesign ? null : <OutlineButton nowrap onClick={() => setDesignConfirm(false)}>Cancel</OutlineButton>}
            <button type="button" disabled={approvingDesign} onClick={confirmDesign} className="inline-flex shrink-0 items-center justify-center gap-2" style={{ background: '#f59e0b', color: '#0a0a0b', border: 0, borderRadius: 9, padding: '8px 14px', fontSize: 14, whiteSpace: 'nowrap', opacity: approvingDesign ? 0.4 : 1 }}>
              {approvingDesign ? 'Approving…' : 'Approve designs'}
            </button>
          </div>
        </PortalModal>
      ) : null}
      {designChangesOpen && onRequestDesignChanges ? (
        <DesignChangesDialog
          designTasks={designTasks}
          onSend={onRequestDesignChanges}
          onClose={() => setDesignChangesOpen(false)}
          narrow={phone || viewportSheet}
          cover={cover}
        />
      ) : null}
      {staff && stageMenuOpen && phoneSheet ? (
        <PortalModal
          testId="tile-stage-menu"
          scrimTestId="tile-stage-scrim"
          label="Status"
          onClose={closeStageMenu}
          narrow
          sheet="bottom"
          showFooter={false}
          cover={cover}
        >
          <StatusMenu current={stage.label} canClose={canClose} openCount={openCount} onPick={pickStatus} onClose={closeStageMenu} buildState={buildState} phase={milestone.designGate?.phase} sheet />
        </PortalModal>
      ) : null}
    </article>
  );
}
