import { Pill } from '@/components/ui/primitives';
import { SyncChip } from '@/components/sync/SyncChip';
import {
  TASK_BOARD_COLUMNS,
  formatPortalDate,
  taskBoardColumnKey,
  taskStatusColor,
  type PortalTask,
} from '@/lib/data/view-models';
import { Bevel } from '@warehaus/ui';
import { PORTAL_SURFACE_RADIUS } from '@/lib/design/portal-chrome';

export function StatusKanban({
  tasks,
  loading,
  onOpen,
}: {
  tasks: PortalTask[];
  loading: boolean;
  onOpen: (task: PortalTask) => void;
}) {
  const unmatched = tasks.filter((task) => taskBoardColumnKey(task) == null);
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-3" data-testid="status-kanban">
      <div className="h-full min-h-0 min-w-0 w-full overflow-x-auto pb-1">
        <div className="grid h-full min-h-[16rem] w-full gap-[var(--portal-panel-gap,1.25rem)] [grid-template-columns:repeat(5,minmax(9.25rem,1fr))] max-lg:w-max max-lg:min-w-full lg:w-full lg:[grid-template-columns:repeat(5,minmax(0,1fr))]">
        {TASK_BOARD_COLUMNS.map((col) => {
          const items = tasks.filter((task) => taskBoardColumnKey(task) === col.key);
          return (
            <Bevel
              key={col.key}
              corners="br"
              radius={PORTAL_SURFACE_RADIUS}
              cut={1.5}
              shoulder={0.55}
              fill="var(--surface)"
              stroke="var(--border)"
              className="flex min-h-0 min-w-0 flex-col"
              style={{ padding: 0 }}
            >
              <div
                className="flex shrink-0 items-center justify-between gap-2"
                style={{ padding: '0.85rem 1rem', borderBottom: '1px solid var(--border)' }}
              >
                <p style={{ fontSize: 'var(--t-sm)', fontWeight: 600 }}>{col.label}</p>
                <span className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--faint)' }}>
                  {loading ? '…' : items.length}
                </span>
              </div>
              <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto" style={{ padding: '0.75rem' }}>
                {loading
                  ? [0, 1].map((i) => (
                      <div
                        key={i}
                        className="animate-pulse"
                        style={{ height: 64, borderRadius: 12, background: 'var(--bg)' }}
                      />
                    ))
                  : null}
                {items.map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => onOpen(task)}
                    className="w-full text-left"
                    style={{
                      padding: '0.75rem 0.85rem',
                      borderRadius: 14,
                      border: '1px solid var(--border)',
                      background: 'color-mix(in oklab, var(--bg) 55%, transparent)',
                      cursor: 'pointer',
                    }}
                  >
                    <p style={{ fontSize: 'var(--t-sm)', fontWeight: 600, lineHeight: 1.35, overflowWrap: 'anywhere' }}>
                      {task.name}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>
                        {formatPortalDate(task.date)}
                      </span>
                      <SyncChip
                        notionPageId={task.notionPageId}
                        syncHidden={task.syncHidden}
                        syncState={task.syncState}
                      />
                    </div>
                  </button>
                ))}
                {!loading && items.length === 0 ? (
                  <p style={{ fontSize: 'var(--t-xs)', color: 'var(--faint)', padding: '0.5rem 0.25rem' }}>
                    No tasks
                  </p>
                ) : null}
              </div>
            </Bevel>
          );
        })}
        </div>
      </div>
      {!loading && unmatched.length > 0 ? (
        <p style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>
          {unmatched.length} task{unmatched.length === 1 ? '' : 's'} use a status outside Inbox, To Do,
          Blocked, In Progress, and Done. They stay off this board.
        </p>
      ) : null}
    </div>
  );
}

export function StatusTable({
  tasks,
  loading,
  onOpen,
}: {
  tasks: PortalTask[];
  loading: boolean;
  onOpen: (task: PortalTask) => void;
}) {
  if (loading) {
    return <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>Loading tasks…</p>;
  }
  if (tasks.length === 0) {
    return (
      <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>
        No items match these filters.
      </p>
    );
  }
  return (
    <div className="h-full overflow-auto" data-testid="status-table">
      <table className="ds-data" style={{ minWidth: 640 }}>
        <thead>
          <tr>
            <th>Task</th>
            <th>Status</th>
            <th>Date</th>
            <th>Sync</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => (
            <tr key={task.id} onClick={() => onOpen(task)} style={{ cursor: 'pointer' }}>
              <td style={{ overflowWrap: 'anywhere' }}>{task.name}</td>
              <td>
                <Pill color={taskStatusColor(task.status, task.isDone)}>{task.status}</Pill>
              </td>
              <td>{formatPortalDate(task.date)}</td>
              <td>
                <SyncChip
                  notionPageId={task.notionPageId}
                  syncHidden={task.syncHidden}
                  syncState={task.syncState}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
