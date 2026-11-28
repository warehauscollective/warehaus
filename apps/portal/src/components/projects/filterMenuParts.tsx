'use client';

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { TaskGlyph } from '@/components/tasks/TaskGlyph';

/**
 * The pieces a filter menu is built from: the trigger style, the popover or
 * bottom sheet layer, option rows, sheet header and footer, sections and the
 * applied-value chips. Shared by the project list (`ProjectListFilterMenu`)
 * and the project page's milestone list (`MilestoneFilterBar`), so the two
 * match.
 */

export const ICON = {
  funnel: '/icons/filter-funnel.svg',
  down: '/icons/filter-chev-down.svg',
  right: '/icons/filter-chev-right.svg',
  check: '/icons/filter-check.svg',
  radioOn: '/icons/filter-radio-on.svg',
  calendar: '/icons/filter-calendar.svg',
  x: '/icons/filter-x.svg',
};

export const MONO = 'var(--font-mono)';

export const plainButton: CSSProperties = {
  background: 'transparent',
  border: 0,
  padding: 0,
  margin: 0,
  color: 'inherit',
  font: 'inherit',
  cursor: 'pointer',
  textAlign: 'left',
};

/** Phone layout at 767 and under, the same break the page uses. `ready` is false until mounted. */
export function usePhone(): { phone: boolean; ready: boolean } {
  const [state, setState] = useState({ phone: false, ready: false });
  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const apply = () => setState({ phone: media.matches, ready: true });
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, []);
  return state;
}

export function toggled<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

export function triggerStyle(open: boolean): CSSProperties {
  return {
    minHeight: 35,
    padding: '8px 12px',
    borderRadius: 9,
    border: '1px solid var(--border-2)',
    background: open ? 'var(--surface-2)' : 'transparent',
    color: 'var(--fg)',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
  };
}

/**
 * Popover or bottom sheet. Moves focus in on open, keeps Tab inside, moves
 * with the arrow keys, and closes on Escape or a press outside.
 */
