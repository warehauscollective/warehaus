'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation } from 'convex/react';
import { userFacingErrorMessage } from '@convex/_lib/userFacingError';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { TASK_UNAVAILABLE, taskDescriptionEditMode, type TaskLinkKind } from '@warehaus/portal-sync';
import { PortalModal, PortalModalStack } from '@/components/ui/PortalModal';
import { CLOSE_TASK_FOR_SEARCH, TASK_DIALOG_MAX_HEIGHT } from '@/lib/nav/dockLayer';
import { DueDateMenu, FieldError, OwnerMenu, Popover, ProjectMenu, type MoveTarget, type OwnerChoice } from '@/components/projects/milestoneDetailsEdit';
import { OutlineButton, Pill, PortalCheckbox, PrimaryButton, StatusBadge } from '@/components/ui/primitives';
import { useSafeQuery } from '@/hooks/useSafeQuery';
import { LIVE_TASK_STATUSES, formatPortalDate, taskStatusColor, type PortalTask } from '@/lib/data/view-models';
import { displayedTaskStatus } from '@/lib/data/taskStatus';
import { AttachedResourceRow, resourceKind } from './AttachedResourceRow';
import { TaskGlyph } from './TaskGlyph';
import { AddSourceForm, TaskSources } from './TaskSources';
import { projectMoveCopy, taskChangeNote } from './taskFieldCopy';
import { taskCloseoutState } from '@convex/_lib/closeout';
import { useTaskCloseoutActions } from '@/components/closeout/closeoutActions';
import {
  ARCHIVE_BODY,
  ARCHIVE_TASK_TITLE,
  CLOSEOUT_SAVE_ERROR,
  MENU_ARCHIVE,
  TOAST_TASK_ARCHIVED,
  TOAST_TASK_DONE,
  TOAST_TASK_RESTORED,
} from '@/components/closeout/closeoutCopy';
import { CloseoutToastHost, showCloseoutToast } from '@/components/closeout/closeoutToast';
import { OverflowMenu, OverflowSheet, OverflowSheetItems, type OverflowAction } from '@/components/closeout/OverflowMenu';
import { beginFieldSave, FIELD_SAVE_ERROR, finishFieldSave, idleField, retryFieldSave, type FieldAttempt } from './taskFieldSave';
import type { TaskSourceLink } from './sourcePanelFixtures';
import { TASK_KIND_LABELS, TASK_KINDS, taskKind, type TaskKind } from '@convex/_lib/designGate';

