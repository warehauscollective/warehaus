'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { TaskGlyph } from '@/components/tasks/TaskGlyph';
import { OutlineButton } from '@/components/ui/primitives';
import {
  MILESTONE_APPROVAL_FILTER_LABEL,
  MILESTONE_FILTERS_CLEAR,
  MILESTONE_FILTERS_EMPTY_TITLE,
  MILESTONE_FILTER_LABEL,
  MILESTONE_NEEDS_YOU_LABEL,
  MILESTONE_STATUS_FILTER_LABEL,
  MILESTONE_TYPE_LABEL,
  activeMilestoneFilterCount,
  milestoneFilterKeys,
  milestoneFilterSummary,
  milestoneFilterValueChips,
  milestoneListViewIsFiltered,
  type MilestoneFilterKey,
  type MilestoneListView,
  type MilestoneListViewOptions,
} from '@/lib/data/milestoneFilters';
import {
  AppliedFilterChips,
  FilterCount,
  FilterMenuFrame,
  FilterSection,
  ICON,
  MenuLayer,
  OptionRow,
  toggled,
  triggerStyle,
  usePhone,
} from './filterMenuParts';

/** A change to the view. The page applies it to the view it holds, not to the pruned copy shown here. */
export type MilestoneListViewChange = (update: (view: MilestoneListView) => MilestoneListView) => void;

export type MilestoneFilterBarProps = {
  /** The view as shown: stale values already dropped (`pruneMilestoneListView`). */
  view: MilestoneListView;
  /** The choices this viewer's list has (`milestoneListViewOptions`). */
  options: MilestoneListViewOptions;
  /** Staff also get Approval and Needs you. A client gets Status and Type only. */
  staff: boolean;
  onChange: MilestoneListViewChange;
  /** Every filter back to Any. */
  onClear: () => void;
  /** Sits beside the Filters control: the Archived chip, staff only. */
  children?: ReactNode;
  /** Design review only: start with the menu open. */
  initialOpen?: boolean;
  /** Design review only: filters that start collapsed. Every filter starts open. */
  initialCollapsed?: readonly MilestoneFilterKey[];
};

/**
 * The filter row above the milestone list on the project page
 * (`docs/design/milestone-filters.md`): the Filters control with the number
 * of filters set, its menu, then the values that are set and Clear filters.
 * The menu is a popover under the control on desktop and a bottom sheet under
 * 768px. Every filter is pick-many and a pick applies at once.
 *
 * A filter with no choices is not in the menu, and when no filter has any
 * the control is not drawn: there is nothing this list can be narrowed by.
 */
export function MilestoneFilterBar({
  view,
  options,
  staff,
  onChange,
  onClear,
  children,
  initialOpen = false,
  initialCollapsed = [],
}: MilestoneFilterBarProps) {
  const [open, setOpen] = useState(initialOpen);
  const [collapsed, setCollapsed] = useState<readonly MilestoneFilterKey[]>(initialCollapsed);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const { phone, ready } = usePhone();

  useEffect(() => {
    setOpen(initialOpen);
  }, [initialOpen]);
  const collapsedKey = initialCollapsed.join(',');
  useEffect(() => {
    setCollapsed(collapsedKey ? (collapsedKey.split(',') as MilestoneFilterKey[]) : []);
  }, [collapsedKey]);

  const keys = milestoneFilterKeys(staff, options);
  const count = activeMilestoneFilterCount(view, staff);
  const filtered = milestoneListViewIsFiltered(view, staff);
  const chips = filtered ? milestoneFilterValueChips(view, staff) : [];
  const offered = keys.length > 0 || filtered;

  const close = (returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) trigger.current?.focus();
  };

  if (!offered && !children) return null;

  return (
    <div className="flex flex-col" data-testid="milestone-filter-bar" data-role={staff ? 'staff' : 'client'}>
      <div className="flex flex-wrap items-start gap-2">
        {offered ? (
          <div className="relative">
            {/* A button, so Enter and Space open it. */}
            <button
              ref={trigger}
              type="button"
              className="project-filter-focus inline-flex items-center gap-2 whitespace-nowrap"
              data-testid="milestone-filters-trigger"
              aria-haspopup="dialog"
              aria-expanded={open}
              aria-controls={open ? menuId : undefined}
              onClick={() => setOpen((current) => !current)}
              style={triggerStyle(open)}
            >
              <TaskGlyph src={ICON.funnel} size={16} />
              <span>Filters</span>
              <FilterCount count={count} testId="milestone-filters-count" />
            </button>
            {open ? (
              <MenuLayer
                id={menuId}
                label="Filters"
                testId="milestone-filter-menu"
                phone={phone}
                portal={ready}
                width={320}
                align="start"
                anchor={trigger}
                onClose={close}
              >
                <MilestoneFilterPanel
                  keys={keys}
                  view={view}
                  options={options}
                  phone={phone}
                  filtered={filtered}
                  collapsed={collapsed}
                  onToggle={(key) => setCollapsed((current) => toggled(current, key))}
                  onChange={onChange}
                  onClear={onClear}
                  onClose={() => close(true)}
                />
              </MenuLayer>
            ) : null}
          </div>
        ) : null}
        {children}
      </div>
      {filtered ? (
        <AppliedFilterChips
          chips={chips}
          testId="milestone-applied-filters"
          chipTestId="milestone-filter-value"
          clearTestId="milestone-filters-clear"
          onRemove={(id) => {
            const chip = chips.find((item) => item.id === id);
            if (chip) onChange(chip.remove);
          }}
          onClear={onClear}
        />
      ) : null}
    </div>
  );
}

