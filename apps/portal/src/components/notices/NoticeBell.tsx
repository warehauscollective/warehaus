'use client';

import { useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { useFixturePreview } from '@/components/providers/FixturePreviewProvider';
import { usePortalData } from '@/hooks/usePortalData';
import { useSafeQuery } from '@/hooks/useSafeQuery';
import { getHostSlugFromLocation } from '@/lib/auth/host-slug';
import { isConvexConfigured } from '@/lib/convex/client';
import { FIXTURE_NOTICES } from '@/lib/data/fixtures';

type NoticeRow = {
  id: Id<'notices'>;
  message: string;
  createdAt: number;
  readAt: number | null;
  edgeCase: string | null;
  unread: boolean;
};

function noticeLabel(edgeCase: string | null): string {
  if (!edgeCase) return 'Notice';
  if (edgeCase === 'conflict') return 'Conflict';
  if (edgeCase === 'sync' || edgeCase.startsWith('sync')) return 'Sync';
  if (edgeCase.startsWith('unknown-stage')) return 'Stage';
  if (edgeCase.startsWith('invite') || edgeCase.startsWith('revert')) return 'Invite';
  return 'Notice';
}

/** Staff inbox. Sync, conflict, unknown Stage, and invite changes. No email. */
export function NoticeBell() {
  const { data } = usePortalData();
  const fixtures = useFixturePreview();
  const configured = isConvexConfigured();
  const staff = data.tenant.mode === 'team';
  const hostSlug = typeof window !== 'undefined' ? getHostSlugFromLocation() ?? undefined : undefined;
  const enabled = configured && staff && !fixtures && data.tenant.ok;
  const notices = useSafeQuery<NoticeRow[]>(api.invitesSync.listStaffNotices, enabled ? { hostSlug } : 'skip');
  const markRead = useMutation(api.invitesSync.markNoticeRead);
  const markAll = useMutation(api.invitesSync.markAllNoticesRead);
  const [open, setOpen] = useState(false);
  const [fixtureRows, setFixtureRows] = useState<
    Array<{ id: string; message: string; createdAt: number; readAt: number | null; edgeCase: string; unread: boolean }>
  >(FIXTURE_NOTICES);
  const fixtureStaff = fixtures && staff;
  if (!enabled && !fixtureStaff) return null;
  const rows = fixtureStaff ? fixtureRows : notices.data ?? [];
  const unread = rows.filter((row) => row.unread).length;
  const markOne = (id: string) => {
    if (fixtureStaff) {
      setFixtureRows((current) => current.map((row) => (row.id === id ? { ...row, unread: false, readAt: Date.now() } : row)));
      return;
    }
    const noticeId = id as Id<'notices'>;
    void markRead({ hostSlug, noticeId });
  };
  const markEvery = () => {
    if (fixtureStaff) {
      setFixtureRows((current) => current.map((row) => ({ ...row, unread: false, readAt: Date.now() })));
      return;
    }
    void markAll({ hostSlug });
  };

  return (
    <div className="fixed z-40" style={{ top: '1.25rem', right: '1.25rem' }}>
      <button
        type="button"
        aria-label={unread ? `Notices, ${unread} unread` : 'Notices'}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="relative flex items-center justify-center"
        style={{
          width: 42,
          height: 42,
          borderRadius: 14,
          border: '1px solid var(--border)',
          background: 'var(--surface)',
          color: 'var(--fg)',
        }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path
            d="M8 1.5a4 4 0 0 0-4 4V8.2L2.7 10.4a.7.7 0 0 0 .6 1.1h9.4a.7.7 0 0 0 .6-1.1L12 8.2V5.5a4 4 0 0 0-4-4Z"
            stroke="currentColor"
            strokeWidth="1.33"
          />
          <path d="M6.5 12.5a1.5 1.5 0 0 0 3 0" stroke="currentColor" strokeWidth="1.33" strokeLinecap="round" />
        </svg>
        {unread > 0 ? (
          <span
            className="ds-mono absolute"
            style={{
              top: -4,
              right: -4,
              minWidth: 16,
              height: 16,
              borderRadius: 999,
              background: 'var(--danger)',
              color: 'var(--bg)',
              fontSize: 10,
              lineHeight: '16px',
              padding: '0 4px',
            }}
          >
            {unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label="Notices"
          className="absolute flex flex-col"
          style={{
            top: 50,
            right: 0,
            width: 'min(360px, calc(100vw - 2rem))',
            maxHeight: 420,
            overflow: 'auto',
            borderRadius: 16,
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            padding: 12,
            gap: 8,
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>
              Notices
            </p>
            {unread > 0 ? (
              <button type="button" onClick={markEvery} style={{ color: 'var(--accent)', fontSize: 'var(--t-xs)' }}>
                Mark all read
              </button>
            ) : null}
          </div>
          {notices.loading && rows.length === 0 ? (
            <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>Loading notices…</p>
          ) : null}
          {!notices.loading && rows.length === 0 ? (
            <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>No notices.</p>
          ) : null}
          {rows.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => {
                if (row.unread) markOne(row.id);
              }}
              className="w-full text-left"
              style={{
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: '0.7rem 0.85rem',
                background: row.unread ? 'var(--bg)' : 'transparent',
              }}
            >
              <span className="ds-mono" style={{ fontSize: 11, color: 'var(--faint)' }}>
                {noticeLabel(row.edgeCase)}
                {row.unread ? ' · Unread' : ' · Read'}
              </span>
              <span className="mt-1 block" style={{ fontSize: 14, lineHeight: '21px' }}>
                {row.message}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
