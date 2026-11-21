'use client';

import { useState, type FormEvent } from 'react';
import { useMutation } from 'convex/react';
import { MILESTONE_REQUIRED } from '@convex/_lib/milestoneTasks';
import { userFacingErrorMessage } from '@convex/_lib/userFacingError';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { WRITEBACK_OFF_ERROR, createTaskExternalId } from '@warehaus/portal-sync';
import { PortalModal } from '@/components/ui/PortalModal';
import { GhostButton, PrimaryButton, Surface } from '@/components/ui/primitives';
import { useSafeQuery } from '@/hooks/useSafeQuery';
import { LIVE_TASK_STATUSES } from '@/lib/data/view-models';
import { useMaxWidth } from '@/lib/design/useMaxWidth';

export type NewTaskProject = { id: string; name: string; orgId: string; notionPageId: string };

type MilestoneChoice = { id: string; name: string; status: string };

export const NEW_TASK_PICK_PROJECT = 'Choose a project. Nothing was sent.';
export const NEW_TASK_NO_MILESTONES = 'This project has no open milestone. Create a milestone first.';

/**
 * Dashboard New task. A task only exists inside a milestone, so the form asks
 * for the project and then the milestone. Nothing is preselected. Calls
 * createTask only when the deployment write-back flag is on.
 */
export function NewTaskControl({
  projects,
  writebackEnabled = false,
  hostSlug,
}: {
  projects: readonly NewTaskProject[];
  writebackEnabled?: boolean;
  hostSlug?: string;
}) {
  const createTask = useMutation(api.tasks.createTask);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [projectId, setProjectId] = useState('');
  const [milestoneId, setMilestoneId] = useState('');
  const [showMore, setShowMore] = useState(false);
  const [due, setDue] = useState('');
  const [status, setStatus] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const narrow = useMaxWidth(767);
  const project = projects.find((item) => item.id === projectId) ?? null;
  const choices = useSafeQuery<MilestoneChoice[]>(
    api.milestones.taskChoices,
    open && project ? { projectId: project.id as Id<'projects'>, hostSlug } : 'skip',
  );
  const milestones = choices.data ?? [];

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) {
      setNote('Title is required. Nothing was sent.');
      return;
    }
    if (!project) {
      setNote(NEW_TASK_PICK_PROJECT);
      return;
    }
    if (!milestoneId) {
      setNote(`${MILESTONE_REQUIRED} Nothing was sent.`);
      return;
    }
    if (!writebackEnabled) {
      setNote(WRITEBACK_OFF_ERROR);
      return;
    }
    setPending(true);
    setNote(null);
    try {
      const result = await createTask({
        hostSlug,
        orgId: project.orgId as Id<'clients'>,
        name: title.trim(),
        status: status || 'To Do',
        projectNotionId: project.notionPageId,
        externalId: createTaskExternalId(`${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`),
        milestoneId: milestoneId as Id<'milestones'>,
        ...(due ? { date: due } : {}),
      });
      if (!result.ok) {
        setNote(result.error);
        return;
      }
      setTitle('');
      setDue('');
      setStatus('');
      setProjectId('');
      setMilestoneId('');
      setOpen(false);
    } catch (err) {
      setNote(userFacingErrorMessage(err, 'Could not create the task'));
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <PrimaryButton
        onClick={() => {
          setNote(null);
          setOpen(true);
        }}
      >
        New task
      </PrimaryButton>
      {open ? (
        <PortalModal
          label="New task"
          testId="new-task"
          onClose={() => setOpen(false)}
          narrow={narrow}
          sheet="bottom"
          width={640}
          panelStyle={{ padding: 0 }}
        >
            <Surface style={{ padding: 'var(--s-5)' }}>
              <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>
                New task
              </p>
              <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', marginTop: 8 }}>
                A task only exists inside a milestone.
              </p>
              <form className="mt-4 flex flex-col gap-3" onSubmit={onSubmit}>
                <label className="flex flex-col gap-1">
                  <span style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>Title</span>
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    required
                    style={inputStyle}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>Project</span>
                  <select
                    data-testid="new-task-project"
                    value={projectId}
                    onChange={(event) => {
                      setProjectId(event.target.value);
                      setMilestoneId('');
                      setNote(null);
                    }}
                    style={inputStyle}
                  >
                    <option value="">Choose a project</option>
                    {projects.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>Milestone</span>
                  <select
                    data-testid="new-task-milestone"
                    value={milestoneId}
                    disabled={!project || choices.loading || milestones.length === 0}
                    onChange={(event) => {
                      setMilestoneId(event.target.value);
                      setNote(null);
                    }}
                    style={inputStyle}
                  >
                    <option value="">
                      {!project ? 'Choose a project first' : choices.loading ? 'Loading milestones…' : 'Choose a milestone'}
                    </option>
                    {milestones.map((item) => (
                      <option key={item.id} value={item.id}>
                        {`${item.name} · ${item.status}`}
                      </option>
                    ))}
                  </select>
                </label>
                {project && !choices.loading && milestones.length === 0 ? (
                  <p data-testid="new-task-no-milestones" style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>
                    {choices.error ? 'Milestones did not load. Close and try again.' : NEW_TASK_NO_MILESTONES}
                  </p>
                ) : null}
                <button
                  type="button"
                  onClick={() => setShowMore((value) => !value)}
                  className="ds-mono self-start"
                  style={{
                    fontSize: 'var(--t-xs)',
                    color: 'var(--accent)',
                    background: 'none',
                    border: 0,
                    cursor: 'pointer',
                  }}
                >
                  {showMore ? 'Hide options' : 'Due, status'}
                </button>
                {showMore ? (
                  <div className="flex flex-col gap-3">
                    <label className="flex flex-col gap-1">
                      <span style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>Due date</span>
                      <input
                        type="date"
                        value={due}
                        onChange={(event) => setDue(event.target.value)}
                        style={inputStyle}
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>Status</span>
                      <select
                        value={status}
                        onChange={(event) => setStatus(event.target.value)}
                        style={inputStyle}
                      >
                        <option value="">Leave empty</option>
                        {LIVE_TASK_STATUSES.map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                ) : null}
                {note ? (
                  <p style={{ fontSize: 'var(--t-sm)', color: 'var(--danger-text)' }} role="status">
                    {note}
                  </p>
                ) : null}
                <div className="mt-2 flex justify-end gap-2">
                  <GhostButton onClick={() => setOpen(false)}>Close</GhostButton>
                  <PrimaryButton type="submit" disabled={pending}>
                    {pending ? 'Saving…' : 'Save task'}
                  </PrimaryButton>
                </div>
              </form>
            </Surface>
        </PortalModal>
      ) : null}
    </>
  );
}

const inputStyle = {
  width: '100%',
  border: '1px solid var(--border)',
  borderRadius: 10,
  background: 'var(--bg)',
  color: 'var(--fg)',
  padding: '0.55rem 0.7rem',
  fontSize: 'var(--t-sm)',
  fontFamily: 'var(--font-body)',
} as const;