function ReviewTag() {
  return (
    <span data-testid="review-tag" className="ds-mono" style={{ border: '1px solid var(--border-2)', borderRadius: 999, padding: '2px 8px', fontSize: 12, lineHeight: '18px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
      From review
    </span>
  );
}

/** One sheet at a time. A confirm or phone menu replaces the task sheet. Cancel clears it. */
export function taskSheetOpen(input: {
  attach: boolean;
  archive?: boolean;
  project?: boolean;
  menu?: boolean;
}): { detail: boolean; attach: boolean; archive: boolean; project: boolean; menu: boolean } {
  const archive = Boolean(input.archive);
  const project = Boolean(input.project) && !archive;
  const menu = Boolean(input.menu) && !archive && !project;
  const attach = input.attach && !archive && !project && !menu;
  return {
    detail: !attach && !archive && !project && !menu,
    attach,
    archive,
    project,
    menu,
  };
}

type ResourceRow = {
  id: string;
  name: string;
  type: string | null;
  notionPageId?: string | null;
  publishToWarehaus?: boolean;
  projectId?: string | null;
  updatedAt?: number | null;
  lastSyncedAt?: number | null;
  attachedCount?: number | null;
};

export function TaskDetailModal({
  task,
  staff,
  phone,
  subtasks,
  resources,
  unavailable,
  onClose,
  onOpenTask,
  closeLabel = 'Back to board',
  projectResources,
  clientName = null,
  hostSlug,
  live = false,
  initialArchive = false,
  initialMenu = null,
  initialFieldError = null,
  initialSourceError = null,
  people = [],
  projects = [],
  onArchived,
}: {
  task: PortalTask | null;
  staff: boolean;
  phone: boolean;
  subtasks: PortalTask[];
  resources: ResourceRow[];
  unavailable: boolean;
  onClose: () => void;
  onOpenTask: (id: string) => void;
  /** Board opens say "Back to board". A row from another page names that page. */
  closeLabel?: string;
  projectResources: ResourceRow[];
  clientName?: string | null;
  hostSlug?: string;
  /** Convex task id. Fixture rows skip the timeline query. */
  live?: boolean;
  /** Fixture preview opens the archive confirm without a tap. */
  initialArchive?: boolean;
  /** Fixture preview opens one field menu or the add-source form. */
  initialMenu?: 'assignee' | 'due' | 'project' | 'add-source' | null;
  /** Fixture preview shows a failed save under one field. */
  initialFieldError?: 'assignee' | 'due' | 'project' | null;
  /** Fixture preview shows the add-source form with this error. */
  initialSourceError?: string | null;
  /** Fixture staff. Live rows load choices when a menu opens. */
  people?: readonly OwnerChoice[];
  projects?: readonly MoveTarget[];
  /** Fixture board hides these tasks after archive. */
  onArchived?: (ids: string[]) => void;
}) {
  const [attach, setAttach] = useState(false);
  const [asideNote, setAsideNote] = useState<string | null>(null);
  const moveStatus = useMutation(api.tasks.moveStatus);
  const setTaskKind = useMutation(api.milestones.setTaskKind);
  const setAssignee = useMutation(api.tasks.setAssignee);
  const setDueDate = useMutation(api.tasks.setDueDate);
  const moveTaskProject = useMutation(api.tasks.moveProject);
  const addLink = useMutation(api.tasks.addLink);
  const removeLink = useMutation(api.tasks.removeLink);
  const taskCloseoutFor = useTaskCloseoutActions(hostSlug);
  // The header "…" menu. On a phone it is a sheet that takes the task sheet's place.
  const [overflowOpen, setOverflowOpen] = useState(false);
  const shownStatus = task ? displayedTaskStatus(task.status, task.stage) : '';
  const [kindDraft, setKindDraft] = useState<{ id: string; kind: TaskKind } | null>(null);
  const [kindError, setKindError] = useState<string | null>(null);
  const shownKind: TaskKind = kindDraft && kindDraft.id === task?.id ? kindDraft.kind : taskKind(task ?? {});
  const pickKind = (kind: TaskKind) => {
    if (!task || kind === shownKind) return;
    setKindDraft({ id: task.id, kind });
    setKindError(null);
    if (!live) return;
    void setTaskKind({ hostSlug, taskId: task.id as Id<'tasks'>, kind }).catch((err) => {
      setKindDraft(null);
      setKindError(userFacingErrorMessage(err, 'Couldn’t change the kind. Nothing changed. Try again.'));
    });
  };
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!attach) titleRef.current?.focus();
  }, [task?.id, unavailable, attach]);
  type FieldMenu = 'assignee' | 'due' | 'project' | 'add-source';
  const [fieldMenu, setFieldMenu] = useState<FieldMenu | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(initialArchive);
  const [projectTarget, setProjectTarget] = useState<MoveTarget | null>(null);
  const [projectQuery, setProjectQuery] = useState('');
  const [fieldBusy, setFieldBusy] = useState(false);
  const [sourceError, setSourceError] = useState<string | null>(initialSourceError);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [assigneeSlot, setAssigneeSlot] = useState<FieldAttempt<{ id: string | null; name: string | null }>>(idleField);
  const [dueSlot, setDueSlot] = useState<FieldAttempt<string | null>>(idleField);
  const [projectSlot, setProjectSlot] = useState<FieldAttempt<MoveTarget>>(idleField);
  const [extraLinks, setExtraLinks] = useState<TaskSourceLink[]>([]);
  const [removedLinkIds, setRemovedLinkIds] = useState<string[]>([]);
  useEffect(() => {
    const failed = <T,>(field: 'assignee' | 'due' | 'project'): FieldAttempt<T> =>
      initialFieldError === field ? { draft: undefined, error: FIELD_SAVE_ERROR, pending: undefined } : idleField<T>();
    setAssigneeSlot(failed('assignee'));
    setDueSlot(failed('due'));
    setProjectSlot(failed('project'));
    setExtraLinks([]);
    setRemovedLinkIds([]);
    setFieldMenu(initialMenu);
    setSourceError(initialSourceError);
    setArchiveError(null);
    setArchiveOpen(initialArchive);
    setProjectTarget(null);
  }, [task?.id, initialArchive, initialMenu, initialFieldError, initialSourceError]);
  const phoneMenu = phone && fieldMenu != null && !archiveOpen && !projectTarget;
  const sheets = taskSheetOpen({
    attach,
    archive: archiveOpen || (phone && overflowOpen),
    project: Boolean(projectTarget),
    menu: phoneMenu,
  });
  const closeFieldMenu = () => {
    setFieldMenu(null);
    setSourceError(null);
  };
  const assigneeRows = useSafeQuery<OwnerChoice[]>(
    api.tasks.assigneeChoices,
    live && staff && fieldMenu === 'assignee' && task?.orgId
      ? { hostSlug, orgId: task.orgId as Id<'clients'> }
      : 'skip',
  );
  const projectRows = useSafeQuery<{ projects: MoveTarget[]; continueCursor: string | null; isDone: boolean }>(
    api.milestones.listMoveTargets,
    live && staff && (fieldMenu === 'project' || projectTarget) && task?.projectId
      ? { hostSlug, projectId: task.projectId as Id<'projects'> }
      : 'skip',
  );
  const peopleChoices = live ? assigneeRows.data ?? [] : people;
  const projectChoices = (live ? projectRows.data?.projects ?? [] : projects).filter(
    (item) => item.id !== (projectSlot.draft?.id ?? task?.projectId),
  );
  const visibleProjects = projectChoices.filter((item) => item.name.toLowerCase().includes(projectQuery.trim().toLowerCase()));
  const shownAssignee = assigneeSlot.draft !== undefined ? assigneeSlot.draft.name : task?.assigneeName ?? null;
  const shownAssigneeId = assigneeSlot.draft !== undefined ? assigneeSlot.draft.id : task?.assigneeContactId ?? null;
  const shownDate = dueSlot.draft !== undefined ? dueSlot.draft : task?.date ?? null;
  const shownProject = projectSlot.draft?.name ?? task?.projectName ?? '—';
  const saveAssignee = (pending: { id: string | null; name: string | null }) => {
    setAssigneeSlot(beginFieldSave(pending));
    setFieldMenu(null);
    if (!live || !task) return;
    void setAssignee({ hostSlug, taskId: task.id as Id<'tasks'>, assigneeContactId: pending.id as Id<'contacts'> | null })
      .then((result) => {
        setAssigneeSlot((current) => {
          const next = finishFieldSave(current, result.ok);
          return result.ok ? { ...next, draft: { id: pending.id, name: result.assigneeName } } : next;
        });
      })
      .catch(() => setAssigneeSlot((current) => finishFieldSave(current, false)));
  };
  const saveDue = (pending: string | null) => {
    setDueSlot(beginFieldSave(pending));
    setFieldMenu(null);
    if (!live || !task) return;
    void setDueDate({ hostSlug, taskId: task.id as Id<'tasks'>, date: pending })
      .then((result) => {
        setDueSlot((current) => finishFieldSave(current, result.ok));
        const note = taskChangeNote(result);
        if (note) setAsideNote(note);
      })
      .catch(() => setDueSlot((current) => finishFieldSave(current, false)));
  };
  const saveProject = (pending: MoveTarget) => {
    setProjectSlot(beginFieldSave(pending));
    setProjectTarget(null);
    if (!live || !task) return;
    setFieldBusy(true);
    void moveTaskProject({ hostSlug, taskId: task.id as Id<'tasks'>, projectId: pending.id as Id<'projects'> })
      .then((result) => setProjectSlot((current) => finishFieldSave(current, result.ok)))
      .catch(() => setProjectSlot((current) => finishFieldSave(current, false)))
      .finally(() => setFieldBusy(false));
  };
  const pickAssignee = (id: string | null) => {
    const person = peopleChoices.find((item) => item.id === id) ?? null;
    saveAssignee({ id, name: person?.name ?? null });
  };
  const pickDate = saveDue;
  const submitSource = (input: { kind: TaskLinkKind; url: string; title: string }) => {
    const url = input.url.trim();
    if (!url || !task) return;
    const local: TaskSourceLink = {
      id: `local-${Date.now()}`,
      kind: input.kind,
      url,
      title: input.title.trim() || null,
      addedBy: 'staff',
      createdAt: Date.now(),
      state: null,
    };
    if (!live) {
      setExtraLinks((rows) => [...rows, local]);
      closeFieldMenu();
      return;
    }
    setFieldBusy(true);
    void addLink({ hostSlug, taskId: task.id as Id<'tasks'>, kind: input.kind, url, title: input.title.trim() || undefined })
      .then((result) => {
        if (!result.ok) {
          setSourceError(result.error ?? null);
          return;
        }
        setSourceError(null);
        setExtraLinks((rows) => [...rows, { ...local, id: result.id ?? local.id }]);
        closeFieldMenu();
      })
      .finally(() => setFieldBusy(false));
  };
  const dropSource = (id: string) => {
    setRemovedLinkIds((rows) => (rows.includes(id) ? rows : [...rows, id]));
    if (!live || !task || id.startsWith('local-')) return;
    void removeLink({ hostSlug, taskId: task.id as Id<'tasks'>, linkId: id as Id<'taskLinks'> }).then((result) => {
      if (!result.ok) {
        setRemovedLinkIds((rows) => rows.filter((item) => item !== id));
        setAsideNote(result.error);
      }
    });
  };
  const confirmArchive = () => {
    if (!task) return;
    if (!live) {
      onArchived?.([task.id, ...subtasks.map((child) => child.id)]);
      showCloseoutToast({ kind: 'archived', message: TOAST_TASK_ARCHIVED, undo: async () => onArchived?.([]) });
      onClose();
      return;
    }
    setFieldBusy(true);
    setArchiveError(null);
    void taskCloseoutFor(task.id)
      .archive()
      .then((undo) => {
        // The toast lives outside this dialog, so Undo is still there after it closes.
        showCloseoutToast({ kind: 'archived', message: TOAST_TASK_ARCHIVED, undo });
        onClose();
      })
      .catch((err) => setArchiveError(userFacingErrorMessage(err, CLOSEOUT_SAVE_ERROR)))
      .finally(() => setFieldBusy(false));
  };
  /** Mark complete sets Done with no confirm. Archive opens the same confirm as the aside link. */
  const onOverflow = (action: OverflowAction) => {
    setOverflowOpen(false);
    if (!task) return;
    if (action === 'archive') {
      setArchiveOpen(true);
      return;
    }
    const toast =
      action === 'complete'
        ? ({ kind: 'done', message: TOAST_TASK_DONE } as const)
        : ({ kind: 'restored', message: TOAST_TASK_RESTORED } as const);
    if (!live) {
      showCloseoutToast(toast);
      return;
    }
    const actions = taskCloseoutFor(task.id);
    void (action === 'complete' ? actions.markDone() : actions.restore())
      .then((undo) => showCloseoutToast({ ...toast, undo }))
      .catch((err) => showCloseoutToast({ kind: 'error', message: userFacingErrorMessage(err, CLOSEOUT_SAVE_ERROR) }));
  };
  const [replacedBySearch, setReplacedBySearch] = useState(false);
  useEffect(() => {
    const onSwap = () => setReplacedBySearch(true);
    window.addEventListener(CLOSE_TASK_FOR_SEARCH, onSwap);
    return () => window.removeEventListener(CLOSE_TASK_FOR_SEARCH, onSwap);
  }, []);

  const detail = (
    <>
      {unavailable || !task ? (
        <div className="flex flex-col items-start gap-3">
          <h2 ref={titleRef} tabIndex={-1} style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--t-lg)' }}>
            {TASK_UNAVAILABLE}
          </h2>
          <p style={{ color: 'var(--muted)', fontSize: 'var(--t-sm)' }}>
            This task is not available.
          </p>
          <OutlineButton onClick={onClose}>{closeLabel}</OutlineButton>
        </div>
      ) : (
        <>
        <div data-testid="task-sheet-chrome" className={phone ? 'task-sheet-chrome flex min-w-0 items-center gap-3' : 'mb-4 flex min-w-0 items-center gap-3'}>
          <p data-testid="task-breadcrumb" className="min-w-0 flex-1 truncate" style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
            {shownProject === '—' ? task.projectName ?? 'Project' : shownProject}
            <span> / </span>
            <span style={{ color: 'var(--fg)' }}>{task.name}</span>
          </p>
          {task.source === 'portal-review' ? <ReviewTag /> : null}
          <button
            type="button"
            data-testid="task-copy-link"
            className="shrink-0"
            onClick={() => {
              void navigator.clipboard?.writeText(window.location.href);
            }}
            style={{ background: 'none', border: 0, color: 'var(--muted)', cursor: 'pointer', fontSize: 13 }}
          >
            Copy link
          </button>
          <button
            type="button"
            onClick={onClose}
            data-testid="task-back"
            className="ds-mono"
            style={{ background: 'none', border: 0, color: 'var(--muted)', cursor: 'pointer', fontSize: 13 }}
          >
            {closeLabel}
          </button>
          {staff ? (
            <OverflowMenu
              target="task"
              state={taskCloseoutState({ status: task.status, isDone: task.isDone })}
              label={task.name}
              open={overflowOpen}
              onOpenChange={setOverflowOpen}
              renderSheet={false}
              onAction={onOverflow}
              testId="task-overflow"
            />
          ) : null}
          {phone ? null : (
            <span data-testid="task-esc-hint" className="ds-mono" style={{ fontSize: 11, color: 'var(--faint)' }}>Esc</span>
          )}
          <button type="button" aria-label="Close" onClick={onClose} style={{ background: 'none', border: 0, color: 'var(--fg)', cursor: 'pointer' }}>✕</button>
        </div>
        <div className={phone ? 'task-sheet-scroll' : undefined} data-testid={phone ? 'task-sheet-scroll' : undefined}>
        <div className={phone ? 'flex flex-col' : 'grid gap-8'} style={phone ? { gap: 24 } : { gridTemplateColumns: 'minmax(0, 1fr) 296px' }}>
          <div className={phone ? undefined : 'flex min-w-0 flex-col gap-4'} style={phone ? { display: 'contents' } : undefined}>
            <h2 ref={titleRef} tabIndex={-1} style={{ fontFamily: 'var(--font-display)', fontSize: phone ? 20 : 28, lineHeight: phone ? '30px' : undefined, outline: 'none', order: phone ? 2 : undefined }}>
              {task.name}
            </h2>
            <div style={{ order: phone ? 5 : undefined }}>
              <TaskDescription task={task} staff={staff} hostSlug={hostSlug} live={live} />
            </div>
            <div style={{ order: phone ? 8 : undefined }}>
              <TaskTimeline task={task} staff={staff} hostSlug={hostSlug} live={live} />
            </div>
            <section style={{ order: phone ? 6 : undefined }}>
              <h3 className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>SUB-TASKS</h3>
              {subtasks.length === 0 ? (
                <p style={{ color: 'var(--muted)', fontSize: 'var(--t-sm)', marginTop: 8 }}>No sub-tasks yet.</p>
              ) : (
                <ul className="mt-2 flex flex-col">
                  {subtasks.map((child) => (
                    <li key={child.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <button
                        type="button"
                        onClick={() => onOpenTask(child.id)}
                        className="flex w-full items-center gap-3 text-left"
                        style={{ background: 'transparent', border: 0, padding: '16px 0', color: 'inherit', cursor: 'pointer' }}
                      >
                        <span style={{ color: 'var(--muted)' }}>
                          <TaskGlyph src={child.isDone ? '/icons/task-check.svg' : '/icons/task-check-open.svg'} size={20} />
                        </span>
                        <span style={{ flex: '1 1 auto', minWidth: 0, fontWeight: 400, fontSize: 15 }}>{child.name}</span>
                        <span className="inline-flex shrink-0 items-center gap-3">
                          {displayedTaskStatus(child.status, child.stage) === 'In review' ? (
                            <StatusBadge>In review</StatusBadge>
                          ) : (
                            <Pill color={taskStatusColor(displayedTaskStatus(child.status, child.stage), child.isDone)}>{displayedTaskStatus(child.status, child.stage)}</Pill>
                          )}
                          {child.category ? (
                            <span className="ds-mono" style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{child.category}</span>
                          ) : null}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {staff ? (
                <button
                  type="button"
                  className="mt-3 flex w-full items-center gap-2 text-left"
                  style={{ border: '1px dashed var(--border)', borderRadius: 18, padding: '10px 12px', color: 'var(--muted)', background: 'transparent' }}
                >
                  + Add sub-task
                </button>
              ) : null}
            </section>
            <section style={{ order: phone ? 7 : undefined }}>
              <div className="flex items-center justify-between gap-2">
                <h3 className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>RESOURCES</h3>
                {staff ? (
                  <OutlineButton onClick={() => setAttach(true)}>Attach</OutlineButton>
                ) : null}
              </div>
              {resources.length === 0 ? (
                <p style={{ color: 'var(--muted)', fontSize: 'var(--t-sm)', marginTop: 8 }}>No resources yet.</p>
              ) : (
                <ul className="mt-2 flex flex-col">
                  {resources.map((resource) => (
                    <li key={resource.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <AttachedResourceRow resource={resource} staff={staff} phone={phone} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
          <aside className={phone ? undefined : 'flex flex-col gap-4'} style={phone ? { display: 'contents' } : undefined}>
            {staff ? (
              <p style={{ margin: 0, order: phone ? 1 : undefined, background: 'var(--surface-2)', borderRadius: 18, padding: '8px 12px', fontSize: 14, fontWeight: 500 }}>
                Staff only · hidden from clients
              </p>
            ) : null}
            <div className={phone ? undefined : 'flex flex-col'} style={phone ? { display: 'contents' } : undefined}>
            <div className="flex flex-col gap-1" style={{ order: phone ? 3 : undefined }}>
            <Field label="Status" row={phone}>
              {staff ? (
                <StatusMenu
                  value={shownStatus}
                  onChange={(status) => {
                    if (!live) return;
                    void moveStatus({
                      hostSlug,
                      taskId: task.id as Id<'tasks'>,
                      status,
                      expectedLastEditedTime: task.lastEditedTime ?? '',
                    }).then((result) => {
                      const note = taskChangeNote(result);
                      if (note) setAsideNote(note);
                    });
                  }}
                />
              ) : shownStatus === 'In review' ? (
                <StatusBadge>In review</StatusBadge>
              ) : (
                <Pill color={taskStatusColor(shownStatus, task.isDone)}>{shownStatus}</Pill>
              )}
            </Field>
            {staff && task.milestoneId ? (
              <Field label="Kind" row={phone}>
                <div>
                  <div role="radiogroup" aria-label="Kind" data-testid="task-kind" className="mt-1 inline-flex gap-1" style={{ padding: 2, border: '1px solid var(--border-2)', borderRadius: 9 }}>
                    {TASK_KINDS.map((kind) => (
                      <button
                        key={kind}
                        type="button"
                        role="radio"
                        aria-checked={shownKind === kind}
                        data-testid={`task-kind-${kind}`}
                        onClick={() => pickKind(kind)}
                        className="focus-visible:[--tw-outline-style:solid] focus-visible:outline-2 focus-visible:outline-[var(--info)] focus-visible:outline-offset-2"
                        style={{
                          border: 0,
                          borderRadius: 7,
                          padding: '4px 12px',
                          background: shownKind === kind ? 'var(--surface-2)' : 'transparent',
                          color: shownKind === kind ? 'var(--fg)' : 'var(--muted)',
                          font: 'inherit',
                          fontSize: 14,
                          lineHeight: '21px',
                          cursor: 'pointer',
                        }}
                      >
                        {TASK_KIND_LABELS[kind]}
                      </button>
                    ))}
                  </div>
                  {kindError ? <p role="alert" style={{ margin: '4px 0 0', color: 'var(--danger-text)', fontSize: 13 }}>{kindError}</p> : null}
                </div>
              </Field>
            ) : null}
            {staff || shownAssignee ? (
              <Field label="Assignee" row={phone}>
                {staff ? (
                  <div>
                  <FieldMenu
                    testId="task-assignee"
                    open={fieldMenu === 'assignee'}
                    onOpen={() => setFieldMenu(fieldMenu === 'assignee' ? null : 'assignee')}
                    label={shownAssignee || 'Unassigned'}
                  >
                    {fieldMenu === 'assignee' && !phone ? (
                      <Popover onClose={closeFieldMenu}>
                        <OwnerMenu
                          people={peopleChoices}
                          currentId={shownAssigneeId}
                          currentName={shownAssignee}
                          onPick={pickAssignee}
                          onClose={closeFieldMenu}
                          foot="Saves as soon as you pick. Saved in the Portal."
                        />
                      </Popover>
                    ) : null}
                  </FieldMenu>
                  {assigneeSlot.error ? (
                    <FieldError testId="task-assignee-retry" text={assigneeSlot.error} onRetry={() => retryFieldSave(assigneeSlot, saveAssignee)} />
                  ) : null}
                  </div>
                ) : (
                  shownAssignee
                )}
              </Field>
            ) : null}
            <Field label="Due date" row={phone}>
              {staff ? (
                <div>
                <FieldMenu
                  testId="task-due"
                  open={fieldMenu === 'due'}
                  onOpen={() => setFieldMenu(fieldMenu === 'due' ? null : 'due')}
                  label={formatPortalDate(shownDate)}
                  icon="/icons/task-calendar.svg"
                >
                  {fieldMenu === 'due' && !phone ? (
                    <Popover onClose={closeFieldMenu}>
                      <DueDateMenu
                        value={shownDate}
                        onPick={pickDate}
                        onClose={closeFieldMenu}
                        foot="Saves as soon as you pick."
                      />
                    </Popover>
                  ) : null}
                </FieldMenu>
                {dueSlot.error ? (
                  <FieldError testId="task-due-retry" text={dueSlot.error} onRetry={() => retryFieldSave(dueSlot, saveDue)} />
                ) : null}
                </div>
              ) : (
                <span className="inline-flex items-center gap-2" style={{ color: 'var(--fg)' }}>
                  <span style={{ color: 'var(--muted)' }}><TaskGlyph src="/icons/task-calendar.svg" size={16} /></span>
                  {formatPortalDate(task.date)}
                </span>
              )}
            </Field>
            <Field label="Project" row={phone}>
              {staff ? (
                <div>
                <FieldMenu
                  testId="task-project"
                  open={fieldMenu === 'project'}
                  onOpen={() => setFieldMenu(fieldMenu === 'project' ? null : 'project')}
                  label={shownProject}
                  icon="/icons/task-layers.svg"
                >
                  {fieldMenu === 'project' && !phone ? (
                    <Popover onClose={closeFieldMenu}>
                      <ProjectMenu
                        query={projectQuery}
                        onQuery={setProjectQuery}
                        targets={visibleProjects}
                        currentName={shownProject}
                        onPick={(target) => {
                          closeFieldMenu();
                          setProjectTarget(target);
                        }}
                        onClose={closeFieldMenu}
                      />
                    </Popover>
                  ) : null}
                </FieldMenu>
                {projectSlot.error ? (
                  <FieldError testId="task-project-retry" text={projectSlot.error} onRetry={() => retryFieldSave(projectSlot, saveProject)} />
                ) : null}
                </div>
              ) : (
                <span className="inline-flex flex-wrap items-center gap-2">
                  <span style={{ color: 'var(--muted)' }}><TaskGlyph src="/icons/task-layers.svg" size={16} /></span>
                  {task.projectName ?? '—'}
                  {clientName ? (
                    <span className="ds-mono inline-flex items-center gap-1.5" style={{ border: '1px solid var(--border-2, var(--border))', borderRadius: 999, padding: '2px 8px', fontSize: 12, color: 'var(--fg)' }}>
                      <TaskGlyph src="/icons/task-building.svg" size={12} />
                      {clientName}
                    </span>
                  ) : null}
                </span>
              )}
            </Field>
            </div>
            {staff ? (
              <div
                className="task-sources-section"
                data-testid="task-sources-section"
                style={{
                  order: phone ? 4 : undefined,
                  marginTop: phone ? 'calc(var(--s-6) - 24px)' : undefined,
                }}
              >
                <TaskSources
                  taskId={task.id}
                  hostSlug={hostSlug}
                  live={live}
                  extra={extraLinks}
                  removedIds={removedLinkIds}
                  onAdd={() => setFieldMenu(fieldMenu === 'add-source' ? null : 'add-source')}
                  onRemove={dropSource}
                />
                {fieldMenu === 'add-source' && !phone ? (
                  <div className="relative">
                    <Popover up onClose={closeFieldMenu}>
                      <div
                        onKeyDown={(event) => {
                          if (event.key !== 'Escape') return;
                          event.preventDefault();
                          event.stopPropagation();
                          closeFieldMenu();
                        }}
                        style={{ background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 18, boxShadow: '0 16px 40px rgba(0,0,0,0.28)' }}
                      >
                        <AddSourceForm busy={fieldBusy} error={sourceError} onSubmit={submitSource} />
                      </div>
                    </Popover>
                  </div>
                ) : null}
              </div>
            ) : null}
            </div>
            {staff ? (
              <button
                type="button"
                data-testid="task-archive"
                onClick={() => setArchiveOpen(true)}
                style={{ order: phone ? 9 : undefined, background: 'transparent', border: 0, color: 'var(--danger-text)', textAlign: 'left', cursor: 'pointer', padding: 0 }}
              >
                Archive task
              </button>
            ) : null}
            {asideNote && asideNote !== 'Nothing was sent.' ? <p role="status" style={{ order: phone ? 10 : undefined, fontSize: 13, color: 'var(--muted)', margin: 0 }}>{asideNote}</p> : null}
          </aside>
        </div>
        </div>
        </>
      )}
    </>
  );

  if (replacedBySearch) return null;

  return (
    <>
    {staff ? <CloseoutToastHost /> : null}
    <PortalModalStack
        frames={[
          {
            key: 'detail',
            open: sheets.detail,
            keep: true,
            node: (
              <PortalModal
                testId="task-detail"
                label={task?.name ?? 'Task'}
                onClose={onClose}
                narrow={phone}
                sheet="bottom"
                width={840}
                dockLayer="task"
                hidden={!sheets.detail}
                maxHeight={phone ? undefined : TASK_DIALOG_MAX_HEIGHT}
                panelStyle={phone ? { padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' } : { padding: 24 }}
              >
                {detail}
              </PortalModal>
            ),
          },
          {
            key: 'attach',
            open: attach && Boolean(task),
            node: task ? (
              <PortalModal
                testId="attach-resources"
                label="Attach resources"
                onClose={() => setAttach(false)}
                narrow={phone}
                sheet="bottom"
                width={640}
                maxHeight={phone ? 'calc(100dvh - 12px)' : undefined}
                panelStyle={{
                  padding: 20,
                  display: 'flex',
                  flexDirection: 'column',
                  flex: phone ? '1 1 auto' : undefined,
                  minHeight: phone ? 0 : undefined,
                }}
              >
                <AttachPicker
                  task={task}
                  resources={projectResources}
                  attachedIds={resources.map((resource) => resource.id)}
                  hostSlug={hostSlug}
                  phone={phone}
                  onClose={() => setAttach(false)}
                />
              </PortalModal>
            ) : null,
          },
          {
            key: 'archive',
            open: sheets.archive,
            node: task && !archiveOpen && phone && overflowOpen ? (
              <OverflowSheet
                target="task"
                state={taskCloseoutState({ status: task.status, isDone: task.isDone })}
                onClose={() => setOverflowOpen(false)}
              >
                <OverflowSheetItems
                  target="task"
                  state={taskCloseoutState({ status: task.status, isDone: task.isDone })}
                  onAction={onOverflow}
                />
              </OverflowSheet>
            ) : task && archiveOpen ? (
              <PortalModal
                testId="task-archive-confirm"
                label={ARCHIVE_TASK_TITLE}
                onClose={() => {
                  setArchiveOpen(false);
                  setArchiveError(null);
                }}
                narrow={phone}
                sheet="bottom"
                width={440}
                header="compact"
                showIcon
                headerIcon={<WarningTriangle />}
                focusCancel
                showFooter={false}
              >
                <div data-confirm-kind="archive">
                  <p style={{ margin: '8px 24px 16px', fontSize: 14, lineHeight: '21px' }}>
                    {ARCHIVE_BODY}
                  </p>
                  {archiveError ? (
                    <p role="alert" style={{ margin: '0 24px 12px', color: 'var(--danger-text)', fontSize: 14 }}>{archiveError}</p>
                  ) : null}
                  <div className="flex flex-nowrap items-center justify-end gap-2 px-6 py-4">
                    <OutlineButton className="task-confirm-cancel" nowrap height={42} paddingInline={16} disabled={fieldBusy} onClick={() => setArchiveOpen(false)}>
                      Cancel
                    </OutlineButton>
                    <button
                      type="button"
                      data-testid="task-archive-submit"
                      disabled={fieldBusy}
                      onClick={confirmArchive}
                      style={{ height: 42, padding: '0 16px', borderRadius: 10, border: '1px solid var(--danger)', background: 'transparent', color: 'var(--danger-text)', font: 'inherit', fontSize: 14, cursor: 'pointer' }}
                    >
                      {fieldBusy ? 'Saving…' : MENU_ARCHIVE}
                    </button>
                  </div>
                </div>
              </PortalModal>
            ) : null,
          },
          {
            key: 'project',
            open: sheets.project,
            node: task && projectTarget ? (
              <PortalModal
                testId="task-project-confirm"
                label="Move this task?"
                onClose={() => setProjectTarget(null)}
                narrow={phone}
                sheet="bottom"
                width={520}
                header="compact"
                focusCancel
                showFooter={false}
              >
                <div data-confirm-kind="project">
                  <p style={{ margin: '8px 24px 16px', fontSize: 14, lineHeight: '21px' }}>
                    {projectMoveCopy(task.name, task.projectName ?? 'this project', projectTarget.name)}
                  </p>
                  <div className="flex flex-nowrap items-center justify-end gap-2 px-6 py-4">
                    <OutlineButton className="task-confirm-cancel" nowrap height={42} paddingInline={16} disabled={fieldBusy} onClick={() => setProjectTarget(null)}>
                      Cancel
                    </OutlineButton>
                    <PrimaryButton testId="task-project-submit" height={42} paddingInline={16} disabled={fieldBusy} onClick={() => { if (projectTarget) saveProject(projectTarget); }}>
                      {fieldBusy ? 'Saving…' : 'Move task'}
                    </PrimaryButton>
                  </div>
                </div>
              </PortalModal>
            ) : null,
          },
          {
            key: 'menu',
            open: sheets.menu,
            node: phone && fieldMenu && task ? (
              <PortalModal
                testId="task-field-sheet"
                label={fieldMenu === 'assignee' ? 'Assignee' : fieldMenu === 'due' ? 'Due date' : fieldMenu === 'project' ? 'Project' : 'Add source'}
                onClose={closeFieldMenu}
                narrow
                sheet="bottom"
                width={440}
                showFooter={false}
              >
                {fieldMenu === 'assignee' ? (
                  <OwnerMenu people={peopleChoices} currentId={shownAssigneeId} currentName={shownAssignee} onPick={pickAssignee} onClose={closeFieldMenu} sheet foot="Saves as soon as you pick. Saved in the Portal." />
                ) : null}
                {fieldMenu === 'due' ? (
                  <DueDateMenu value={shownDate} onPick={pickDate} onClose={closeFieldMenu} sheet foot="Saves as soon as you pick." />
                ) : null}
                {fieldMenu === 'project' ? (
                  <ProjectMenu
                    query={projectQuery}
                    onQuery={setProjectQuery}
                    targets={visibleProjects}
                    currentName={shownProject}
                    sheet
                    onPick={(target) => {
                      closeFieldMenu();
                      setProjectTarget(target);
                    }}
                    onClose={closeFieldMenu}
                  />
                ) : null}
                {fieldMenu === 'add-source' ? (
                  <div onKeyDown={(event) => {
                    if (event.key !== 'Escape') return;
                    event.preventDefault();
                    event.stopPropagation();
                    closeFieldMenu();
                  }}>
                    <AddSourceForm busy={fieldBusy} error={sourceError} onSubmit={submitSource} />
                  </div>
                ) : null}
              </PortalModal>
            ) : null,
          },
        ]}
    />
    </>
  );
}

type TimelineRow = { id: string; at: string; title: string; detail: string; tone: string };

function TaskDescription({
  task,
  staff,
  hostSlug,
  live,
}: {
  task: PortalTask;
  staff: boolean;
  hostSlug?: string;
  live: boolean;
}) {
  const updateDescription = useMutation(api.tasks.updateDescription);
  const [draft, setDraft] = useState(task.description ?? '');
  const [note, setNote] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    setDraft(task.description ?? '');
    setNote(null);
  }, [task.id, task.description]);

  if (!staff && !task.description) return null;
  const locked = staff && taskDescriptionEditMode(task.descriptionSource) === 'notion';

  const save = async () => {
    if (!live) {
      setEditing(false);
      setNote('Nothing was sent.');
      return;
    }
    setPending(true);
    try {
      const result = await updateDescription({
        hostSlug,
        taskId: task.id as Id<'tasks'>,
        description: draft,
        expectedLastEditedTime: task.lastEditedTime ?? '',
      });
      setNote(taskChangeNote(result));
    } catch (err) {
      setNote(userFacingErrorMessage(err, 'Could not save the description'));
    } finally {
      setPending(false);
    }
  };

  return (
    <section>
      <h3 className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>DESCRIPTION</h3>
      {locked ? (
        <div className="mt-2 flex flex-col gap-2">
          {task.description ? (
            <p style={{ fontSize: 'var(--t-sm)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{task.description}</p>
          ) : null}
          <p style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>Edit in Notion</p>
        </div>
      ) : staff && editing ? (
        <div className="mt-2 flex flex-col gap-2">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={4}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
          <div className="flex items-center justify-between gap-2">
            <PrimaryButton onClick={() => void save()} disabled={pending}>
              {pending ? 'Saving…' : 'Save description'}
            </PrimaryButton>
            {note ? <p style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>{note}</p> : null}
          </div>
        </div>
      ) : staff ? (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="mt-2 w-full text-left"
          style={{ background: 'transparent', border: 0, padding: 0, color: 'inherit', cursor: 'text' }}
        >
          <p style={{ fontSize: 'var(--t-sm)', lineHeight: 1.5, whiteSpace: 'pre-wrap', margin: 0 }}>
            {task.description?.trim() ? task.description : 'Add a description'}
          </p>
          {note ? <p style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>{note}</p> : null}
        </button>
      ) : (
        <p style={{ marginTop: 8, fontSize: 'var(--t-sm)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{task.description}</p>
      )}
    </section>
  );
}

function TaskTimeline({
  task,
  staff,
  hostSlug,
  live,
}: {
  task: PortalTask;
  staff: boolean;
  hostSlug?: string;
  live: boolean;
}) {
  const rows = useSafeQuery<TimelineRow[]>(
    staff ? api.tasks.activityForStaff : api.tasks.activityForClient,
    live ? { hostSlug, taskId: task.id as Id<'tasks'> } : 'skip',
  );
  return (
    <section>
      <h3 className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>ACTIVITY</h3>
      {rows.loading ? (
        <p style={{ color: 'var(--muted)', fontSize: 'var(--t-sm)', marginTop: 8 }}>Loading activity…</p>
      ) : null}
      {!rows.loading && (rows.data?.length ?? 0) === 0 ? (
        <p style={{ color: 'var(--muted)', fontSize: 'var(--t-sm)', marginTop: 8 }}>No activity yet.</p>
      ) : null}
      <ul className="mt-2 flex flex-col">
        {(rows.data ?? []).map((row) => (
          <li key={row.id} style={{ padding: '0.7rem 0', borderBottom: '1px solid var(--border)' }}>
            <p style={{ fontSize: 'var(--t-sm)', fontWeight: 600 }}>{row.title}</p>
            {row.detail ? (
              <p style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)', marginTop: 4 }}>{row.detail}</p>
            ) : null}
            <p className="ds-mono" style={{ fontSize: 11, color: 'var(--faint)', marginTop: 4 }}>
              {formatPortalDate(row.at)}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function StatusMenu({ value, onChange }: { value: string; onChange: (status: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Status"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-2"
        style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', color: 'var(--fg)', padding: '0.45rem 0.7rem' }}
      >
        {value === 'In review' ? <StatusBadge>In review</StatusBadge> : <Pill color={taskStatusColor(value, value === 'Done')}>{value}</Pill>}
        <TaskGlyph src="/icons/task-chev-down.svg" />
      </button>
      {open ? (
        <ul
          role="listbox"
          aria-label="Status"
          className="absolute z-10 mt-1 w-full"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 4, boxShadow: '0 12px 32px rgb(0 0 0 / 35%)' }}
        >
          {LIVE_TASK_STATUSES.map((status) => (
            <li key={status} role="option" aria-selected={status === value}>
              <button
                type="button"
                className="w-full text-left"
                style={{
                  padding: '0.45rem 0.6rem',
                  background: status === value ? 'var(--bg)' : 'transparent',
                  color: 'var(--fg)',
                  border: 0,
                  borderRadius: 8,
                  cursor: 'pointer',
                }}
                onClick={() => {
                  onChange(status);
                  setOpen(false);
                }}
              >
                {status}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function WarningTriangle() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M10 3.2 17.4 16.4H2.6L10 3.2Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M10 8.2v3.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="10" cy="14.2" r="0.7" fill="currentColor" />
    </svg>
  );
}

function FieldMenu({
  testId,
  label,
  icon,
  open,
  onOpen,
  children,
}: {
  testId: string;
  label: string;
  icon?: string;
  open: boolean;
  onOpen: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <button
        type="button"
        data-testid={testId}
        aria-expanded={open}
        onClick={onOpen}
        className="milestone-field group mt-1 flex w-full min-w-0 items-center gap-2 rounded-lg bg-transparent text-left hover:bg-[var(--surface-2)] focus-visible:[--tw-outline-style:solid] focus-visible:outline-2 focus-visible:outline-[var(--info)] focus-visible:outline-offset-2"
        style={{ minHeight: 32, padding: '4px 8px', border: open ? '1px solid var(--accent)' : '1px solid transparent', background: open ? 'var(--surface-2)' : undefined, color: 'var(--fg)', font: 'inherit', fontSize: 14, lineHeight: '21px', cursor: 'pointer' }}
      >
        {icon ? <span style={{ color: 'var(--muted)' }}><TaskGlyph src={icon} size={16} /></span> : null}
        <span className="min-w-0 truncate">{label}</span>
        <span className="ml-auto text-[var(--muted)]" aria-hidden>
          <TaskGlyph src="/icons/task-chev-down.svg" size={14} />
        </span>
      </button>
      {children}
    </div>
  );
}

function Field({ label, children, row = false }: { label: string; children: React.ReactNode; row?: boolean }) {
  if (row) {
    return (
      <div className="flex items-center gap-3" style={{ minHeight: 40 }}>
        <p className="ds-mono" style={{ width: 104, flex: '0 0 auto', fontSize: 12, color: 'var(--muted)', margin: 0 }}>{label}</p>
        <div style={{ fontSize: 14, minWidth: 0 }}>{children}</div>
      </div>
    );
  }
  return (
    <div>
      <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--faint)' }}>{label}</p>
      <div style={{ marginTop: 4, fontSize: 'var(--t-sm)' }}>{children}</div>
    </div>
  );
}

function resourceMeta(resource: ResourceRow): string {
  const kind = resourceKind(resource.type);
  const stamp = resource.updatedAt ?? resource.lastSyncedAt;
  const when = stamp ? formatPortalDate(new Date(stamp).toISOString()) : null;
  const visibility = resource.publishToWarehaus === false ? 'Internal' : 'Client-visible';
  return [kind.label, when && when !== '—' ? when : null, visibility].filter(Boolean).join(' · ');
}

function AttachPicker({
  task,
  resources,
  attachedIds,
  hostSlug,
  phone,
  onClose,
}: {
  task: PortalTask;
  resources: ResourceRow[];
  attachedIds: string[];
  hostSlug?: string;
  phone: boolean;
  onClose: () => void;
}) {
  const setResources = useMutation(api.tasks.setResources);
  const [query, setQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(true);
  const [filter, setFilter] = useState<'All' | 'Granola' | 'Docs' | 'Links'>('All');
  const [picked, setPicked] = useState<string[]>(attachedIds);
  const [note, setNote] = useState<string | null>(null);
  const initial = useMemo(() => [...attachedIds].sort().join(','), [attachedIds]);
  const dirty = [...picked].sort().join(',') !== initial;
  const visible = resources.filter((resource) => {
    if (query && !resource.name.toLowerCase().includes(query.toLowerCase())) return false;
    const type = (resource.type ?? '').toLowerCase();
    if (filter === 'Granola') return /granola|meeting|note/.test(type);
    if (filter === 'Docs') return /doc|pdf|article/.test(type);
    if (filter === 'Links') return /link|url/.test(type) || (!resource.type && true);
    return true;
  });

  const onSave = async () => {

    const notionIds = resources
      .filter((resource) => picked.includes(resource.id) && resource.notionPageId)
      .map((resource) => resource.notionPageId as string);
    const result = await setResources({
      hostSlug,
      taskId: task.id as Id<'tasks'>,
      resourceNotionIds: notionIds,
      expectedLastEditedTime: task.lastEditedTime ?? '',
    });
    if (!result.ok) {
      setNote(taskChangeNote(result));
      return;
    }
    onClose();
  };

  return (
    <>
        <div className="flex items-center justify-between gap-3" style={{ marginTop: phone ? 4 : 12 }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--t-md)', margin: 0 }}>Attach resources</h2>
          <button
            type="button"
            aria-label="Close"
            data-testid="attach-close"
            onClick={onClose}
            style={{
              background: 'none',
              border: 0,
              color: 'var(--fg)',
              cursor: 'pointer',
              width: 36,
              height: 36,
              flex: '0 0 auto',
              fontSize: 20,
              lineHeight: '36px',
            }}
          >
            ×
          </button>
        </div>
        <label
          className="mt-3 flex items-center gap-2"
          style={{
            borderRadius: 18,
            border: `2px solid ${searchFocused ? 'var(--accent)' : 'var(--border)'}`,
            background: 'var(--surface-2)',
            padding: '10px 12px',
          }}
        >
          <span style={{ color: 'var(--muted)' }}><TaskGlyph src="/icons/resource-search.svg" size={16} /></span>
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            placeholder="Search this project's resources"
            aria-label="Search this project's resources"
            style={{ flex: 1, border: 0, background: 'transparent', color: 'var(--fg)', outline: 'none', fontSize: 14 }}
          />
        </label>
        <div className="mt-3 flex flex-wrap gap-2">
          {(['All', 'Granola', 'Docs', 'Links'] as const).map((chip) => (
            <button key={chip} type="button" aria-pressed={filter === chip} onClick={() => setFilter(chip)} style={{ borderRadius: 999, border: '1px solid var(--border)', padding: '0.3rem 0.7rem', background: filter === chip ? 'var(--fg)' : 'transparent', color: filter === chip ? 'var(--bg)' : 'var(--muted)' }}>
              {chip}
            </button>
          ))}
        </div>
        {visible.length === 0 ? (
          <p style={{ color: 'var(--muted)', marginTop: 16 }}>{query ? 'No results. Clear search.' : 'This project has no resources yet.'}</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {visible.map((resource) => {
              const checked = picked.includes(resource.id);
              const kind = resourceKind(resource.type);
              return (
                <li key={resource.id}>
                  <label className="flex items-center gap-3" style={{ borderRadius: 18, padding: '10px 12px', background: checked ? 'var(--surface-2)' : 'transparent', cursor: 'pointer' }}>
                    <PortalCheckbox
                      checked={checked}
                      onChange={() => setPicked((current) => checked ? current.filter((id) => id !== resource.id) : [...current, resource.id])}
                    />
                    <span className="inline-flex shrink-0 items-center justify-center" style={{ width: 32, height: 32, borderRadius: 18, background: 'var(--surface-2)', color: 'var(--muted)' }}>
                      <TaskGlyph src={kind.icon} size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block" style={{ fontSize: 14, fontWeight: 500 }}>{resource.name}</span>
                      <span className="ds-mono block" style={{ fontSize: 12, color: 'var(--muted)' }}>{resourceMeta(resource)}</span>
                    </span>
                    {attachedIds.includes(resource.id) ? <span className="ds-mono shrink-0" style={{ color: 'var(--muted)', fontSize: 12 }}>Attached</span> : null}
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        {note ? <p role="status">{note}</p> : null}
        <div
          className={phone ? 'flex flex-col gap-3' : 'flex items-center justify-between gap-3'}
          style={{ borderTop: '1px solid var(--border)', marginTop: 16, paddingTop: 16 }}
        >
          <span className="ds-mono" style={{ color: 'var(--muted)', fontSize: 12 }}>
            {picked.length} selected · {picked.filter((id) => !attachedIds.includes(id)).length} new, {picked.filter((id) => attachedIds.includes(id)).length} already attached
          </span>
          {phone ? (
            <PrimaryButton className="w-full" disabled={!dirty} onClick={() => void onSave()}>
              {`Save (attach ${picked.filter((id) => !attachedIds.includes(id)).length})`}
            </PrimaryButton>
          ) : (
            <div className="flex gap-2">
              <OutlineButton onClick={onClose}>Cancel</OutlineButton>
              <PrimaryButton disabled={!dirty} onClick={() => void onSave()}>
                {`Save (attach ${picked.filter((id) => !attachedIds.includes(id)).length})`}
              </PrimaryButton>
            </div>
          )}
        </div>
    </>
  );
}

const inputStyle = {
  width: '100%',
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: 'var(--bg)',
  color: 'var(--fg)',
  padding: '0.55rem 0.7rem',
  fontSize: 'var(--t-sm)',
} as const;
