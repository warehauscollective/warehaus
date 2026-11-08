'use client';

import { useMemo, useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import type { MilestoneRoadmapView, RoadmapChild } from '@convex/_lib/milestones';
import { OutlineButton, PrimaryButton, Surface } from '@/components/ui/primitives';
import { useSafeQuery } from '@/hooks/useSafeQuery';
import { isMissingConvexFunction } from '@/lib/data/staffRoster';
import { fixtureMilestones } from '@/lib/data/milestoneRoadmap';
import type { PortalTask } from '@/lib/data/view-models';

const WORK_LABEL = { draft: 'Draft', active: 'Active', ready: 'Ready' } as const;
const APPROVAL_LABEL = {
  unreviewed: 'Unreviewed',
  approved: 'Approved',
  changes_requested: 'Changes requested',
} as const;

type RoadmapProject = {
  id: string;
  name: string;
  publishToWarehaus?: boolean;
  internal?: boolean;
};

type FixturePatch = Partial<
  Pick<
    MilestoneRoadmapView,
    | 'name'
    | 'objective'
    | 'goals'
    | 'workStatus'
    | 'approval'
    | 'note'
    | 'approverName'
    | 'decidedAt'
    | 'publishToWarehaus'
  >
>;

function mergePatch(milestone: MilestoneRoadmapView, patch: FixturePatch | undefined): MilestoneRoadmapView {
  if (!patch) return milestone;
  return { ...milestone, ...patch };
}

function formatWhen(at: number | null): string | null {
  if (at == null) return null;
  return new Date(at).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function resourceLabel(count: number): string {
  return count === 1 ? '1 resource' : `${count} resources`;
}

export function ProjectRoadmap({
  project,
  tasks,
  staff,
  fixtures,
  live,
  hostSlug,
}: {
  project: RoadmapProject;
  tasks: readonly PortalTask[];
  staff: boolean;
  fixtures: boolean;
  live: boolean;
  hostSlug?: string;
}) {
  const [patches, setPatches] = useState<Record<string, FixturePatch>>({});
  const [created, setCreated] = useState<MilestoneRoadmapView[]>([]);
  const projectId = project.id as Id<'projects'>;
  const staffQuery = useSafeQuery<MilestoneRoadmapView[]>(
    api.milestones.listForProject,
    live && staff ? { projectId, hostSlug } : 'skip',
  );
  const clientQuery = useSafeQuery<MilestoneRoadmapView[]>(
    api.milestones.listForClientProject,
    live && !staff ? { projectId, hostSlug } : 'skip',
  );
  const query = staff ? staffQuery : clientQuery;
  const fixtureRows = useMemo(
    () => (fixtures ? fixtureMilestones(project, tasks, staff ? 'staff' : 'client') : []),
    [fixtures, project, tasks, staff],
  );

  if (!fixtures && !live) return null;
  if (!fixtures && query.error && isMissingConvexFunction(query.error)) return null;

  const milestones = fixtures
    ? [...fixtureRows.map((row) => mergePatch(row, patches[row.id])), ...created.map((row) => mergePatch(row, patches[row.id]))]
    : (query.data ?? []);

  if (!fixtures && query.loading && milestones.length === 0) {
    return (
      <section data-testid="project-roadmap" aria-busy="true">
        <p style={{ fontSize: 13, color: 'var(--muted)' }}>Loading roadmap</p>
      </section>
    );
  }
  if (!fixtures && query.error) {
    return (
      <section data-testid="project-roadmap">
        <p style={{ fontSize: 13, color: 'var(--danger)' }}>The roadmap could not load.</p>
      </section>
    );
  }
  if (!staff && milestones.length === 0) return null;

  return (
    <section data-testid="project-roadmap" className="flex flex-col gap-4">
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 600, lineHeight: '26px' }}>Roadmap</h2>
        <p style={{ marginTop: 4, fontSize: 13, color: 'var(--muted)' }}>
          Each milestone is one objective. Open work stays listed. The open count is not the decision.
        </p>
      </div>
      {milestones.map((milestone) => (
        <MilestoneCard
          key={milestone.id}
          milestone={milestone}
          staff={staff}
          fixtures={fixtures}
          hostSlug={hostSlug}
          onFixture={(patch) => setPatches((current) => ({ ...current, [milestone.id]: { ...current[milestone.id], ...patch } }))}
        />
      ))}
      {staff ? (
        <NewMilestone
          projectId={projectId}
          projectName={project.name}
          fixtures={fixtures}
          hostSlug={hostSlug}
          onFixture={(milestone) => setCreated((current) => [...current, milestone])}
        />
      ) : null}
    </section>
  );
}

