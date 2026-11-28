'use client';

import { createdViaLabel } from '@convex/_lib/milestoneTasks';
import { type MilestoneStatus } from '@convex/_lib/milestoneStatus';
import type { MilestoneRoadmapView } from '@convex/_lib/milestones';
import { FIXTURE_CONTACTS, FIXTURE_PROJECTS } from '@/lib/data/fixtures';
import { type OwnerChoice } from './milestoneDetailsEdit';
import { type PortalTask } from '@/lib/data/view-models';
import { milestoneStatusGlyph } from './MilestoneStatusControl';
import {
  localMonthDay,
} from './milestoneGuards';

export type RoadmapProject = {
  id: string;
  name: string;
  status?: string;
  endDate?: string | null;
  clientName?: string | null;
  liveUrl?: string | null;
  figmaLink?: string | null;
  docsUrl?: string | null;
  description?: string | null;
  publishToWarehaus?: boolean;
  internal?: boolean;
};

export type MilestoneActivityItem = {
  id: string;
  name: string;
  type: string;
  summary: string;
  timestamp: string;
  projectId: string | null;
  milestoneId?: string | null;
};

export type ResourceChoice = { id: string; title: string };

export type FixturePatch = Partial<
  Pick<
    MilestoneRoadmapView,
    | 'name'
    | 'objective'
    | 'goals'
    | 'status'
    | 'approval'
    | 'note'
    | 'approverName'
    | 'decidedAt'
    | 'designApprovedAt'
    | 'publishToWarehaus'
    | 'resources'
    | 'ownerContactId'
    | 'ownerName'
    | 'dueDate'
    | 'creatorName'
    | 'localPreviewUrl'
    | 'figmaUrl'
    | 'figmaFrameUrls'
  >
> & {
  attachedIds?: string[];
  detachedIds?: string[];
};

function formatWhen(at: number | null): string | null {
  if (at == null) return null;
  return new Date(at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Name and decision day. A name alone is not a date. */
export function lastReviewLabel(input: { approverName: string | null; decidedAt: number | null }): string | null {
  const when = formatWhen(input.decidedAt);
  const name = input.approverName?.trim() ? input.approverName.trim() : null;
  if (name && when) return `${name} · ${when}`;
  return when ?? name;
}

/** A `YYYY-MM-DD` value is a calendar day, not a timestamp. */
function calendarDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match) return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatCalendarDate(value: string, withYear: boolean): string {
  const date = calendarDate(value);
  if (!date) return value;
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(withYear ? { year: 'numeric' as const } : {}),
    timeZone: 'UTC',
  });
}

/** Project summary date. The list frame includes the year. */
export function nextDueLabel(value?: string | null): string {
  if (!value) return '—';
  return formatCalendarDate(value, true);
}

export function projectStatusLabel(status?: string | null): string {
  if (!status) return '—';
  if (/^in progress$/i.test(status)) return 'In progress';
  return status;
}

/** Staff and Peter see this while approval is stored and Shipped is not. */
export const AWAITING_MERGE_LINE = 'Approved · awaiting merge and deploy';

/** Clients see a ship date, never an approval date. */
export function clientTileDate(input: { status?: string | null; decidedAt?: number | null }): string | null {
  if (input.status !== 'Shipped') return null;
  if (input.decidedAt == null) return 'Shipped';
  return `Shipped ${localMonthDay(input.decidedAt).label}`;
}

/** Approved milestones show their decision day. Anything else has no date line. */
export function milestoneTileDate(input: {
  approval?: string | null;
  decidedAt?: number | null;
}): string | null {
  if (input.approval !== 'approved') return null;
  if (input.decidedAt == null) return 'Approved';
  return `Approved ${localMonthDay(input.decidedAt).label}`;
}

/**
 * Title-row date. Due while the milestone is open. Approved once it has
 * shipped. The awaiting-merge line stays in the status control, so this
 * returns null for that case.
 */
export function milestoneTileHeadline(input: {
  staff: boolean;
  approval?: string | null;
  status?: string | null;
  decidedAt?: number | null;
  dueDate?: string | null;
}): string | null {
  const awaiting = input.staff && input.approval === 'approved' && input.status !== 'Shipped';
  if (awaiting) return null;
  if (input.staff && input.approval === 'approved' && input.status === 'Shipped') {
    return milestoneTileDate({ approval: 'approved', decidedAt: input.decidedAt });
  }
  if (!input.staff && input.status === 'Shipped') {
    return clientTileDate({ status: 'Shipped', decidedAt: input.decidedAt });
  }
  if (!input.dueDate) return null;
  return `Due ${formatCalendarDate(input.dueDate, false)}`;
}

/**
 * The tile shows the same Status as the details panel. Shipped appears only
 * once it is stored. Approval is the review result, not a status.
 */
export function milestoneTileStatus(input: { status: MilestoneStatus }): { label: MilestoneStatus; glyph: string } {
  return { label: input.status, glyph: milestoneStatusGlyph(input.status) };
}

function progressBase(done: number, total: number, phone: boolean): string {
  return phone ? `${done} / ${total} tasks complete` : `${done} / ${total} complete`;
}

function progressNote(nested: number): string | null {
  if (nested === 1) return 'includes 1 subtask';
  if (nested > 1) return `includes ${nested} subtasks`;
  return null;
}

/** Desktop is `1 / 3 complete`. The phone chip adds the word tasks. Subtasks are named only when there is one. */
export function tileProgressLabel(done: number, total: number, nested: number, phone: boolean): string {
  const base = progressBase(done, total, phone);
  const note = progressNote(nested);
  return note ? `${base} · ${note}` : base;
}

