'use client';

import { type CSSProperties, type ReactNode } from 'react';
import type { RoadmapChild } from '@convex/_lib/milestones';
import { displayedTaskStatus } from '@/lib/data/taskStatus';
import {
  Panel,
  fieldStyle,
} from './milestoneChrome';
import { type RoadmapProject, type MilestoneActivityItem, resourceLabel } from './milestoneTile';

export function ProjectResources({ project, extra }: { project: RoadmapProject; extra?: ReactNode }) {
  const links = [
    project.figmaLink ? { label: 'Figma', url: project.figmaLink } : null,
    project.docsUrl ? { label: 'Docs', url: project.docsUrl } : null,
    project.liveUrl ? { label: 'Live site', url: project.liveUrl } : null,
  ].filter((link): link is { label: string; url: string } => link != null);
  return (
    <div className="flex flex-col gap-4">
      <Panel>
        <h2 style={{ fontSize: 20, lineHeight: '30px', fontWeight: 500 }}>Project resources</h2>
        {project.description ? (
          <p style={{ marginTop: 12, fontSize: 14, lineHeight: '21px', color: 'var(--muted)' }}>{project.description}</p>
        ) : null}
        {links.length === 0 ? (
          <p style={{ marginTop: 12, fontSize: 14, color: 'var(--muted)' }}>No project links yet.</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {links.map((link) => (
              <li key={link.label}>
                <a href={link.url} target="_blank" rel="noreferrer" style={{ color: 'var(--fg)', fontSize: 14 }}>
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      {extra}
    </div>
  );
}

export function ActivityList({
  items,
  empty,
  error,
}: {
  items: readonly MilestoneActivityItem[];
  empty: string;
  error?: string | null;
}) {
  return (
    <div className="flex flex-col gap-3">
      {error ? (
        <p data-testid="activity-error" style={{ fontSize: 14, color: 'var(--danger-text)' }}>
          {error}
        </p>
      ) : null}
      {items.length === 0 ? (
        <p style={{ fontSize: 14, color: 'var(--muted)' }}>{empty}</p>
      ) : (
    <ul className="flex flex-col gap-3">
      {items.map((item) => (
        <li key={item.id}>
          <Panel>
            <p style={{ fontSize: 14, fontWeight: 500 }}>{item.name}</p>
            <p style={{ marginTop: 6, fontSize: 14, color: 'var(--muted)' }}>{item.summary || item.type}</p>
            <p className="ds-mono" style={{ marginTop: 8, fontSize: 11, color: 'var(--faint)' }}>
              {item.timestamp}
            </p>
          </Panel>
        </li>
      ))}
    </ul>
      )}
    </div>
  );
}

export function TaskLine({
  row,
  testId,
  onOpen,
}: {
  row: RoadmapChild;
  testId: string;
  onOpen?: () => void;
}) {
  const body = (
    <>
      <p style={{ fontSize: 14, fontWeight: 550, minWidth: 0 }}>{row.name}</p>
      <p className="flex flex-wrap items-center gap-2" style={{ fontSize: 12, color: 'var(--muted)' }}>
        <span data-testid="milestone-task-status">{displayedTaskStatus(row.status, row.stage)}</span>
        {row.stage ? <span data-testid="milestone-task-stage">{row.stage}</span> : null}
        {row.source === 'portal-review' ? <span data-testid="review-tag" className="ds-mono" style={{ border: '1px solid var(--border-2)', borderRadius: 999, padding: '2px 8px' }}>From review</span> : null}
        <span data-testid="milestone-task-resources">{resourceLabel(row.resourceCount)}</span>
        {row.pullRequestUrl ? (
          <a data-testid="milestone-task-pr" href={row.pullRequestUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>
            Pull request
          </a>
        ) : null}
      </p>
    </>
  );
  return (
    <div
      data-testid={testId}
      className="flex flex-wrap items-baseline justify-between gap-2"
      style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}
    >
      {onOpen ? (
        <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-2 text-left" style={{ background: 'none', border: 0, color: 'inherit', cursor: 'pointer', padding: 0 }}>
          {body}
        </button>
      ) : (
        body
      )}
    </div>
  );
}

/** Form picker trigger. The outline comes from `.milestone-picker`, not from inline style. */
export const pickerFieldStyle: CSSProperties = { ...fieldStyle, border: undefined, borderRadius: undefined, cursor: 'pointer' };

export const textButton = {
  background: 'none',
  border: 0,
  padding: 0,
  color: 'var(--muted)',
  cursor: 'pointer',
  font: 'inherit',
  fontSize: 13,
} as const;
