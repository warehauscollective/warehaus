'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { TaskGlyph } from '@/components/tasks/TaskGlyph';
import {
  AppliedFilterChips,
  FilterCount,
  FilterMenuFrame,
  FilterSection,
  ICON,
  MONO,
  MenuLayer,
  OptionRow,
  SheetFooter,
  SheetHeader,
  PopoverFoot,
  toggled,
  triggerStyle,
  usePhone,
} from './filterMenuParts';
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
          <FilterCount count={count} testId="project-filters-count" />
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
    <AppliedFilterChips
      chips={chips}
      testId="project-applied-filters"
      chipTestId="project-filter-value"
      clearTestId="clear-filters-chip-row"
      onRemove={(id) => {
        const chip = chips.find((item) => item.id === id);
        if (chip) onChange(chip.remove);
      }}
      onClear={onClear}
    />
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
      <FilterSection
        key={key}
        regionId={regionId}
        filter={key}
        label={PROJECT_FILTER_LABEL[key]}
        summary={summary}
        open={isOpen}
        phone={phone}
        pickOne={pickOne}
        onToggle={() => onToggle(key)}
      >
        {choices(key)}
      </FilterSection>
    );
  });

  return (
    <FilterMenuFrame
      phone={phone}
      filtered={filtered}
      foot="Filters apply as you pick. Saved to your account."
      hint="Filters apply as you pick"
      clearTestId="clear-filters-menu"
      onClear={onClear}
      onClose={onClose}
    >
      {sections}
    </FilterMenuFrame>
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