export function MenuLayer({
  id,
  label,
  testId,
  phone,
  portal,
  width,
  align = 'end',
  anchor,
  onClose,
  children,
}: {
  id: string;
  label: string;
  testId: string;
  phone: boolean;
  /** False on the server and the first paint: the menu renders in place. */
  portal: boolean;
  width: number;
  /** Which edge of the control the popover lines up with. `start` for a control on the left of its row. */
  align?: 'start' | 'end';
  anchor: RefObject<HTMLButtonElement | null>;
  onClose: (returnFocus: boolean) => void;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [place, setPlace] = useState<{ top: number; left: number; right: number; maxHeight: number } | null>(null);

  useLayoutEffect(() => {
    if (!portal || phone) return;
    const update = () => {
      const rect = anchor.current?.getBoundingClientRect();
      if (!rect) return;
      const top = rect.bottom + 8;
      const shown = Math.min(width, window.innerWidth - 16);
      setPlace({
        top,
        left: Math.max(8, Math.min(rect.left, window.innerWidth - shown - 8)),
        right: Math.max(8, window.innerWidth - rect.right),
        maxHeight: Math.max(160, window.innerHeight - top - 16),
      });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [portal, phone, anchor, width]);

  useEffect(() => {
    if (!portal) return;
    const node = panel.current;
    if (node && !node.contains(document.activeElement)) {
      node.querySelector<HTMLElement>('[data-menu-item]')?.focus();
    }
  }, [portal, phone]);

  useEffect(() => {
    const items = () =>
      [...(panel.current?.querySelectorAll<HTMLElement>('[data-menu-item]') ?? [])].filter(
        (item) => !item.hasAttribute('disabled'),
      );
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current(true);
        return;
      }
      const node = panel.current;
      const active = document.activeElement;
      if (!node || !(active instanceof HTMLElement) || !node.contains(active)) return;
      const list = items();
      if (list.length === 0) return;
      const index = list.indexOf(active);
      if (event.key === 'Tab') {
        if (event.shiftKey && index <= 0) {
          event.preventDefault();
          list[list.length - 1]?.focus();
        } else if (!event.shiftKey && index === list.length - 1) {
          event.preventDefault();
          list[0]?.focus();
        }
        return;
      }
      // A date field uses the arrow keys for its own day, month and year.
      if (active instanceof HTMLInputElement) return;
      let next = -1;
      if (event.key === 'ArrowDown') next = index + 1 >= list.length ? 0 : index + 1;
      else if (event.key === 'ArrowUp') next = index <= 0 ? list.length - 1 : index - 1;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = list.length - 1;
      if (next === -1) return;
      event.preventDefault();
      list[next]?.focus();
    };
    const onPress = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (panel.current?.contains(target) || anchor.current?.contains(target)) return;
      closeRef.current(false);
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onPress, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onPress, true);
    };
  }, [anchor]);

  const dialog = {
    ref: panel,
    id,
    role: 'dialog' as const,
    'aria-label': label,
    'data-testid': testId,
  };

  if (portal && phone) {
    return createPortal(
      <div
        className="ds-scope portal-modal-scrim"
        data-sheet-layer="viewport"
        data-testid="project-list-menu-scrim"
        style={{ position: 'fixed', inset: 0, zIndex: 140, display: 'flex', alignItems: 'flex-end' }}
      >
        <div
          {...dialog}
          aria-modal
          data-size="390"
          className="flex w-full flex-col"
          style={{
            maxHeight: 'calc(100dvh - 72px)',
            background: 'var(--surface)',
            color: 'var(--fg)',
            borderTop: '1px solid var(--border-2)',
            borderRadius: '28px 28px 0 0',
            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
            overflow: 'hidden',
          }}
        >
          {children}
        </div>
      </div>,
      document.body,
    );
  }

  const popover: CSSProperties = {
    width,
    maxWidth: 'calc(100vw - 16px)',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    padding: 6,
    background: 'var(--surface)',
    color: 'var(--fg)',
    border: '1px solid var(--border-2)',
    borderRadius: 18,
    boxShadow: '0px 16px 40px 0px rgba(0,0,0,0.5)',
    overflowY: 'auto',
  };

  if (!portal) {
    return (
      <div
        {...dialog}
        data-size="1440"
        style={{
          ...popover,
          position: 'absolute',
          top: 'calc(100% + 8px)',
          ...(align === 'start' ? { left: 0 } : { right: 0 }),
          zIndex: 30,
          maxHeight: '70vh',
        }}
      >
        {children}
      </div>
    );
  }

  return createPortal(
    <div className="ds-scope">
      <div
        {...dialog}
        data-size="1440"
        style={{
          ...popover,
          position: 'fixed',
          zIndex: 70,
          top: place?.top ?? 0,
          ...(align === 'start' ? { left: place?.left ?? 0 } : { right: place?.right ?? 0 }),
          maxHeight: place?.maxHeight ?? '70vh',
          visibility: place ? 'visible' : 'hidden',
        }}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function rowPadding(phone: boolean): string {
  return phone ? '14px 10px' : '10px';
}

export function SheetHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <>
      <div aria-hidden className="flex shrink-0 justify-center" style={{ paddingTop: 8 }}>
        <span style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border-2)' }} />
      </div>
      <div className="flex shrink-0 items-center" style={{ padding: '16px 24px' }}>
        <p className="min-w-0 flex-1" style={{ margin: 0, fontSize: 20, lineHeight: '30px', fontWeight: 600 }}>
          {title}
        </p>
        <button
          type="button"
          data-menu-item=""
          className="project-filter-focus"
          onClick={onClose}
          style={{
            ...plainButton,
            padding: '12px 16px',
            borderRadius: 9,
            fontSize: 14,
            fontWeight: 500,
            color: 'var(--muted)',
          }}
        >
          Close
        </button>
      </div>
    </>
  );
}

export function SheetFooter({ hint, onDone, children }: { hint: string; onDone: () => void; children?: ReactNode }) {
  return (
    <div
      className="flex shrink-0 items-center"
      style={{ gap: 8, padding: '16px 24px 24px', borderTop: '1px solid var(--border)' }}
    >
      <p
        className="min-w-0 flex-1"
        style={{ margin: 0, fontFamily: MONO, fontSize: 12, lineHeight: '18px', color: 'var(--muted)' }}
      >
        {hint}
      </p>
      {children}
      <button
        type="button"
        data-menu-item=""
        className="project-filter-focus shrink-0"
        onClick={onDone}
        style={{
          ...plainButton,
          padding: '12px 16px',
          borderRadius: 9,
          background: 'var(--accent)',
          color: 'var(--accent-fg)',
          fontSize: 14,
          fontWeight: 500,
        }}
      >
        Done
      </button>
    </div>
  );
}