/** The subtask phrase stays on one line. The chip may break after the dot. */
export function ProgressCopy({ done, total, nested, phone }: { done: number; total: number; nested: number; phone: boolean }) {
  const note = progressNote(nested);
  const base = progressBase(done, total, phone);
  if (!note) return base;
  return (
    <>
      {base}
      {' · '}
      <span style={{ whiteSpace: 'nowrap' }}>{note}</span>
    </>
  );
}

/**
 * Tile meta is the resource count. The milestone has no last-updated
 * timestamp, so the date line stays Due or Approved and this line does not
 * invent one. Review phrases stay off the tile.
 */
/** Resource count, then where the milestone was created when that is known. Staff only pass `createdVia`. */
export function tileMetaLine(input: { resources: number; createdVia?: string | null }): string {
  const via = createdViaLabel(input.createdVia);
  return via ? `${resourceLabel(input.resources)} · ${via}` : resourceLabel(input.resources);
}

export function resourceLabel(count: number): string {
  return count === 1 ? '1 resource' : `${count} resources`;
}

/** Core Links / Visibility tag, Staff only. Staff see it on unpublished tiles. Clients never do. */
export function StaffOnlyChip() {
  return (
    <span
      data-testid="milestone-staff-only"
      className="inline-flex shrink-0 items-center"
      style={{
        gap: 5,
        boxSizing: 'border-box',
        height: 23,
        padding: '2px 7px',
        border: '1px solid var(--border-2)',
        borderRadius: 999,
        color: 'var(--muted)',
        fontFamily: 'var(--font-geist), var(--font-body)',
        fontWeight: 500,
        fontSize: 11,
        lineHeight: '17px',
        whiteSpace: 'nowrap',
      }}
    >
      <span
        aria-hidden
        style={{
          width: 12,
          height: 12,
          flex: '0 0 12px',
          backgroundColor: 'currentColor',
          WebkitMaskImage: 'url(/icons/links-lock.svg)',
          maskImage: 'url(/icons/links-lock.svg)',
          WebkitMaskRepeat: 'no-repeat',
          maskRepeat: 'no-repeat',
          WebkitMaskPosition: 'center',
          maskPosition: 'center',
          WebkitMaskSize: 'contain',
          maskSize: 'contain',
        }}
      />
      Staff only
    </span>
  );
}

/** Resource row under a milestone. Unpublished staff rows name the type and stay staff-only. */
export function resourceAudienceLine(type: string | null | undefined, staff: boolean, published: boolean): string {
  const kind = type?.trim() || 'Resource';
  if (!staff) return `${kind} · Shared with you`;
  return published ? `${kind} · Shared with client` : `${kind} · Staff only`;
}

export function taskTotal(milestone: MilestoneRoadmapView): number {
  return milestone.openCount + milestone.doneCount;
}

/** Counts from the milestone rows, the rows the board draws: the Tasks tab label, View tasks and the Tasks subtitle. */
export function boardTaskCounts(milestone: MilestoneRoadmapView): { lanes: number; laneDone: number; nested: number } {
  return {
    lanes: milestone.rows.length,
    laneDone: milestone.rows.filter((row) => row.isDone).length,
    nested: milestone.rows.reduce((sum, row) => sum + row.children.length, 0),
  };
}

export function nestedCopy(nested: number): string {
  if (nested === 1) return '1 subtask stays on its parent card, not in its own lane.';
  return `${nested} subtasks stay on their parent cards, not in their own lanes.`;
}

/** Tasks the detach menu can unlink. A nested child is included only when it is linked to this milestone. */
export function milestoneDetachOptions(
  rows: readonly {
    id: string;
    name: string;
    onMilestone?: boolean;
    children?: readonly { id: string; name: string; onMilestone?: boolean }[];
  }[],
): { id: string; name: string }[] {
  return rows.flatMap((row) => [
    ...(row.onMilestone === false ? [] : [{ id: row.id, name: row.name }]),
    ...(row.children ?? [])
      .filter((child) => child.onMilestone === true)
      .map((child) => ({ id: child.id, name: child.name })),
  ]);
}

/** Inclusive list and overview progress. Lane badges stay on the board. */
export function inclusiveProgressCopy(done: number, total: number, nested: number): string {
  const base = `${done} of ${total} complete`;
  if (nested === 1) return `${base} · includes 1 subtask`;
  if (nested > 1) return `${base} · includes ${nested} subtasks`;
  return base;
}

export function milestoneTasks(tasks: readonly PortalTask[], milestone: MilestoneRoadmapView): PortalTask[] {
  const ids = new Set<string>();
  for (const row of milestone.rows) {
    ids.add(row.id);
    for (const child of row.children) ids.add(child.id);
  }
  return tasks.filter((task) => ids.has(task.id));
}

export function createdStamp(): string {
  return Math.random().toString(36).slice(2, 8);
}

export function fixtureOwnerChoices(projectId: string): OwnerChoice[] {
  const project = FIXTURE_PROJECTS.find((row) => row.id === projectId);
  if (!project) return [];
  return FIXTURE_CONTACTS.filter(
    (contact) =>
      contact.orgId === project.orgId &&
      contact.role === 'Warehaus Staff' &&
      contact.portalAccess === 'Enabled' &&
      !contact.syncHidden,
  ).map((contact) => ({ id: contact.id, name: contact.name }));
}
