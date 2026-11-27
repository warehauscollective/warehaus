'use client';

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { TaskGlyph } from '@/components/tasks/TaskGlyph';
import {
  PROJECT_FILTER_LABEL,
  PROJECT_PROGRESS_BANDS,
  PROJECT_PROGRESS_LABEL,
  PROJECT_PUBLISH_LABEL,
  PROJECT_SORT_DIRECTION_LABEL,
  PROJECT_SORT_FIRST_DIRECTION,
  PROJECT_SORT_LABEL,
  PROJECT_TASKS_LABEL,
  PROJECT_UPDATED_LABEL,
  activeProjectFilterCount,
  effectiveProjectSort,
  formatProjectFilterDay,
  projectFilterKeys,
  projectFilterSummary,
  projectFilterValueChips,
  projectListViewIsFiltered,
  projectSortControlLabel,
  projectSortDirections,
  projectSortKeys,
  type ProjectDateRange,
  type ProjectFilterKey,
  type ProjectListMenuOpen,
  type ProjectListView,
  type ProjectListViewOptions,
  type ProjectPublishFilter,
  type ProjectTasksFilter,
  type ProjectUpdatedFilter,
} from '@/lib/data/projectList';

/** A change to the view. The page applies it to the view it holds, not to the pruned copy shown here. */
export type ProjectListViewChange = (update: (view: ProjectListView) => ProjectListView) => void;

export type ProjectListFilterMenuProps = {
  /** The view as shown: stale saved values already dropped. */
  view: ProjectListView;
  options: ProjectListViewOptions;
  staff: boolean;
  onChange: ProjectListViewChange;
  /** Chip to All and every filter to Any. Keeps the sort. */
  onClear: () => void;
  /** Design review only: start with a menu open. */
  initialOpen?: ProjectListMenuOpen;
  /** Design review only: filters that start expanded. */
  initialExpanded?: readonly ProjectFilterKey[];
};

const ICON = {
  funnel: '/icons/filter-funnel.svg',
  down: '/icons/filter-chev-down.svg',
  right: '/icons/filter-chev-right.svg',
  check: '/icons/filter-check.svg',
  radioOn: '/icons/filter-radio-on.svg',
  calendar: '/icons/filter-calendar.svg',
  x: '/icons/filter-x.svg',
};

const MONO = 'var(--font-mono)';

