'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useMutation } from 'convex/react';
import { userFacingErrorMessage } from '@convex/_lib/userFacingError';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { formatDueDate } from '@convex/_lib/milestoneDetails';
import type { MilestoneRoadmapView } from '@convex/_lib/milestones';
import { PortalModal } from '@/components/ui/PortalModal';
import { OutlineButton, PrimaryButton } from '@/components/ui/primitives';
import { useSafeQuery } from '@/hooks/useSafeQuery';
import { useMaxWidth } from '@/lib/design/useMaxWidth';
import { DueDateMenu, OwnerMenu, anchoredMenuBox, menuButtons, nextDialogFocus, type OwnerChoice } from './milestoneDetailsEdit';
import { type PortalTask } from '@/lib/data/view-models';
import {
  FieldLabel,
  Panel,
  fieldStyle,
} from './milestoneChrome';
import { type ResourceChoice, milestoneDetachOptions, createdStamp, fixtureOwnerChoices } from './milestoneTile';
import { TaskLine, pickerFieldStyle, textButton } from './roadmapParts';

export function MoreMenu({
  milestone,
  busy,
  attachable,
  describedBy,
  onPublish,
  onAttach,
  onDetach,
}: {
  milestone: MilestoneRoadmapView;
  busy: boolean;
  attachable: { id: string; name: string }[];
  describedBy?: string;
  onPublish: () => void;
  onAttach: (taskId: string) => void;
  onDetach: (taskId: string) => void;
}) {
  return (
    <Panel>
      <div className="flex flex-col gap-4">
        <div>
          <OutlineButton disabled={busy} describedBy={describedBy} onClick={onPublish}>
            {milestone.publishToWarehaus ? 'Unpublish' : 'Publish'}
          </OutlineButton>
        </div>
        <label className="flex flex-col gap-2" style={{ fontSize: 13, color: 'var(--muted)' }}>
          Assign existing task
          <select
            data-testid="milestone-attach"
            defaultValue=""
            aria-describedby={describedBy}
            disabled={busy || attachable.length === 0}
            onChange={(event) => {
              const taskId = event.target.value;
              event.target.value = '';
              if (taskId) onAttach(taskId);
            }}
            style={fieldStyle}
          >
            <option value="">{attachable.length === 0 ? 'No unassigned tasks' : 'Choose a task'}</option>
            {attachable.map((task) => (
              <option key={task.id} value={task.id}>
                {task.name}
              </option>
            ))}
          </select>
        </label>
        {milestoneDetachOptions(milestone.rows).length > 0 ? (
          <label className="flex flex-col gap-2" style={{ fontSize: 13, color: 'var(--muted)' }}>
            Remove from milestone
            <select
              data-testid="milestone-detach"
              defaultValue=""
              aria-describedby={describedBy}
              disabled={busy}
              onChange={(event) => {
                const taskId = event.target.value;
                event.target.value = '';
                if (taskId) onDetach(taskId);
              }}
              style={fieldStyle}
            >
              <option value="">Choose a task</option>
              {milestoneDetachOptions(milestone.rows).map((task) => (
                <option key={task.id} value={task.id}>
                  {task.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
    </Panel>
  );
}

export function TaskLines({
  milestone,
  tasks,
  staff,
  busy,
  onOpenTask,
  onDetach,
}: {
  milestone: MilestoneRoadmapView;
  tasks: readonly PortalTask[];
  staff: boolean;
  busy: boolean;
  onOpenTask?: (task: PortalTask) => void;
  onDetach: (taskId: string) => void;
}) {
  return (
    <div data-testid="milestone-tasks" className="flex flex-col gap-2">
      {milestone.rows.map((row) => (
        <div key={row.id}>
          <TaskLine
            row={row}
            testId="milestone-task"
            onOpen={
              onOpenTask
                ? () => {
                    const task = tasks.find((item) => item.id === row.id);
                    if (task) onOpenTask(task);
                  }
                : undefined
            }
          />
          {staff ? (
            <button type="button" data-testid="milestone-detach" disabled={busy} onClick={() => onDetach(row.id)} style={textButton}>
              Remove from milestone
            </button>
          ) : null}
          {row.children.map((child) => (
            <div key={child.id} className="pl-4">
              <TaskLine row={child} testId="milestone-subtask" />
              {staff && child.onMilestone ? (
                <button type="button" data-testid="milestone-detach-subtask" disabled={busy} onClick={() => onDetach(child.id)} style={textButton}>
                  Remove from milestone
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function resourceSummary(ids: readonly string[], choices: readonly ResourceChoice[]): string {
  if (ids.length === 0) return 'No resources attached yet';
  const titles = ids
    .map((id) => choices.find((choice) => choice.id === id)?.title)
    .filter((title): title is string => Boolean(title));
  return titles.length > 0 ? titles.join(', ') : `${ids.length} attached`;
}

function AttachResourcesModal({
  choices,
  resourceIds,
  phone,
  onChange,
  onClose,
}: {
  choices: readonly ResourceChoice[];
  resourceIds: readonly string[];
  phone: boolean;
  onChange: (ids: string[]) => void;
  onClose: () => void;
}) {
  return (
    <PortalModal
      testId="milestone-attach-dialog"
      label="Attach resources"
      onClose={onClose}
      narrow={phone}
      sheet="bottom"
      width={760}
      header="default"
      blueFocus
      panelStyle={{ padding: '8px 24px 16px' }}
      footer={
        <div className="flex flex-wrap gap-2">
          <OutlineButton onClick={onClose}>Done</OutlineButton>
        </div>
      }
    >
      {choices.length === 0 ? (
        <p style={{ margin: 0, fontSize: 14, lineHeight: '21px', color: 'var(--muted)' }}>No resources to attach.</p>
      ) : (
        <ul className="flex flex-col gap-2" aria-label="Project resources">
          {choices.map((choice) => {
            const selected = resourceIds.includes(choice.id);
            return (
              <li key={choice.id}>
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onChange(selected ? resourceIds.filter((id) => id !== choice.id) : [...resourceIds, choice.id])}
                  className="milestone-field flex w-full items-center gap-3 text-left"
                  style={{
                    border: selected ? '1px solid var(--fg)' : '1px solid var(--border)',
                    borderRadius: 12,
                    padding: '10px 12px',
                    background: selected ? 'var(--surface-2)' : 'transparent',
                    color: 'var(--fg)',
                    cursor: 'pointer',
                  }}
                >
                  <span className="min-w-0 flex-1" style={{ fontSize: 14, fontWeight: 500 }}>{choice.title}</span>
                  <span style={{ fontSize: 13, color: selected ? 'var(--fg)' : 'var(--muted)' }}>{selected ? 'Selected' : 'Attach'}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </PortalModal>
  );
}

export function EditDialog({
  milestone,
  choices,
  busy,
  saveError,
  onClose,
  onSave,
}: {
  milestone: MilestoneRoadmapView;
  choices: ResourceChoice[];
  busy: boolean;
  saveError: string | null;
  onClose: () => void;
  onSave: (fields: { name: string; objective: string; goals: string[]; resourceIds: string[] }) => void;
}) {
  const [name, setName] = useState(milestone.name);
  const [objective, setObjective] = useState(milestone.objective);
  const [goals, setGoals] = useState(milestone.goals.join('\n'));
  const [resourceIds, setResourceIds] = useState(milestone.resources.map((resource) => resource.id));
  const [fieldErrors, setFieldErrors] = useState<MilestoneFieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const objectiveRef = useRef<HTMLTextAreaElement>(null);
  const goalsRef = useRef<HTMLTextAreaElement>(null);
  const phone = useMaxWidth(767);
  return (
    <>
    <PortalModal
      testId="milestone-edit-dialog"
      label="Edit all details"
      onClose={onClose}
      narrow={phone}
      sheet="bottom"
      width={760}
      header="default"
      blueFocus
      hidden={attachOpen}
      panelStyle={{ padding: '8px 24px 16px' }}
      footer={
        <div className="flex flex-wrap gap-2">
          <OutlineButton disabled={busy} onClick={onClose}>
            Cancel
          </OutlineButton>
          <PrimaryButton type="submit" form="milestone-edit-form" disabled={busy}>
            Save milestone
          </PrimaryButton>
        </div>
      }
    >
      <form
        id="milestone-edit-form"
        data-testid="milestone-edit-form"
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          const nextGoals = goals.split('\n').map((line) => line.trim()).filter(Boolean);
          const errors = milestoneFieldErrors(name, objective, goals);
          setFieldErrors(errors);
          const first = firstInvalidField(errors);
          if (first) {
            setError('Enter the missing fields. Nothing was saved.');
            focusField(first, { name: nameRef, objective: objectiveRef, goals: goalsRef });
            return;
          }
          setError(null);
          onSave({ name, objective, goals: nextGoals, resourceIds });
        }}
      >
        <FormFields
          name={name}
          objective={objective}
          goals={goals}
          resourceIds={resourceIds}
          choices={choices}
          fieldErrors={fieldErrors}
          nameRef={nameRef}
          objectiveRef={objectiveRef}
          goalsRef={goalsRef}
          onName={setName}
          onObjective={setObjective}
          onGoals={setGoals}
          onOpenAttach={() => setAttachOpen(true)}
        />
        {error ? <FormAlert>{error}</FormAlert> : null}
        {saveError ? <FormAlert>{saveError}</FormAlert> : null}
      </form>
    </PortalModal>
    {attachOpen ? (
      <AttachResourcesModal
        choices={choices}
        resourceIds={resourceIds}
        phone={phone}
        onChange={setResourceIds}
        onClose={() => setAttachOpen(false)}
      />
    ) : null}
    </>
  );
}

function createDialogBounds(anchor: HTMLElement): { top: number; right: number; bottom: number; left: number } {
  const dialog = anchor.closest('[role="dialog"]');
  const dialogRect = dialog?.getBoundingClientRect();
  const header = dialog?.querySelector('[data-modal-header]');
  const footer = dialog?.querySelector('[data-testid="portal-modal-footer"]');
  const top = header ? header.getBoundingClientRect().bottom : (dialogRect?.top ?? 0);
  const bottom = footer ? footer.getBoundingClientRect().top : (dialogRect?.bottom ?? window.innerHeight);
  return {
    top,
    right: dialogRect?.right ?? window.innerWidth,
    bottom,
    left: dialogRect?.left ?? 0,
  };
}

/** Desktop owner and due menus. Portaled so the dialog footer cannot cover them. */
export function FieldMenu({
  anchorRef,
  onClose,
  children,
}: {
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  children: ReactNode;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [host, setHost] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    setHost(document.body);
  }, []);
  useLayoutEffect(() => {
    const menu = menuRef.current;
    const anchor = anchorRef.current;
    if (!menu || !anchor || !host || typeof anchor.getBoundingClientRect !== 'function') return;
    const place = () => {
      const rect = anchor.getBoundingClientRect();
      const box = anchoredMenuBox({
        anchor: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right },
        menu: { width: rect.width, height: menu.offsetHeight },
        bounds: createDialogBounds(anchor),
        align: 'left',
      });
      menu.style.position = 'fixed';
      menu.style.top = `${box.top}px`;
      menu.style.left = `${box.left}px`;
      menu.style.width = `${rect.width}px`;
      menu.style.zIndex = '90';
      menu.dataset.placement = box.placement;
    };
    place();
    menu.querySelector<HTMLElement>('[data-menu-initial-focus]')?.focus({ preventScroll: true });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place);
    observer?.observe(menu);
    window.addEventListener('resize', place);
    const scroll = anchor.closest('[data-portal-modal-body]');
    scroll?.addEventListener('scroll', place);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', place);
      scroll?.removeEventListener('scroll', place);
    };
  }, [anchorRef, host]);
  useEffect(() => {
    if (!host) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (menuRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onCloseRef.current();
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [anchorRef, host]);
  useEffect(() => {
    const anchor = anchorRef.current;
    return () => {
      const target = returnFocus.current ?? anchor;
      target?.focus({ preventScroll: true });
      window.requestAnimationFrame(() => target?.focus({ preventScroll: true }));
    };
  }, [anchorRef]);
  if (!host) return null;
  return createPortal(
    <div
      ref={menuRef}
      className="ds-scope"
      data-testid="milestone-field-menu"
      data-menu-layer=""
      style={{ background: 'transparent' }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          returnFocus.current = anchorRef.current;
          onCloseRef.current();
          return;
        }
        if (event.key === 'Tab') {
          event.preventDefault();
          event.stopPropagation();
          const anchor = anchorRef.current;
          returnFocus.current = anchor ? nextDialogFocus(anchor, event.shiftKey) : null;
          onCloseRef.current();
          return;
        }
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        const items = menuButtons(menuRef.current);
        const index = items.indexOf(document.activeElement as HTMLElement);
        if (index < 0 || items.length === 0) return;
        event.preventDefault();
        const next = event.key === 'ArrowDown' ? index + 1 : index - 1;
        items[(next + items.length) % items.length]?.focus({ preventScroll: true });
      }}
    >
      {children}
    </div>,
    host,
  );
}

export function CreateMilestone({
  projectId,
  fixtures,
  hostSlug,
  resourceChoices,
  onClose,
  onFixture,
}: {
  projectId: Id<'projects'>;
  fixtures: boolean;
  hostSlug?: string;
  resourceChoices: ResourceChoice[];
  onClose: () => void;
  onFixture: (milestone: MilestoneRoadmapView) => void;
}) {
  const create = useMutation(api.milestones.create);
  const ownerQuery = useSafeQuery<OwnerChoice[]>(
    api.milestones.ownerChoices,
    fixtures ? 'skip' : { projectId, hostSlug },
  );
  const people = fixtures ? fixtureOwnerChoices(projectId) : (ownerQuery.data ?? []);
  const [name, setName] = useState('');
  const [objective, setObjective] = useState('');
  const [goals, setGoals] = useState('');
  const [resourceIds, setResourceIds] = useState<string[]>([]);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [layer, setLayer] = useState<'form' | 'attach' | 'owner' | 'due'>('form');
  const [fieldErrors, setFieldErrors] = useState<MilestoneFieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const objectiveRef = useRef<HTMLTextAreaElement>(null);
  const goalsRef = useRef<HTMLTextAreaElement>(null);
  const ownerAnchor = useRef<HTMLButtonElement>(null);
  const dueAnchor = useRef<HTMLButtonElement>(null);
  const phone = useMaxWidth(767);
  const ownerName = ownerId ? people.find((person) => person.id === ownerId)?.name ?? null : null;
  const menuSwapped = layer === 'attach' || (phone && (layer === 'owner' || layer === 'due'));
  const picker = (kind: 'owner' | 'due') => (
    kind === 'owner' ? (
      <OwnerMenu
        people={people}
        currentId={ownerId}
        sheet={phone}
        foot="Saved when you create the milestone."
        onPick={(id) => {
          setOwnerId(id);
          setLayer('form');
        }}
        onClose={() => setLayer('form')}
      />
    ) : (
      <DueDateMenu
        value={dueDate}
        sheet={phone}
        foot="Saved when you create the milestone."
        onPick={(next) => {
          setDueDate(next);
          setLayer('form');
        }}
        onClose={() => setLayer('form')}
      />
    )
  );
  return (
    <>
    <PortalModal
      testId="milestone-create-dialog"
      label="New milestone"
      onClose={onClose}
      narrow={phone}
      sheet="bottom"
      width={760}
      header="default"
      blueFocus
      hidden={menuSwapped}
      panelStyle={{ padding: '8px 24px 16px' }}
      footer={
        <div className="flex flex-wrap gap-2">
          <OutlineButton disabled={busy} onClick={onClose}>
            Cancel
          </OutlineButton>
          <PrimaryButton type="submit" form="milestone-create" disabled={busy}>
            Create milestone
          </PrimaryButton>
        </div>
      }
    >
      <form
        id="milestone-create"
        data-testid="milestone-create"
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          const nextGoals = goals.split('\n').map((line) => line.trim()).filter(Boolean);
          const errors = milestoneFieldErrors(name, objective, goals);
          setFieldErrors(errors);
          const first = firstInvalidField(errors);
          if (first) {
            setError('Enter the missing fields. Nothing was saved.');
            focusField(first, { name: nameRef, objective: objectiveRef, goals: goalsRef });
            return;
          }
          setError(null);
          if (fixtures) {
            onFixture({
              id: `m-local-${createdStamp()}`,
              name: name.trim(),
              objective: objective.trim(),
              goals: nextGoals,
              status: 'Planning',
              approval: 'unreviewed',
              note: null,
              approverName: null,
              decidedAt: null,
              publishToWarehaus: false,
              resources: resourceIds
                .map((id) => resourceChoices.find((choice) => choice.id === id))
                .filter((choice): choice is ResourceChoice => choice != null)
                .map((choice) => ({ id: choice.id, title: choice.title, url: null })),
              openCount: 0,
              doneCount: 0,
              countIsDecision: false,
              rows: [],
              ownerContactId: ownerId,
              ownerName,
              dueDate,
              creatorName: people[0]?.name ?? null,
            });
            onClose();
            return;
          }
          setBusy(true);
          setError(null);
          void create({
            hostSlug,
            projectId,
            name,
            objective,
            goals: nextGoals,
            ...(resourceIds.length > 0 ? { resourceIds: resourceIds as Id<'sharedResources'>[] } : {}),
            ...(ownerId ? { ownerContactId: ownerId as Id<'contacts'> } : {}),
            ...(dueDate ? { dueDate } : {}),
          })
            .then(() => onClose())
            .catch((err: unknown) => {
              setError(userFacingErrorMessage(err, 'Could not create the milestone.'));
            })
            .finally(() => setBusy(false));
        }}
      >
        <p style={{ fontSize: 14, lineHeight: '21px', color: 'var(--muted)' }}>
          Describe the outcome. Tasks are added on the milestone.
        </p>
        <FormFields
          name={name}
          objective={objective}
          goals={goals}
          resourceIds={resourceIds}
          choices={resourceChoices}
          fieldErrors={fieldErrors}
          nameRef={nameRef}
          objectiveRef={objectiveRef}
          goalsRef={goalsRef}
          onName={setName}
          onObjective={setObjective}
          onGoals={setGoals}
          onOpenAttach={() => setLayer('attach')}
          plan={
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="relative flex flex-col gap-2">
                <span style={{ fontSize: 14 }}>Owner</span>
                <button
                  ref={ownerAnchor}
                  type="button"
                  data-testid="milestone-create-owner"
                  className="milestone-field milestone-picker text-left"
                  data-open={layer === 'owner' ? 'true' : 'false'}
                  onClick={() => setLayer(layer === 'owner' ? 'form' : 'owner')}
                  style={pickerFieldStyle}
                >
                  {ownerName ?? 'Choose a person'}
                </button>
                {layer === 'owner' && !phone ? <FieldMenu anchorRef={ownerAnchor} onClose={() => setLayer('form')}>{picker('owner')}</FieldMenu> : null}
              </div>
              <div className="relative flex flex-col gap-2">
                <span style={{ fontSize: 14 }}>Due date</span>
                <button
                  ref={dueAnchor}
                  type="button"
                  data-testid="milestone-create-due"
                  className="milestone-field milestone-picker text-left"
                  data-open={layer === 'due' ? 'true' : 'false'}
                  onClick={() => setLayer(layer === 'due' ? 'form' : 'due')}
                  style={pickerFieldStyle}
                >
                  {formatDueDate(dueDate) ?? 'Choose a date'}
                </button>
                {layer === 'due' && !phone ? <FieldMenu anchorRef={dueAnchor} onClose={() => setLayer('form')}>{picker('due')}</FieldMenu> : null}
              </div>
            </div>
          }
        />
        <p
          style={{
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: 16,
            fontSize: 13,
            lineHeight: '20px',
            color: 'var(--muted)',
          }}
        >
          The milestone is saved first. Its tasks are added on the milestone.
        </p>
        {error ? <FormAlert>{error}</FormAlert> : null}
      </form>
    </PortalModal>
    {layer === 'attach' ? (
      <AttachResourcesModal
        choices={resourceChoices}
        resourceIds={resourceIds}
        phone={phone}
        onChange={setResourceIds}
        onClose={() => setLayer('form')}
      />
    ) : null}
    {phone && layer === 'owner' ? (
      <PortalModal testId="milestone-create-owner-sheet" label="Owner" onClose={() => setLayer('form')} narrow sheet="bottom" width={390} blueFocus>
        {picker('owner')}
      </PortalModal>
    ) : null}
    {phone && layer === 'due' ? (
      <PortalModal testId="milestone-create-due-sheet" label="Due date" onClose={() => setLayer('form')} narrow sheet="bottom" width={390} blueFocus>
        {picker('due')}
      </PortalModal>
    ) : null}
    </>
  );
}

type MilestoneFieldErrors = { name?: string; objective?: string; goals?: string };

type MilestoneField = keyof MilestoneFieldErrors;

function milestoneFieldErrors(name: string, objective: string, goals: string): MilestoneFieldErrors {
  const errors: MilestoneFieldErrors = {};
  if (!name.trim()) errors.name = 'Enter a milestone name.';
  if (!objective.trim()) errors.objective = 'Enter the brief.';
  if (!goals.split('\n').some((line) => line.trim())) errors.goals = 'Enter at least one completion line.';
  return errors;
}

function firstInvalidField(errors: MilestoneFieldErrors): MilestoneField | null {
  if (errors.name) return 'name';
  if (errors.objective) return 'objective';
  if (errors.goals) return 'goals';
  return null;
}

function focusField(
  field: MilestoneField,
  refs: {
    name: RefObject<HTMLInputElement | null>;
    objective: RefObject<HTMLTextAreaElement | null>;
    goals: RefObject<HTMLTextAreaElement | null>;
  },
) {
  const node = refs[field].current;
  node?.focus();
  node?.scrollIntoView({ block: 'nearest' });
}

function FormAlert({ children }: { children: string }) {
  return (
    <p data-testid="milestone-error" role="alert" style={{ margin: 0, fontSize: 13, lineHeight: '18px', color: 'var(--danger-text)' }}>
      {children}
    </p>
  );
}

function FieldError({ id, children }: { id: string; children: string }) {
  return (
    <span id={id} role="alert" style={{ fontSize: 13, lineHeight: '18px', color: 'var(--danger-text)' }}>
      {children}
    </span>
  );
}

function FormFields({
  name,
  objective,
  goals,
  resourceIds,
  choices,
  fieldErrors,
  nameRef,
  objectiveRef,
  goalsRef,
  onName,
  onObjective,
  onGoals,
  onOpenAttach,
  plan,
}: {
  name: string;
  objective: string;
  goals: string;
  resourceIds: string[];
  choices: ResourceChoice[];
  fieldErrors: MilestoneFieldErrors;
  nameRef: RefObject<HTMLInputElement | null>;
  objectiveRef: RefObject<HTMLTextAreaElement | null>;
  goalsRef: RefObject<HTMLTextAreaElement | null>;
  onName: (value: string) => void;
  onObjective: (value: string) => void;
  onGoals: (value: string) => void;
  onOpenAttach: () => void;
  plan?: ReactNode;
}) {
  return (
    <>
      <label className="flex flex-col gap-2">
        <span style={{ fontSize: 14 }}>Milestone name *</span>
        <input
          ref={nameRef}
          value={name}
          aria-invalid={fieldErrors.name ? true : undefined}
          aria-describedby={fieldErrors.name ? 'milestone-name-error' : undefined}
          onChange={(event) => onName(event.target.value)}
          className="milestone-field"
          style={fieldStyle}
        />
        {fieldErrors.name ? <FieldError id="milestone-name-error">{fieldErrors.name}</FieldError> : null}
      </label>
      <label className="flex flex-col gap-2">
        <span style={{ fontSize: 14 }}>Brief *</span>
        <textarea
          ref={objectiveRef}
          value={objective}
          aria-invalid={fieldErrors.objective ? true : undefined}
          aria-describedby={fieldErrors.objective ? 'milestone-brief-error' : undefined}
          onChange={(event) => onObjective(event.target.value)}
          rows={2}
          className="milestone-field"
          placeholder="What should be delivered, and what needs to happen?"
          style={{ ...fieldStyle, resize: 'vertical' }}
        />
        {fieldErrors.objective ? <FieldError id="milestone-brief-error">{fieldErrors.objective}</FieldError> : null}
      </label>
      <label className="flex flex-col gap-2">
        <span style={{ fontSize: 14 }}>Done when *</span>
        <textarea
          ref={goalsRef}
          value={goals}
          aria-invalid={fieldErrors.goals ? true : undefined}
          aria-describedby={fieldErrors.goals ? 'milestone-goals-error' : undefined}
          onChange={(event) => onGoals(event.target.value)}
          rows={2}
          className="milestone-field"
          placeholder="Describe the acceptance criteria for this milestone."
          style={{ ...fieldStyle, resize: 'vertical' }}
        />
        {fieldErrors.goals ? <FieldError id="milestone-goals-error">{fieldErrors.goals}</FieldError> : null}
      </label>
      {plan}
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <FieldLabel>RESOURCES</FieldLabel>
          <p data-testid="milestone-resource-count" aria-live="polite" style={{ margin: '4px 0 0', fontSize: 14, lineHeight: '21px' }}>
            {resourceSummary(resourceIds, choices)}
          </p>
        </div>
        <OutlineButton testId="milestone-attach-resources" onClick={onOpenAttach}>
          Attach resources
        </OutlineButton>
      </div>
    </>
  );
}