export function PopoverFoot({ children }: { children: string }) {
  return (
    <p style={{ margin: 0, padding: '10px 10px 4px', fontFamily: MONO, fontSize: 11, color: 'var(--muted)' }}>
      {children}
    </p>
  );
}

export function Mark({ kind, on }: { kind: 'check' | 'radio'; on: boolean }) {
  if (kind === 'radio') {
    return on ? (
      <span className="inline-flex shrink-0" style={{ color: 'var(--accent)' }}>
        <TaskGlyph src={ICON.radioOn} size={16} />
      </span>
    ) : (
      <span
        aria-hidden
        className="shrink-0"
        style={{ width: 16, height: 16, boxSizing: 'border-box', borderRadius: 8, border: '1px solid var(--muted)' }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className="relative shrink-0"
      style={{
        width: 16,
        height: 16,
        boxSizing: 'border-box',
        borderRadius: 4,
        border: `1px solid ${on ? 'var(--accent)' : 'var(--muted)'}`,
        background: on ? 'var(--accent)' : 'transparent',
      }}
    >
      {on ? (
        <span className="absolute inline-flex" style={{ inset: -1, color: 'var(--accent-fg)' }}>
          <TaskGlyph src={ICON.check} size={16} />
        </span>
      ) : null}
    </span>
  );
}

export function OptionRow({
  kind,
  on,
  label,
  phone,
  testId = 'project-filter-option',
  onPick,
}: {
  kind: 'check' | 'radio';
  on: boolean;
  label: string;
  phone: boolean;
  testId?: string;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      role={kind === 'check' ? 'checkbox' : 'radio'}
      aria-checked={on}
      data-menu-item=""
      data-testid={testId}
      className="project-filter-focus flex w-full shrink-0 items-center"
      onClick={onPick}
      style={{
        ...plainButton,
        gap: 10,
        padding: rowPadding(phone),
        borderRadius: 9,
        background: on ? 'var(--surface-2)' : 'transparent',
      }}
    >
      <Mark kind={kind} on={on} />
      <span className="min-w-0 flex-1" style={{ fontSize: 14, lineHeight: '21px', overflowWrap: 'anywhere' }}>
        {label}
      </span>
    </button>
  );
}

/** The number of filters set, on the Filters control. */
export function FilterCount({ count, testId }: { count: number; testId: string }) {
  if (count <= 0) return null;
  return (
    <span
      data-testid={testId}
      className="inline-flex items-center justify-center"
      style={{
        minWidth: 18,
        padding: '1px 6px',
        borderRadius: 999,
        background: 'var(--accent)',
        color: 'var(--accent-fg)',
        fontFamily: MONO,
        fontSize: 11,
        fontWeight: 500,
      }}
    >
      <span className="sr-only">Filters set: </span>
      {count}
    </span>
  );
}

/** One filter in the menu: its name, the summary of what is picked, and its choices when open. */
export function FilterSection({
  regionId,
  filter,
  label,
  summary,
  open,
  phone,
  pickOne = false,
  testId = 'project-filter-section',
  summaryTestId = 'project-filter-summary',
  onToggle,
  children,
}: {
  regionId: string;
  filter: string;
  label: string;
  summary: { text: string; set: boolean };
  open: boolean;
  phone: boolean;
  /** Radios, so the choices are a radiogroup. */
  pickOne?: boolean;
  testId?: string;
  summaryTestId?: string;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flex shrink-0 flex-col" style={{ gap: 2 }} data-testid={testId} data-filter={filter}>
      <button
        type="button"
        data-menu-item=""
        className="project-filter-focus flex w-full items-center"
        aria-expanded={open}
        aria-controls={open ? regionId : undefined}
        onClick={onToggle}
        style={{ ...plainButton, gap: 10, padding: rowPadding(phone), borderRadius: 9 }}
      >
        <span className="min-w-0 flex-1" style={{ fontSize: 14, lineHeight: '21px', fontWeight: 500 }}>
          {label}
        </span>
        <span
          className="max-w-[60%] truncate"
          data-testid={summaryTestId}
          style={{
            fontFamily: MONO,
            fontSize: 12,
            lineHeight: '18px',
            color: summary.set ? 'var(--fg)' : 'var(--muted)',
          }}
        >
          {summary.text}
        </span>
        <span className="inline-flex" style={{ color: 'var(--muted)' }}>
          <TaskGlyph src={open ? ICON.down : ICON.right} size={14} />
        </span>
      </button>
      {open ? (
        <div
          id={regionId}
          role={pickOne ? 'radiogroup' : 'group'}
          aria-label={label}
          className="flex flex-col"
          style={{ gap: 2 }}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The Filters menu around its sections. Popover: title, Clear filters when a
 * filter is set, the sections, then the foot. Bottom sheet: header with Close,
 * the sections, then the hint with Clear filters and Done.
 */
export function FilterMenuFrame({
  phone,
  filtered,
  foot,
  hint,
  clearTestId,
  onClear,
  onClose,
  children,
}: {
  phone: boolean;
  /** Whether a filter is set, which is when Clear filters shows. */
  filtered: boolean;
  /** The line under the popover. */
  foot: string;
  /** The line in the sheet footer. */
  hint: string;
  clearTestId: string;
  onClear: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  if (phone) {
    return (
      <>
        <SheetHeader title="Filters" onClose={onClose} />
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto" style={{ gap: 2, padding: '8px 24px' }}>
          {children}
        </div>
        <SheetFooter hint={hint} onDone={onClose}>
          {filtered ? (
            <button
              type="button"
              data-menu-item=""
              data-testid={clearTestId}
              className="project-filter-focus shrink-0"
              onClick={onClear}
              style={{
                ...plainButton,
                padding: '12px 16px',
                borderRadius: 9,
                border: '1px solid var(--border-2)',
                fontSize: 14,
                fontWeight: 500,
                color: 'var(--fg)',
              }}
            >
              Clear filters
            </button>
          ) : null}
        </SheetFooter>
      </>
    );
  }

  return (
    <>
      <div className="flex shrink-0 items-center" style={{ padding: '8px 10px' }}>
        <p className="min-w-0 flex-1" style={{ margin: 0, fontSize: 14, lineHeight: '21px', fontWeight: 500 }}>
          Filters
        </p>
        {filtered ? (
          <button
            type="button"
            data-menu-item=""
            data-testid={clearTestId}
            className="project-filter-focus whitespace-nowrap"
            onClick={onClear}
            style={{ ...plainButton, fontSize: 13, fontWeight: 500, borderRadius: 4 }}
          >
            Clear filters
          </button>
        ) : null}
      </div>
      {children}
      <PopoverFoot>{foot}</PopoverFoot>
    </>
  );
}

/** The values that are set, one chip each with its remove, then Clear filters. */
export function AppliedFilterChips({
  chips,
  testId,
  chipTestId,
  clearTestId,
  className = 'mt-3 flex flex-wrap items-center gap-2',
  onRemove,
  onClear,
}: {
  chips: readonly { id: string; field: string; value: string }[];
  testId: string;
  chipTestId: string;
  clearTestId: string;
  className?: string;
  onRemove: (id: string) => void;
  onClear: () => void;
}) {
  return (
    <div className={className} data-testid={testId}>
      {chips.map((chip) => (
        <span
          key={chip.id}
          data-testid={chipTestId}
          className="inline-flex max-w-full items-center"
          style={{
            gap: 6,
            padding: '6px 8px 6px 12px',
            borderRadius: 999,
            border: '1px solid var(--border-2)',
            background: 'var(--surface-2)',
            fontSize: 12,
            fontWeight: 500,
          }}
        >
          <span className="whitespace-nowrap" style={{ color: 'var(--muted)' }}>
            {chip.field}
          </span>
          <span className="truncate" style={{ color: 'var(--fg)' }}>
            {chip.value}
          </span>
          <button
            type="button"
            className="project-filter-focus inline-flex shrink-0 items-center justify-center"
            aria-label={`Remove ${chip.field} ${chip.value}`}
            onClick={() => onRemove(chip.id)}
            style={{ ...plainButton, width: 18, height: 18, borderRadius: 999, color: 'var(--muted)' }}
          >
            <TaskGlyph src={ICON.x} size={16} />
          </button>
        </span>
      ))}
      <button
        type="button"
        className="project-filter-focus whitespace-nowrap"
        data-testid={clearTestId}
        onClick={onClear}
        style={{ ...plainButton, fontSize: 13, fontWeight: 500, color: 'var(--fg)', borderRadius: 4 }}
      >
        Clear filters
      </button>
    </div>
  );
}