function MilestoneCard({
  milestone,
  staff,
  fixtures,
  hostSlug,
  onFixture,
}: {
  milestone: MilestoneRoadmapView;
  staff: boolean;
  fixtures: boolean;
  hostSlug?: string;
  onFixture: (patch: FixturePatch) => void;
}) {
  const decide = useMutation(api.milestones.decide);
  const decideAsClient = useMutation(api.milestones.decideAsClient);
  const save = useMutation(api.milestones.save);
  const setWorkStatus = useMutation(api.milestones.setWorkStatus);
  const setPublish = useMutation(api.milestones.setPublish);
  const attachTask = useMutation(api.milestones.attachTask);
  const detachTask = useMutation(api.milestones.detachTask);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [removedTaskIds, setRemovedTaskIds] = useState<string[]>([]);
  const locked = milestone.approval === 'approved';
  const when = formatWhen(milestone.decidedAt);
  const shownRows = milestone.rows.filter((row) => !removedTaskIds.includes(row.id));
  const counted = shownRows.flatMap((row) => [row, ...row.children]);
  const openCount = counted.filter((row) => !row.isDone).length;
  const doneCount = counted.filter((row) => row.isDone).length;

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the milestone.');
    } finally {
      setBusy(false);
    }
  };

  const onDecide = (decision: 'approved' | 'changes_requested') => {
    const trimmed = note.trim();
    if (!trimmed) {
      setError('A note is required.');
      return;
    }
    if (fixtures) {
      onFixture({
        approval: decision,
        note: trimmed,
        approverName: 'You',
        decidedAt: Date.now(),
        ...(decision === 'changes_requested' ? { workStatus: 'active' } : {}),
      });
      setNote('');
      setError(null);
      return;
    }
    const payload = {
      hostSlug,
      milestoneId: milestone.id as Id<'milestones'>,
      decision,
      note: trimmed,
    };
    void run(async () => {
      if (staff) await decide(payload);
      else await decideAsClient(payload);
      setNote('');
    });
  };

  return (
    <Surface style={{ padding: 'clamp(1rem, 2vw, 1.5rem)', borderRadius: 28 }}>
      <article data-testid={`milestone-${milestone.id}`} className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="ds-mono" style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--faint)' }}>
              Milestone
            </p>
            <h3 data-testid="milestone-name" style={{ marginTop: 4, fontSize: 20, lineHeight: '28px', fontWeight: 600 }}>
              {milestone.name}
            </h3>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill testId="milestone-approval" label={APPROVAL_LABEL[milestone.approval]} />
            <StatusPill testId="milestone-work-status" label={WORK_LABEL[milestone.workStatus]} />
            {staff ? (
              <StatusPill testId="milestone-publish" label={milestone.publishToWarehaus ? 'Published' : 'Not published'} />
            ) : null}
          </div>
        </div>

        <p data-testid="milestone-objective" style={{ fontSize: 15, lineHeight: '22px' }}>
          {milestone.objective}
        </p>

        <div>
          <p className="ds-mono" style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--faint)' }}>
            Goals
          </p>
          {milestone.goals.length > 0 ? (
            <ol data-testid="milestone-goals" className="mt-2 flex list-decimal flex-col gap-1 pl-5">
              {milestone.goals.map((goal) => (
                <li key={goal} style={{ fontSize: 14, lineHeight: '21px' }}>
                  {goal}
                </li>
              ))}
            </ol>
          ) : (
            <p data-testid="milestone-goals" className="mt-2" style={{ fontSize: 14, color: 'var(--muted)' }}>
              No goals yet.
            </p>
          )}
        </div>

        <div>
          <p className="ds-mono" style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--faint)' }}>
            Resources
          </p>
          {milestone.resources.length > 0 ? (
            <ul data-testid="milestone-resources" className="mt-2 flex flex-col gap-1">
              {milestone.resources.map((resource) => (
                <li key={resource.id} style={{ fontSize: 14 }}>
                  {resource.url ? (
                    <a href={resource.url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>
                      {resource.title}
                    </a>
                  ) : (
                    resource.title
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p data-testid="milestone-resources" className="mt-2" style={{ fontSize: 14, color: 'var(--muted)' }}>
              No resources yet.
            </p>
          )}
        </div>

        <p data-testid="milestone-counts" style={{ fontSize: 13, color: 'var(--muted)' }}>
          <span data-testid="milestone-open-count">{openCount}</span>
          {' open · '}
          <span data-testid="milestone-done-count">{doneCount}</span>
          {' done. This count is not the decision.'}
        </p>
        {milestone.note ? (
          <p data-testid="milestone-note-saved" style={{ fontSize: 14, lineHeight: '21px' }}>
            {milestone.approverName ? `${milestone.approverName}: ` : ''}
            {milestone.note}
            {when ? <span style={{ color: 'var(--muted)' }}>{` · ${when}`}</span> : null}
          </p>
        ) : null}

        <div data-testid="milestone-tasks" className="flex flex-col gap-2">
          {shownRows.length === 0 ? (
            <p style={{ fontSize: 14, color: 'var(--muted)' }}>No tasks on this milestone yet.</p>
          ) : (
            shownRows.map((row) => (
              <div key={row.id} className="flex flex-col gap-2">
                <TaskLine row={row} testId="milestone-task" />
                {staff ? (
                  <div>
                    <button
                      type="button"
                      disabled={busy}
                      data-testid="milestone-detach"
                      onClick={() => {
                        if (fixtures) {
                          setRemovedTaskIds((current) => [...current, row.id]);
                          return;
                        }
                        void run(() =>
                          detachTask({
                            hostSlug,
                            milestoneId: milestone.id as Id<'milestones'>,
                            taskId: row.id as Id<'tasks'>,
                          }),
                        );
                      }}
                      style={textButton}
                    >
                      Remove from milestone
                    </button>
                  </div>
                ) : null}
                {row.children.map((child) => (
                  <div key={child.id} className="pl-4">
                    <TaskLine row={child} testId="milestone-subtask" />
                  </div>
                ))}
              </div>
            ))
          )}
        </div>

        {staff && !locked ? (
          editing ? (
            <EditForm
              milestone={milestone}
              busy={busy}
              onCancel={() => setEditing(false)}
              onSave={(fields) => {
                if (fixtures) {
                  onFixture({ name: fields.name, objective: fields.objective, goals: fields.goals });
                  setEditing(false);
                  return;
                }
                void run(async () => {
                  await save({
                    hostSlug,
                    milestoneId: milestone.id as Id<'milestones'>,
                    name: fields.name,
                    objective: fields.objective,
                    goals: fields.goals,
                    resourceIds: fields.resourceIds as Id<'sharedResources'>[] | undefined,
                  });
                  setEditing(false);
                });
              }}
            />
          ) : (
            <div>
              <button type="button" data-testid="milestone-edit" onClick={() => setEditing(true)} style={textButton}>
                Edit objective
              </button>
            </div>
          )
        ) : null}
        {locked ? (
          <p data-testid="milestone-locked" style={{ fontSize: 13, color: 'var(--muted)' }}>
            Approved. Request changes before editing the objective. Open tasks stay open.
          </p>
        ) : null}

        {staff ? (
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2" style={{ fontSize: 13, color: 'var(--muted)' }}>
              Work status
              <select
                data-testid="milestone-work-select"
                value={milestone.workStatus}
                disabled={busy}
                onChange={(event) => {
                  const workStatus = event.target.value as MilestoneRoadmapView['workStatus'];
                  if (fixtures) {
                    onFixture({ workStatus });
                    return;
                  }
                  void run(() =>
                    setWorkStatus({
                      hostSlug,
                      milestoneId: milestone.id as Id<'milestones'>,
                      workStatus,
                    }),
                  );
                }}
                style={fieldStyle}
              >
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="ready">Ready</option>
              </select>
            </label>
            <OutlineButton
              disabled={busy}
              onClick={() => {
                const publishToWarehaus = !milestone.publishToWarehaus;
                if (fixtures) {
                  onFixture({ publishToWarehaus });
                  return;
                }
                void run(() =>
                  setPublish({
                    hostSlug,
                    milestoneId: milestone.id as Id<'milestones'>,
                    publishToWarehaus,
                  }),
                );
              }}
            >
              {milestone.publishToWarehaus ? 'Unpublish' : 'Publish'}
            </OutlineButton>
            {milestone.attachableTasks && milestone.attachableTasks.length > 0 ? (
              <label className="flex items-center gap-2" style={{ fontSize: 13, color: 'var(--muted)' }}>
                Add task
                <select
                  data-testid="milestone-attach"
                  defaultValue=""
                  disabled={busy}
                  onChange={(event) => {
                    const taskId = event.target.value;
                    event.target.value = '';
                    if (!taskId || fixtures) return;
                    void run(() =>
                      attachTask({
                        hostSlug,
                        milestoneId: milestone.id as Id<'milestones'>,
                        taskId: taskId as Id<'tasks'>,
                      }),
                    );
                  }}
                  style={fieldStyle}
                >
                  <option value="">Choose a task</option>
                  {milestone.attachableTasks.map((task) => (
                    <option key={task.id} value={task.id}>
                      {task.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-1">
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>Note</span>
            <textarea
              data-testid="milestone-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={2}
              style={{ ...fieldStyle, resize: 'vertical', width: '100%' }}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <span data-testid="milestone-approve">
              <PrimaryButton disabled={busy} onClick={() => onDecide('approved')}>
                Approve
              </PrimaryButton>
            </span>
            <span data-testid="milestone-request">
              <OutlineButton disabled={busy} onClick={() => onDecide('changes_requested')}>
                Request changes
              </OutlineButton>
            </span>
          </div>
          {error ? (
            <p data-testid="milestone-error" style={{ fontSize: 13, color: 'var(--danger)' }}>
              {error}
            </p>
          ) : null}
        </div>
      </article>
    </Surface>
  );
}

function TaskLine({ row, testId }: { row: RoadmapChild; testId: string }) {
  return (
    <div
      data-testid={testId}
      className="flex flex-wrap items-baseline justify-between gap-2"
      style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}
    >
      <p style={{ fontSize: 14, fontWeight: 550, minWidth: 0 }}>{row.name}</p>
      <p className="flex flex-wrap items-center gap-2" style={{ fontSize: 12, color: 'var(--muted)' }}>
        <span data-testid="milestone-task-status">{row.status}</span>
        {row.stage ? <span data-testid="milestone-task-stage">{row.stage}</span> : null}
        <span data-testid="milestone-task-resources">{resourceLabel(row.resourceCount)}</span>
        {row.pullRequestUrl ? (
          <a data-testid="milestone-task-pr" href={row.pullRequestUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>
            Pull request
          </a>
        ) : null}
      </p>
    </div>
  );
}

function StatusPill({ label, testId }: { label: string; testId: string }) {
  return (
    <span
      data-testid={testId}
      className="ds-mono"
      style={{
        border: '1px solid var(--border)',
        borderRadius: 999,
        padding: '3px 8px',
        fontSize: 11,
        letterSpacing: '0.04em',
        color: 'var(--fg)',
      }}
    >
      {label}
    </span>
  );
}

function EditForm({
  milestone,
  busy,
  onSave,
  onCancel,
}: {
  milestone: MilestoneRoadmapView;
  busy: boolean;
  onSave: (fields: { name: string; objective: string; goals: string[]; resourceIds?: string[] }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(milestone.name);
  const [objective, setObjective] = useState(milestone.objective);
  const [goals, setGoals] = useState(milestone.goals.join('\n'));
  const [resourceIds, setResourceIds] = useState(milestone.resources.map((resource) => resource.id));
  return (
    <form
      className="flex flex-col gap-3"
      data-testid="milestone-edit-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSave({
          name,
          objective,
          goals: goals.split('\n'),
          resourceIds,
        });
      }}
    >
      <Field label="Name" value={name} onChange={setName} />
      <Field label="Objective" value={objective} onChange={setObjective} />
      <label className="flex flex-col gap-1">
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>Goals, one per line</span>
        <textarea value={goals} onChange={(event) => setGoals(event.target.value)} rows={3} style={{ ...fieldStyle, resize: 'vertical' }} />
      </label>
      {milestone.resourceChoices && milestone.resourceChoices.length > 0 ? (
        <label className="flex flex-col gap-1">
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>Resources</span>
          <select
            multiple
            value={resourceIds}
            onChange={(event) =>
              setResourceIds(Array.from(event.target.selectedOptions).map((option) => option.value))
            }
            style={{ ...fieldStyle, minHeight: 72 }}
          >
            {milestone.resourceChoices.map((resource) => (
              <option key={resource.id} value={resource.id}>
                {resource.title}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <PrimaryButton type="submit" disabled={busy}>
          Save milestone
        </PrimaryButton>
        <OutlineButton disabled={busy} onClick={onCancel}>
          Cancel
        </OutlineButton>
      </div>
    </form>
  );
}

function NewMilestone({
  projectId,
  projectName,
  fixtures,
  hostSlug,
  onFixture,
}: {
  projectId: Id<'projects'>;
  projectName: string;
  fixtures: boolean;
  hostSlug?: string;
  onFixture: (milestone: MilestoneRoadmapView) => void;
}) {
  const create = useMutation(api.milestones.create);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [objective, setObjective] = useState('');
  const [goals, setGoals] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!open) {
    return (
      <div>
        <OutlineButton onClick={() => setOpen(true)}>New milestone</OutlineButton>
      </div>
    );
  }
  return (
    <Surface style={{ padding: '1rem 1.25rem', borderRadius: 28 }}>
      <form
        data-testid="milestone-create"
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!name.trim() || !objective.trim()) {
            setError('Name and objective are required.');
            return;
          }
          if (fixtures) {
            const id = `m-local-${createdStamp()}`;
            onFixture({
              id,
              name: name.trim(),
              objective: objective.trim(),
              goals: goals.split('\n').map((line) => line.trim()).filter(Boolean),
              workStatus: 'draft',
              approval: 'unreviewed',
              note: null,
              approverName: null,
              decidedAt: null,
              publishToWarehaus: false,
              resources: [],
              openCount: 0,
              doneCount: 0,
              countIsDecision: false,
              rows: [],
            });
            setName('');
            setObjective('');
            setGoals('');
            setOpen(false);
            return;
          }
          setBusy(true);
          setError(null);
          void create({
            hostSlug,
            projectId,
            name,
            objective,
            goals: goals.split('\n'),
          })
            .then(() => {
              setName('');
              setObjective('');
              setGoals('');
              setOpen(false);
            })
            .catch((err: unknown) => {
              setError(err instanceof Error ? err.message : 'Could not create the milestone.');
            })
            .finally(() => setBusy(false));
        }}
      >
        <p style={{ fontSize: 14, fontWeight: 600 }}>New milestone on {projectName}</p>
        <p style={{ fontSize: 13, color: 'var(--muted)' }}>It stays unpublished until you publish it.</p>
        <Field label="Name" value={name} onChange={setName} />
        <Field label="Objective" value={objective} onChange={setObjective} />
        <label className="flex flex-col gap-1">
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>Goals, one per line</span>
          <textarea value={goals} onChange={(event) => setGoals(event.target.value)} rows={3} style={{ ...fieldStyle, resize: 'vertical' }} />
        </label>
        {error ? <p style={{ fontSize: 13, color: 'var(--danger)' }}>{error}</p> : null}
        <div className="flex flex-wrap gap-2">
          <PrimaryButton type="submit" disabled={busy}>
            Create milestone
          </PrimaryButton>
          <OutlineButton
            disabled={busy}
            onClick={() => {
              setOpen(false);
              setError(null);
            }}
          >
            Cancel
          </OutlineButton>
        </div>
      </form>
    </Surface>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span style={{ fontSize: 13, color: 'var(--muted)' }}>{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} style={fieldStyle} />
    </label>
  );
}

function createdStamp(): string {
  return Math.random().toString(36).slice(2, 8);
}

const fieldStyle = {
  border: '1px solid var(--border)',
  borderRadius: 9,
  background: 'var(--surface)',
  color: 'var(--fg)',
  font: 'inherit',
  fontSize: 14,
  padding: '0.5rem 0.7rem',
} as const;

const textButton = {
  background: 'none',
  border: 0,
  padding: 0,
  color: 'var(--accent)',
  cursor: 'pointer',
  font: 'inherit',
  fontSize: 13,
} as const;