const plainButton: CSSProperties = {
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
function usePhone(): { phone: boolean; ready: boolean } {
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

function toggled<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

/**
 * The Filters and Sort controls with their menus. A popover under the control
 * on desktop, a bottom sheet on a phone. A pick applies at once.
 */
export function ProjectListFilterMenu({
  view,
  options,
  staff,
  onChange,
  onClear,
  initialOpen = null,
  initialExpanded = [],
}: ProjectListFilterMenuProps) {
  const [open, setOpen] = useState<ProjectListMenuOpen>(initialOpen);
  const [expanded, setExpanded] = useState<readonly ProjectFilterKey[]>(initialExpanded);
  const filtersButton = useRef<HTMLButtonElement>(null);
  const sortButton = useRef<HTMLButtonElement>(null);
  const filtersId = useId();
  const sortId = useId();
  const { phone, ready } = usePhone();

  useEffect(() => {
    setOpen(initialOpen);
  }, [initialOpen]);
  const expandedKey = initialExpanded.join(',');
  useEffect(() => {
    setExpanded(expandedKey ? (expandedKey.split(',') as ProjectFilterKey[]) : []);
  }, [expandedKey]);

  const count = activeProjectFilterCount(view, staff);
  const filtered = projectListViewIsFiltered(view, staff);
  const sort = effectiveProjectSort(view, staff);

  const close = (which: 'filters' | 'sort', returnFocus: boolean) => {
    setOpen((current) => (current === which ? null : current));
    if (returnFocus) (which === 'filters' ? filtersButton : sortButton).current?.focus();
  };

  return (
    <div className="flex shrink-0 items-start gap-2" data-testid="project-list-controls">
      <div className="relative">
        <button
          ref={filtersButton}
          type="button"
          className="project-filter-focus inline-flex items-center gap-2 whitespace-nowrap"
          data-testid="project-filters-trigger"
          aria-haspopup="dialog"
          aria-expanded={open === 'filters'}
          aria-controls={open === 'filters' ? filtersId : undefined}
          onClick={() => setOpen((current) => (current === 'filters' ? null : 'filters'))}
          style={triggerStyle(open === 'filters')}
        >
          <TaskGlyph src={ICON.funnel} size={16} />
          <span>Filters</span>
          {count > 0 ? (
            <span
              data-testid="project-filters-count"
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
          ) : null}
        </button>
        {open === 'filters' ? (
          <MenuLayer
            id={filtersId}
            label="Filters"
            testId="project-filter-menu"
            phone={phone}
            portal={ready}
            width={320}
            anchor={filtersButton}
            onClose={(returnFocus) => close('filters', returnFocus)}
          >
            <FilterPanel
              view={view}
              options={options}
              staff={staff}
              phone={phone}
              filtered={filtered}
              expanded={expanded}
              onToggle={(key) => setExpanded((current) => toggled(current, key))}
              onChange={onChange}
              onClear={onClear}
              onClose={() => close('filters', true)}
            />
          </MenuLayer>
        ) : null}
      </div>
      <div className="relative">
        <button
          ref={sortButton}
          type="button"
          className="project-filter-focus inline-flex items-center gap-2 whitespace-nowrap"
          data-testid="project-sort-trigger"
          aria-haspopup="dialog"
          aria-expanded={open === 'sort'}
          aria-controls={open === 'sort' ? sortId : undefined}
          onClick={() => setOpen((current) => (current === 'sort' ? null : 'sort'))}
          style={triggerStyle(open === 'sort')}
        >
          <span style={{ color: 'var(--muted)' }}>Sort</span>
          <span className="md:hidden">{PROJECT_SORT_LABEL[sort.key]}</span>
          <span className="hidden md:inline" data-testid="project-sort-value">
            {projectSortControlLabel(sort)}
          </span>
          <span className="inline-flex" style={{ color: 'var(--muted)' }}>
            <TaskGlyph src={ICON.down} size={14} />
          </span>
        </button>
        {open === 'sort' ? (
          <MenuLayer
            id={sortId}
            label="Sort"
            testId="project-sort-menu"
            phone={phone}
            portal={ready}
            width={280}
            anchor={sortButton}
            onClose={(returnFocus) => close('sort', returnFocus)}
          >
            <SortPanel
              view={view}
              staff={staff}
              phone={phone}
              onChange={onChange}
              onClose={() => close('sort', true)}
            />
          </MenuLayer>
        ) : null}
      </div>
    </div>
  );
}

function triggerStyle(open: boolean): CSSProperties {
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

/** The values that are set, one chip each, then Clear filters. Nothing when the list is unfiltered. */
export function ProjectListAppliedFilters({
  view,
  options,
  staff,
  onChange,
  onClear,
}: Pick<ProjectListFilterMenuProps, 'view' | 'options' | 'staff' | 'onChange' | 'onClear'>) {
  if (!projectListViewIsFiltered(view, staff)) return null;
  const chips = projectFilterValueChips(view, staff, options);
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2" data-testid="project-applied-filters">
      {chips.map((chip) => (
        <span
          key={chip.id}
          data-testid="project-filter-value"
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
            onClick={() => onChange(chip.remove)}
            style={{ ...plainButton, width: 18, height: 18, borderRadius: 999, color: 'var(--muted)' }}
          >
            <TaskGlyph src={ICON.x} size={16} />
          </button>
        </span>
      ))}
      <button
        type="button"
        className="project-filter-focus whitespace-nowrap"
        data-testid="clear-filters-chip-row"
        onClick={onClear}
        style={{ ...plainButton, fontSize: 13, fontWeight: 500, color: 'var(--fg)', borderRadius: 4 }}
      >
        Clear filters
      </button>
    </div>
  );
}

/**
 * Popover or bottom sheet. Moves focus in on open, keeps Tab inside, moves
 * with the arrow keys, and closes on Escape or a press outside.
 */
function MenuLayer({
  id,
  label,
  testId,
  phone,
  portal,
  width,
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
  anchor: RefObject<HTMLButtonElement | null>;
  onClose: (returnFocus: boolean) => void;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [place, setPlace] = useState<{ top: number; right: number; maxHeight: number } | null>(null);

  useLayoutEffect(() => {
    if (!portal || phone) return;
    const update = () => {
      const rect = anchor.current?.getBoundingClientRect();
      if (!rect) return;
      const top = rect.bottom + 8;
      setPlace({
        top,
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
  }, [portal, phone, anchor]);

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
        style={{ ...popover, position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 30, maxHeight: '70vh' }}
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
          right: place?.right ?? 0,
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

function rowPadding(phone: boolean): string {
  return phone ? '14px 10px' : '10px';
}

function SheetHeader({ title, onClose }: { title: string; onClose: () => void }) {
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

function SheetFooter({ hint, onDone, children }: { hint: string; onDone: () => void; children?: ReactNode }) {
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

function PopoverFoot({ children }: { children: string }) {
  return (
    <p style={{ margin: 0, padding: '10px 10px 4px', fontFamily: MONO, fontSize: 11, color: 'var(--muted)' }}>
      {children}
    </p>
  );
}

function Mark({ kind, on }: { kind: 'check' | 'radio'; on: boolean }) {
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

function OptionRow({
  kind,
  on,
  label,
  phone,
  onPick,
}: {
  kind: 'check' | 'radio';
  on: boolean;
  label: string;
  phone: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      role={kind === 'check' ? 'checkbox' : 'radio'}
      aria-checked={on}
      data-menu-item=""
      data-testid="project-filter-option"
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

function DateField({
  caption,
  label,
  value,
  onPick,
}: {
  caption: 'FROM' | 'TO';
  label: string;
  value: string | null;
  onPick: (day: string | null) => void;
}) {
  return (
    <label
      className="project-filter-date relative flex min-w-0 flex-1 flex-col"
      style={{ gap: 4, padding: '6px 8px', borderRadius: 10, border: '1px solid var(--border)', cursor: 'pointer' }}
    >
      <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--muted)' }}>{caption}</span>
      <span className="flex items-center" style={{ gap: 8 }}>
        <span className="min-w-0 flex-1 truncate" style={{ fontSize: 14, lineHeight: '21px' }}>
          {value ? formatProjectFilterDay(value) : 'Any date'}
        </span>
        <span className="inline-flex" style={{ color: 'var(--muted)' }}>
          <TaskGlyph src={ICON.calendar} size={14} />
        </span>
      </span>
      <input
        type="date"
        data-menu-item=""
        aria-label={label}
        value={value ?? ''}
        onChange={(event) => onPick(event.target.value || null)}
        onClick={(event) => {
          try {
            event.currentTarget.showPicker?.();
          } catch {
            // The browser opens its own picker, or has none.
          }
        }}
        className="absolute inset-0 h-full w-full"
        style={{ opacity: 0, cursor: 'pointer' }}
      />
    </label>
  );
}

const PUBLISH_CHOICES: readonly ProjectPublishFilter[] = ['any', 'published', 'unpublished'];
const TASKS_CHOICES: readonly ProjectTasksFilter[] = ['any', 'has', 'none'];
const UPDATED_CHOICES: readonly ProjectUpdatedFilter[] = ['any', '7d', '30d', '90d'];

function FilterPanel({
  view,
  options,
  staff,
  phone,
  filtered,
  expanded,
  onToggle,
  onChange,
  onClear,
  onClose,
}: {
  view: ProjectListView;
  options: ProjectListViewOptions;
  staff: boolean;
  phone: boolean;
  filtered: boolean;
  expanded: readonly ProjectFilterKey[];
  onToggle: (key: ProjectFilterKey) => void;
  onChange: ProjectListViewChange;
  onClear: () => void;
  onClose: () => void;
}) {
  const baseId = useId();
  const keys = projectFilterKeys(staff, options);

  const range = (key: 'startDate' | 'endDate') => {
    const value: ProjectDateRange = view[key];
    const set = (part: 'from' | 'to') => (day: string | null) =>
      onChange((next) => ({ ...next, [key]: { ...next[key], [part]: day } }));
    return (
      <div className="flex shrink-0" style={{ gap: 8, padding: '4px 10px 10px' }}>
        <DateField caption="FROM" label={`${PROJECT_FILTER_LABEL[key]} from`} value={value.from} onPick={set('from')} />
        <DateField caption="TO" label={`${PROJECT_FILTER_LABEL[key]} to`} value={value.to} onPick={set('to')} />
      </div>
    );
  };

  const choices = (key: ProjectFilterKey): ReactNode => {
    switch (key) {
      case 'status':
        return options.status.map((status) => (
          <OptionRow
            key={status}
            kind="check"
            phone={phone}
            label={status}
            on={view.status.some((item) => item.trim().toLowerCase() === status.trim().toLowerCase())}
            onPick={() =>
              onChange((next) => {
                const same = (item: string) => item.trim().toLowerCase() === status.trim().toLowerCase();
                return {
                  ...next,
                  status: next.status.some(same) ? next.status.filter((item) => !same(item)) : [...next.status, status],
                };
              })
            }
          />
        ));
      case 'client':
        return options.clients.map((client) => (
          <OptionRow
            key={client.id}
            kind="check"
            phone={phone}
            label={client.name}
            on={view.clientIds.includes(client.id)}
            onPick={() => onChange((next) => ({ ...next, clientIds: toggled(next.clientIds, client.id) }))}
          />
        ));
      case 'publish':
        return PUBLISH_CHOICES.map((choice) => (
          <OptionRow
            key={choice}
            kind="radio"
            phone={phone}
            label={PROJECT_PUBLISH_LABEL[choice]}
            on={view.publish === choice}
            onPick={() => onChange((next) => ({ ...next, publish: choice }))}
          />
        ));
      case 'stack':
        return options.stack.map((value) => (
          <OptionRow
            key={value}
            kind="check"
            phone={phone}
            label={value}
            on={view.stack.includes(value)}
            onPick={() => onChange((next) => ({ ...next, stack: toggled(next.stack, value) }))}
          />
        ));
      case 'startDate':
      case 'endDate':
        return range(key);
      case 'progress':
        return PROJECT_PROGRESS_BANDS.map((band) => (
          <OptionRow
            key={band}
            kind="check"
            phone={phone}
            label={PROJECT_PROGRESS_LABEL[band]}
            on={view.progress.includes(band)}
            onPick={() =>
              onChange((next) => {
                const picked = toggled(next.progress, band);
                return { ...next, progress: PROJECT_PROGRESS_BANDS.filter((item) => picked.includes(item)) };
              })
            }
          />
        ));
      case 'tasks':
        return TASKS_CHOICES.map((choice) => (
          <OptionRow
            key={choice}
            kind="radio"
            phone={phone}
            label={PROJECT_TASKS_LABEL[choice]}
            on={view.tasks === choice}
            onPick={() => onChange((next) => ({ ...next, tasks: choice }))}
          />
        ));
      case 'updated':
        return UPDATED_CHOICES.map((choice) => (
          <OptionRow
            key={choice}
            kind="radio"
            phone={phone}
            label={PROJECT_UPDATED_LABEL[choice]}
            on={view.updated === choice}
            onPick={() => onChange((next) => ({ ...next, updated: choice }))}
          />
        ));
    }
  };

  const sections = keys.map((key) => {
    const isOpen = expanded.includes(key);
    const summary = projectFilterSummary(key, view, options);
    const pickOne = key === 'publish' || key === 'tasks' || key === 'updated';
    const regionId = `${baseId}-${key}`;
    return (
      <div key={key} className="flex shrink-0 flex-col" style={{ gap: 2 }} data-testid="project-filter-section" data-filter={key}>
        <button
          type="button"
          data-menu-item=""
          className="project-filter-focus flex w-full items-center"
          aria-expanded={isOpen}
          aria-controls={isOpen ? regionId : undefined}
          onClick={() => onToggle(key)}
          style={{ ...plainButton, gap: 10, padding: rowPadding(phone), borderRadius: 9 }}
        >
          <span className="min-w-0 flex-1" style={{ fontSize: 14, lineHeight: '21px', fontWeight: 500 }}>
            {PROJECT_FILTER_LABEL[key]}
          </span>
          <span
            className="max-w-[60%] truncate"
            data-testid="project-filter-summary"
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
            <TaskGlyph src={isOpen ? ICON.down : ICON.right} size={14} />
          </span>
        </button>
        {isOpen ? (
          <div
            id={regionId}
            role={pickOne ? 'radiogroup' : 'group'}
            aria-label={PROJECT_FILTER_LABEL[key]}
            className="flex flex-col"
            style={{ gap: 2 }}
          >
            {choices(key)}
          </div>
        ) : null}
      </div>
    );
  });

  if (phone) {
    return (
      <>
        <SheetHeader title="Filters" onClose={onClose} />
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto" style={{ gap: 2, padding: '8px 24px' }}>
          {sections}
        </div>
        <SheetFooter hint="Filters apply as you pick" onDone={onClose}>
          {filtered ? (
            <button
              type="button"
              data-menu-item=""
              data-testid="clear-filters-menu"
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
            data-testid="clear-filters-menu"
            className="project-filter-focus whitespace-nowrap"
            onClick={onClear}
            style={{ ...plainButton, fontSize: 13, fontWeight: 500, borderRadius: 4 }}
          >
            Clear filters
          </button>
        ) : null}
      </div>
      {sections}
      <PopoverFoot>Filters apply as you pick. Saved to your account.</PopoverFoot>
    </>
  );
}

function SortPanel({
  view,
  staff,
  phone,
  onChange,
  onClose,
}: {
  view: ProjectListView;
  staff: boolean;
  phone: boolean;
  onChange: ProjectListViewChange;
  onClose: () => void;
}) {
  const sort = effectiveProjectSort(view, staff);
  const body = (
    <>
      <div role="radiogroup" aria-label="Sort by" className="flex flex-col" style={{ gap: 2 }}>
        {projectSortKeys(staff).map((key) => (
          <OptionRow
            key={key}
            kind="radio"
            phone={phone}
            label={PROJECT_SORT_LABEL[key]}
            on={sort.key === key}
            onPick={() =>
              onChange((next) =>
                next.sort.key === key ? next : { ...next, sort: { key, direction: PROJECT_SORT_FIRST_DIRECTION[key] } },
              )
            }
          />
        ))}
      </div>
      <div aria-hidden className="shrink-0" style={{ padding: '6px 10px' }}>
        <div style={{ height: 1, background: 'var(--border)' }} />
      </div>
      <p className="shrink-0" style={{ margin: 0, padding: '4px 10px', fontFamily: MONO, fontSize: 10, color: 'var(--muted)' }}>
        DIRECTION
      </p>
      <div role="radiogroup" aria-label="Direction" className="flex flex-col" style={{ gap: 2 }}>
        {projectSortDirections(sort.key).map((direction) => (
          <OptionRow
            key={direction}
            kind="radio"
            phone={phone}
            label={PROJECT_SORT_DIRECTION_LABEL[sort.key][direction]}
            on={sort.direction === direction}
            onPick={() => onChange((next) => ({ ...next, sort: { key: sort.key, direction } }))}
          />
        ))}
      </div>
    </>
  );

  if (phone) {
    return (
      <>
        <SheetHeader title="Sort" onClose={onClose} />
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto" style={{ gap: 2, padding: '8px 24px' }}>
          {body}
        </div>
        <SheetFooter hint="Saved to your account" onDone={onClose} />
      </>
    );
  }

  return (
    <>
      <div className="flex shrink-0 items-center" style={{ padding: '8px 10px' }}>
        <p className="min-w-0 flex-1" style={{ margin: 0, fontSize: 14, lineHeight: '21px', fontWeight: 500 }}>
          Sort by
        </p>
      </div>
      {body}
      <PopoverFoot>Saved to your account.</PopoverFoot>
    </>
  );
}