function MilestoneFilterPanel({
  keys,
  view,
  options,
  phone,
  filtered,
  collapsed,
  onToggle,
  onChange,
  onClear,
  onClose,
}: {
  keys: readonly MilestoneFilterKey[];
  view: MilestoneListView;
  options: MilestoneListViewOptions;
  phone: boolean;
  filtered: boolean;
  collapsed: readonly MilestoneFilterKey[];
  onToggle: (key: MilestoneFilterKey) => void;
  onChange: MilestoneListViewChange;
  onClear: () => void;
  onClose: () => void;
}) {
  const baseId = useId();

  const option = (key: string, label: string, on: boolean, onPick: () => void) => (
    <OptionRow
      key={key}
      kind="check"
      phone={phone}
      testId="milestone-filter-option"
      label={label}
      on={on}
      onPick={onPick}
    />
  );

  const choices = (key: MilestoneFilterKey): ReactNode => {
    switch (key) {
      case 'status':
        return options.statuses.map((value) =>
          option(value, MILESTONE_STATUS_FILTER_LABEL[value], view.statuses.includes(value), () =>
            onChange((next) => ({ ...next, statuses: toggled(next.statuses, value) })),
          ),
        );
      case 'type':
        return options.types.map((value) =>
          option(value, MILESTONE_TYPE_LABEL[value], view.types.includes(value), () =>
            onChange((next) => ({ ...next, types: toggled(next.types, value) })),
          ),
        );
      case 'approval':
        return options.approval.map((value) =>
          option(value, MILESTONE_APPROVAL_FILTER_LABEL[value], view.approval.includes(value), () =>
            onChange((next) => ({ ...next, approval: toggled(next.approval, value) })),
          ),
        );
      case 'needsYou':
        return option('needsYou', MILESTONE_NEEDS_YOU_LABEL, view.needsYou, () =>
          onChange((next) => ({ ...next, needsYou: !next.needsYou })),
        );
    }
  };

  return (
    <FilterMenuFrame
      phone={phone}
      filtered={filtered}
      foot="Filters apply as you pick."
      hint="Filters apply as you pick"
      clearTestId="milestone-filters-clear-menu"
      onClear={onClear}
      onClose={onClose}
    >
      {keys.map((key) => (
        <FilterSection
          key={key}
          regionId={`${baseId}-${key}`}
          filter={key}
          label={MILESTONE_FILTER_LABEL[key]}
          summary={milestoneFilterSummary(key, view)}
          open={!collapsed.includes(key)}
          phone={phone}
          testId="milestone-filter-section"
          summaryTestId="milestone-filter-summary"
          onToggle={() => onToggle(key)}
        >
          {choices(key)}
        </FilterSection>
      ))}
    </FilterMenuFrame>
  );
}

/**
 * Shown in place of the milestone groups when the filters match nothing
 * (`Organism/Milestones` `State=filtered-empty`, Figma 1343:25633): the funnel,
 * one line, and Clear filters.
 */
export function MilestoneFiltersEmpty({ onClear }: { onClear: () => void }) {
  return (
    <div
      data-testid="milestone-filters-empty"
      className="flex flex-col items-center text-center"
      style={{ gap: 12, padding: '48px 24px' }}
    >
      <span style={{ color: 'var(--muted)' }}>
        <TaskGlyph src={ICON.funnel} size={28} />
      </span>
      <p style={{ margin: 0, fontSize: 14, lineHeight: '21px', color: 'var(--muted)' }}>
        {MILESTONE_FILTERS_EMPTY_TITLE}
      </p>
      <OutlineButton onClick={onClear} nowrap testId="milestone-filters-empty-clear">
        {MILESTONE_FILTERS_CLEAR}
      </OutlineButton>
    </div>
  );
}
