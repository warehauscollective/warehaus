'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@convex/_generated/api';
import type { SearchGroups, SearchHit } from '@convex/_lib/portalSearch';
import { useFixturePreview } from '@/components/providers/FixturePreviewProvider';
import { TaskGlyph } from '@/components/tasks/TaskGlyph';
import { usePortalAuth } from '@/hooks/usePortalAuth';
import { useSafeQuery } from '@/hooks/useSafeQuery';
import { isConvexConfigured } from '@/lib/convex/client';
import { getHostSlugFromLocation } from '@/lib/auth/host-slug';
import { staffRosterQueriesDeployed } from '@/lib/data/staffRoster';
import { clearSearchParam } from '@/lib/nav/clearSearchParam';
import { openPortalHref } from '@/lib/nav/openPortalHref';
import { searchFixtures } from '@/lib/search/fixtureSearch';

const GROUPS: Array<{ key: keyof SearchGroups; label: string }> = [
  { key: 'projects', label: 'Projects' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'docs', label: 'Docs' },
  { key: 'resources', label: 'Resources' },
];

const EMPTY: SearchGroups = { projects: [], tasks: [], docs: [], resources: [] };

function blankGroups(): SearchGroups {
  return { projects: [], tasks: [], docs: [], resources: [] };
}

export function PortalSearch() {
  const router = useRouter();
  const fixtures = useFixturePreview();
  const configured = isConvexConfigured();
  const { portalSession } = usePortalAuth();
  const isStaff = Boolean(portalSession?.isStaff);
  const roster = staffRosterQueriesDeployed();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const hostSlug = typeof window !== 'undefined' ? getHostSlugFromLocation() ?? undefined : undefined;
  const needle = query.trim();
  const live = open && !fixtures && configured && roster && needle.length > 0;
  const staffState = useSafeQuery<SearchGroups>(
    api.search.forStaff,
    live && isStaff ? { q: needle, hostSlug } : 'skip',
  );
  const clientState = useSafeQuery<SearchGroups>(
    api.search.forClient,
    live && portalSession && !isStaff ? { q: needle, hostSlug } : 'skip',
  );

  const groups = useMemo(() => {
    if (!needle) return blankGroups();
    if (fixtures) return searchFixtures(isStaff ? 'staff' : 'client', needle);
    if (!roster) return EMPTY;
    return (isStaff ? staffState.data : clientState.data) ?? EMPTY;
  }, [needle, fixtures, isStaff, roster, staffState.data, clientState.data]);

  const flat = useMemo(
    () => GROUPS.flatMap((group) => groups[group.key].map((hit) => hit)),
    [groups],
  );

  useEffect(() => {
    setActive(0);
  }, [needle]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initial = params.get('q');
    if (initial) {
      setQuery(initial);
      setOpen(true);
    }
    const onOpen = () => setOpen(true);
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };
    window.addEventListener('wh-open-search', onOpen);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('wh-open-search', onOpen);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    clearSearchParam('q');
  }, []);

  const choose = useCallback((hit: SearchHit) => {
    setOpen(false);
    openPortalHref(hit.href, (next) => router.replace(next, { scroll: false }));
  }, [router]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close();
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        event.stopPropagation();
        setActive((current) => (flat.length === 0 ? 0 : (current + 1) % flat.length));
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        event.stopPropagation();
        setActive((current) => (flat.length === 0 ? 0 : (current - 1 + flat.length) % flat.length));
        return;
      }
      if (event.key === 'Enter' && flat[active]) {
        event.preventDefault();
        event.stopPropagation();
        choose(flat[active]);
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open, flat, active, choose, close]);

  if (!open) return null;

  const loading = live && (isStaff ? staffState.loading : clientState.loading);
  const unavailable = !fixtures && !roster;
  const empty = Boolean(needle) && !loading && !unavailable && flat.length === 0;
  let cursor = -1;

  return (
    <div
      role="presentation"
      onClick={close}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 90,
        background: 'rgb(0 0 0 / 55%)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '12vh 16px 16px',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        data-testid="portal-search"
        onClick={(event) => event.stopPropagation()}
        style={{
          width: 'min(100%, 560px)',
          maxHeight: 'min(640px, 76dvh)',
          overflow: 'auto',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          padding: 16,
        }}
      >
        <label
          className="flex items-center gap-2"
          style={{
            borderRadius: 18,
            border: '2px solid var(--accent)',
            background: 'var(--surface-2)',
            padding: '10px 12px',
          }}
        >
          <span style={{ color: 'var(--muted)' }}>
            <TaskGlyph src="/icons/resource-search.svg" size={16} />
          </span>
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search projects, tasks, and docs"
            aria-label="Search projects, tasks, and docs"
            aria-controls="portal-search-results"
            data-testid="portal-search-input"
            style={{ flex: 1, border: 0, background: 'transparent', color: 'var(--fg)', outline: 'none', fontSize: 14 }}
          />
        </label>
        <div id="portal-search-results" role="listbox" aria-label="Search results" className="mt-3 flex flex-col gap-3">
          {unavailable ? (
            <p data-testid="portal-search-empty" style={{ color: 'var(--muted)', fontSize: 14, margin: '8px 0' }}>
              Search isn&apos;t available in this environment yet.
            </p>
          ) : null}
          {!needle && !unavailable ? (
            <p style={{ color: 'var(--muted)', fontSize: 14, margin: '8px 0' }}>
              Search projects, tasks, and docs.
            </p>
          ) : null}
          {loading ? <p style={{ color: 'var(--muted)', fontSize: 14 }}>Searching…</p> : null}
          {empty ? (
            <p data-testid="portal-search-empty" style={{ color: 'var(--muted)', fontSize: 14, margin: '8px 0' }}>
              No results. Clear search.
            </p>
          ) : null}
          {GROUPS.map((group) => {
            const hits = groups[group.key];
            if (hits.length === 0) return null;
            return (
              <section key={group.key}>
                <h2 className="ds-mono" style={{ fontSize: 11, letterSpacing: '0.08em', color: 'var(--faint)', margin: '0 0 6px', textTransform: 'uppercase' }}>
                  {group.label}
                </h2>
                <ul className="flex flex-col">
                  {hits.map((hit) => {
                    cursor += 1;
                    const index = cursor;
                    const selected = index === active;
                    return (
                      <li key={`${hit.kind}-${hit.id}`}>
                        <button
                          type="button"
                          role="option"
                          id={`search-hit-${index}`}
                          aria-selected={selected}
                          data-kind={hit.kind}
                          onMouseEnter={() => setActive(index)}
                          onClick={() => choose(hit)}
                          className="flex w-full items-center gap-3 text-left"
                          style={{
                            border: 0,
                            borderRadius: 12,
                            padding: '10px 12px',
                            background: selected ? 'var(--surface-2)' : 'transparent',
                            color: 'inherit',
                            cursor: 'pointer',
                          }}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block" style={{ fontSize: 15, fontWeight: 500 }}>{hit.title}</span>
                            <span className="ds-mono block" style={{ fontSize: 12, color: 'var(--muted)' }}>{hit.subtitle}</span>
                          </span>
                          {isStaff && hit.published === false ? (
                            <span className="ds-mono shrink-0" style={{ fontSize: 11, color: 'var(--muted)' }}>Not published</span>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
