'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { resolveBoardDrop, type MoveRule } from '@warehaus/portal-sync';
import { BoardToast, MoveSheet, NeedsDialog, TaskBoard, type BoardRules } from '@/components/tasks/TaskBoard';
import { PortalToast, type PortalToastKind } from '@/components/ui/PortalToast';
import { FIXTURE_TASKS } from '@/lib/data/fixtures';
import type { PortalTask } from '@/lib/data/view-models';

const TOAST_KINDS: PortalToastKind[] = ['success', 'error', 'moved', 'invite-sent'];

type Fixture = 'toast' | 'move' | 'needs' | 'search' | 'notice' | 'menu';
type ToastPlace = 'dock' | 'board' | 'created' | 'invite';
type NeedsState = 'empty' | 'filled' | 'error';

const MOVE_TASK: PortalTask = {
  id: 't-doing',
  name: 'Build the project page',
  status: 'In Progress',
  isDone: false,
  date: null,
  stage: 'Building',
  projectId: 'p-site',
  projectName: 'Site',
  projectStatus: null,
  projectEndDate: null,
};

const MOVE_COLUMNS = ['Idea', 'Planning', 'Building', 'Awaiting Go', 'Ready to Ship', 'Shipped', 'Parked'].map((key) => ({
  key,
  label: key,
}));

const NEEDS_RULE: Extract<MoveRule, { kind: 'needs' }> = {
  kind: 'needs',
  reason: 'Ready to Ship needs a pull request link.',
  fields: [{ key: 'pullRequestLink', label: 'Pull request link', placeholder: 'github.com/…/pull/123' }],
};

const BOARD_RULES: BoardRules = { actor: 'staff', statuses: [], stages: [] };

/**
 * Unsigned /preview captures. `?fixture=` opens one consolidated surface.
 * `?theme=light|dark` wins over the saved theme so Dark and Light can be shot.
 */
export function PreviewModalFixtures() {
  const pathname = usePathname();
  const [fixture, setFixture] = useState<Fixture | null>(null);
  const [kind, setKind] = useState<PortalToastKind | null>(null);
  const [place, setPlace] = useState<ToastPlace | null>(null);
  const [needsState, setNeedsState] = useState<NeedsState>('empty');
  const active = pathname === '/preview';

  useEffect(() => {
    if (!active) return;
    const params = new URLSearchParams(window.location.search);
    const theme = params.get('theme');
    const apply = () => {
      if (theme === 'light') document.documentElement.classList.add('light');
      if (theme === 'dark') document.documentElement.classList.remove('light');
    };
    apply();
    const timer = window.setTimeout(apply, 0);
    const next = params.get('fixture');
    if (next === 'toast' || next === 'move' || next === 'needs' || next === 'search' || next === 'notice' || next === 'menu') {
      setFixture(next);
    }
    const asked = params.get('kind');
    setKind(TOAST_KINDS.includes(asked as PortalToastKind) ? asked as PortalToastKind : null);
    const askedPlace = params.get('place');
    setPlace(askedPlace === 'dock' || askedPlace === 'board' || askedPlace === 'created' || askedPlace === 'invite' ? askedPlace : null);
    const askedNeeds = params.get('state');
    setNeedsState(askedNeeds === 'filled' || askedNeeds === 'error' ? askedNeeds : 'empty');
    const openSurface = () => {
      if (next === 'search') {
        window.dispatchEvent(new CustomEvent('wh-open-search', { detail: { trigger: document.body } }));
      }
      if (next === 'notice') window.dispatchEvent(new Event('wh-open-notices'));
      if (next === 'menu') window.dispatchEvent(new Event('wh-open-menu'));
    };
    openSurface();
    const again = window.setTimeout(openSurface, 400);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(again);
    };
  }, [active]);

  if (!active) return null;
  if (fixture === 'toast') {
    if (place === 'dock') {
      return (
        <BoardToast
          message="Moved “Build the project page” to Planning"
          undo={() => undefined}
          onDismiss={() => undefined}
          pinned
          autoHideMs={0}
        />
      );
    }
    if (place === 'board') {
      const tasks = FIXTURE_TASKS.filter((task) => task.projectId === 'p-site' && !task.syncHidden).slice(0, 2);
      return (
        <div
          data-testid="board-toast-fixture"
          className="ds-scope"
          style={{ position: 'fixed', zIndex: 30, top: 72, left: 16, right: 16, bottom: 96, overflow: 'auto' }}
        >
          <TaskBoard
            tasks={tasks}
            staff
            loading={false}
            rules={BOARD_RULES}
            onOpen={() => undefined}
            onMove={async () => ({ ok: true })}
            onQuickAdd={async () => ({ ok: true })}
            quickAddEnabled={false}
            showQuickAdd={false}
            hideGroupToggle
          />
          <BoardToast
            message="Moved “Build the project page” to Planning"
            undo={() => undefined}
            onDismiss={() => undefined}
            pinned={false}
            autoHideMs={0}
          />
        </div>
      );
    }
    if (place === 'created') {
      return (
        <PortalToast
          kind="success"
          message="Project created · Northwind"
          testId="project-created-toast"
          placement="created"
          autoHideMs={0}
          onOpen={() => undefined}
          onDismiss={() => undefined}
        />
      );
    }
    if (place === 'invite') {
      return (
        <PortalToast
          kind="invite-sent"
          placement="above-dock"
          autoHideMs={0}
          onDismiss={() => undefined}
        />
      );
    }
    const kinds = kind ? [kind] : TOAST_KINDS;
    return (
      <div
        data-testid="shared-toast-fixture"
        className="ds-scope"
        style={{
          position: 'fixed',
          zIndex: 200,
          top: 88,
          left: 16,
          right: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          alignItems: 'center',
        }}
      >
        {kinds.map((item) => (
          <PortalToast
            key={item}
            kind={item}
            placement="flow"
            autoHideMs={0}
            onRetry={item === 'error' ? () => undefined : undefined}
            onUndo={item === 'moved' ? () => undefined : undefined}
          />
        ))}
      </div>
    );
  }
  if (fixture === 'move') {
    return (
      <MoveSheet
        task={MOVE_TASK}
        columns={MOVE_COLUMNS}
        current="Building"
        decisionFor={(value) => resolveBoardDrop({ actor: 'staff', mode: 'stage', from: 'Building', to: value })}
        onClose={() => undefined}
        onPick={() => undefined}
      />
    );
  }
  if (fixture === 'needs') {
    return (
      <NeedsDialog
        taskName="Homepage"
        rule={NEEDS_RULE}
        onCancel={() => undefined}
        onSave={() => undefined}
        initialValue={needsState === 'filled' ? 'github.com/warehauscollective/warehaus/pull/120' : ''}
        initialNote={needsState === 'filled' ? 'Ready for the client to review.' : ''}
        initialError={needsState === 'error' ? 'Pull request link is required.' : null}
      />
    );
  }
  return null;
}
