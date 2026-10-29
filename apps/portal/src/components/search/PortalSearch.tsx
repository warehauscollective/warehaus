'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import type { PortalTab } from '@warehaus/logic/portal';
import { api } from '@convex/_generated/api';
import type { SearchGroups, SearchHit } from '@convex/_lib/portalSearch';
import { useFixturePreview } from '@/components/providers/FixturePreviewProvider';
import { usePortalTab } from '@/components/providers/PortalTabProvider';
import { TaskGlyph } from '@/components/tasks/TaskGlyph';
import { usePortalAuth } from '@/hooks/usePortalAuth';
import { useSafeQuery } from '@/hooks/useSafeQuery';
import { isConvexConfigured } from '@/lib/convex/client';
import { getHostSlugFromLocation } from '@/lib/auth/host-slug';
import { staffRosterQueriesDeployed } from '@/lib/data/staffRoster';
import { clearSearchParam } from '@/lib/nav/clearSearchParam';
import { openPortalHref } from '@/lib/nav/openPortalHref';
import { SEARCH_NO_RESULTS_COPY } from '@/lib/search/noResultsCopy';
import { searchFixtures } from '@/lib/search/fixtureSearch';
import {
  readSearchRecents,
  writeSearchRecent,
  type SearchRecentScope,
} from '@/lib/search/recents';

const GROUPS: Array<{ key: keyof SearchGroups; label: string }> = [
  { key: 'projects', label: 'Projects' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'docs', label: 'Docs' },
  { key: 'resources', label: 'Resources' },
];

const SCOPES: Array<{ key: 'all' | keyof SearchGroups; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'projects', label: 'Projects' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'docs', label: 'Docs' },
  { key: 'resources', label: 'Resources' },
];

const QUICK_LINKS: Array<{ id: string; label: string; tab: PortalTab; icon: 'grid' | 'layers' | 'resources' | 'activity' }> = [
  { id: 'dashboard', label: 'Dashboard', tab: 'dashboard', icon: 'grid' },
  { id: 'projects', label: 'All projects', tab: 'projects', icon: 'layers' },
  { id: 'resources', label: 'Resources', tab: 'resources', icon: 'resources' },
  { id: 'activity', label: 'Activity', tab: 'activity', icon: 'activity' },
];

const EMPTY: SearchGroups = { projects: [], tasks: [], docs: [], resources: [] };
const GROUP_CAP = 5;
const FIXTURE_DELAY_KEY = 'wh-search-preview-delay';
const META_SEP = ' · ';

type Scope = 'all' | keyof SearchGroups;
type Intent = 'active' | 'keyboard' | 'hover';
type Item =
  | { key: string; kind: 'hit'; hit: SearchHit; group: keyof SearchGroups }
  | { key: string; kind: 'link'; label: string; tab: PortalTab; icon: (typeof QUICK_LINKS)[number]['icon'] };

function blankGroups(): SearchGroups {
  return { projects: [], tasks: [], docs: [], resources: [] };
}

function fixturePreviewDelay(fixtures: boolean): number {
  if (!fixtures || typeof window === 'undefined') return 0;
  try {
    const raw = window.sessionStorage.getItem(FIXTURE_DELAY_KEY);
    const value = raw ? Number(raw) : 0;
    if (!Number.isFinite(value) || value <= 0 || value > 5000) return 0;
    return value;
  } catch {
    return 0;
  }
}

function forAudience(hit: SearchHit, staff: boolean): SearchHit {
  if (staff || hit.published == null) return hit;
  return {
    id: hit.id,
    kind: hit.kind,
    title: hit.title,
    subtitle: hit.subtitle,
    href: hit.href,
    metaType: hit.metaType,
    ...(hit.metaWhen ? { metaWhen: hit.metaWhen } : {}),
    ...(hit.metaProject ? { metaProject: hit.metaProject } : {}),
    ...(hit.stage ? { stage: hit.stage } : {}),
  };
}

function hitIcon(hit: SearchHit): string {
  if (hit.kind === 'project' || hit.metaType === 'Project') return '/icons/task-layers.svg';
  if (hit.kind === 'task' || hit.metaType === 'Task') return '/icons/docs-check.svg';
  if (hit.metaType === 'Granola') return '/icons/resource-mic.svg';
  if (hit.metaType === 'Link') return '/icons/resource-link.svg';
  return '/icons/resource-doc.svg';
}

function stageIsDanger(stage: string): boolean {
  return /await/i.test(stage);
}

function GridGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.33" />
      <rect x="9" y="2.5" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.33" />
      <rect x="2.5" y="9" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.33" />
      <rect x="9" y="9" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.33" />
    </svg>
  );
}

function CloseGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M4 4l8 8M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function LinkGlyph({ icon }: { icon: (typeof QUICK_LINKS)[number]['icon'] }) {
  if (icon === 'grid') return <GridGlyph />;
  const src = icon === 'layers'
    ? '/icons/task-layers.svg'
    : icon === 'resources'
      ? '/icons/dock-resources.svg'
      : '/icons/dock-activity.svg';
  return <TaskGlyph src={src} size={16} />;
}

function Kbd({ children }: { children: string }) {
  return (
    <span
      className="ds-mono"
      style={{
        border: '1px solid var(--border-2)',
        borderRadius: 6,
        padding: '2px 7px',
        fontSize: 11,
        fontWeight: 500,
        color: 'var(--fg)',
        lineHeight: '14px',
      }}
    >
      {children}
    </span>
  );
}

function PublishMark({ published }: { published: boolean }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap" style={{ padding: '4px 8px' }}>
      {published ? (
        <span
          aria-hidden
          style={{
            width: 8,
            height: 8,
            background: 'var(--fg)',
            WebkitMask: 'url(/icons/docs-dot-on.svg) center / contain no-repeat',
            mask: 'url(/icons/docs-dot-on.svg) center / contain no-repeat',
          }}
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src="/icons/docs-dot-off.svg" alt="" width={8} height={8} />
      )}
      <span className="ds-mono" style={{ fontSize: 11, letterSpacing: '0.44px', color: published ? 'var(--fg)' : 'var(--muted)' }}>
        {published ? 'Published' : 'Not published'}
      </span>
    </span>
  );
}

function rowChrome(selected: boolean, intent: Intent): CSSProperties {
  if (!selected) return { background: 'transparent' };
  if (intent === 'hover') return { background: 'var(--surface-2)' };
  if (intent === 'keyboard') {
    return { background: 'var(--surface-2)', boxShadow: 'inset 0 0 0 2px var(--ring, #404040)' };
  }
  return { background: 'var(--surface-2)', boxShadow: 'inset 0 0 0 1px var(--border-2)' };
}

export function PortalSearch() {
  const router = useRouter();
  const { setActiveTab } = usePortalTab();
  const fixtures = useFixturePreview();
  const configured = isConvexConfigured();
  const { portalSession, authUser } = usePortalAuth();
  const isStaff = Boolean(portalSession?.isStaff);
  const recentScope: SearchRecentScope = {
    authUserId: authUser?.id ?? '',
    tier: isStaff ? 'staff' : 'client',
    orgId: portalSession?.orgId ?? '',
  };
  const recentScopeRef = useRef(recentScope);
  recentScopeRef.current = recentScope;
  const roster = staffRosterQueriesDeployed();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [intent, setIntent] = useState<Intent>('active');
  const [scope, setScope] = useState<Scope>('all');
  const [expanded, setExpanded] = useState<Partial<Record<keyof SearchGroups, boolean>>>({});
  const [narrow, setNarrow] = useState(false);
  const [recents, setRecents] = useState<SearchHit[]>([]);
  const [kept, setKept] = useState<SearchGroups>(EMPTY);
  const [pendingSince, setPendingSince] = useState<number | null>(null);
  const [slow, setSlow] = useState(false);
  const triggerRef = useRef<HTMLElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const hostSlug = typeof window !== 'undefined' ? getHostSlugFromLocation() ?? undefined : undefined;
  const needle = query.trim().slice(0, 100);
  const [liveNeedle, setLiveNeedle] = useState('');

  useEffect(() => {
    const id = window.setTimeout(() => setLiveNeedle(needle), 200);
    return () => window.clearTimeout(id);
  }, [needle]);

  const live = open && !fixtures && configured && roster && liveNeedle.length > 0 && needle.length > 0;
  const staffState = useSafeQuery<SearchGroups>(
    api.search.forStaff,
    live && isStaff ? { q: liveNeedle, hostSlug } : 'skip',
  );
  const clientState = useSafeQuery<SearchGroups>(
    api.search.forClient,
    live && portalSession && !isStaff ? { q: liveNeedle, hostSlug } : 'skip',
  );
  const serverGroups = isStaff ? staffState.data : clientState.data;
  const serverLoading = isStaff ? staffState.loading : clientState.loading;

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const apply = () => setNarrow(media.matches);
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    if (!fixtures) return;
    if (!needle) {
      setKept(blankGroups());
      setPendingSince(null);
      return;
    }
    const delay = fixturePreviewDelay(fixtures);
    if (delay <= 0) {
      setKept(searchFixtures(isStaff ? 'staff' : 'client', needle));
      setPendingSince(null);
      return;
    }
    setPendingSince((current) => current ?? Date.now());
    const id = window.setTimeout(() => {
      setKept(searchFixtures(isStaff ? 'staff' : 'client', needle));
      setPendingSince(null);
    }, delay);
    return () => window.clearTimeout(id);
  }, [fixtures, needle, isStaff]);

  useEffect(() => {
    if (fixtures) return;
    if (!needle) {
      setKept(blankGroups());
      setPendingSince(null);
      return;
    }
    if (!roster || !configured) {
      setKept(blankGroups());
      setPendingSince(null);
      return;
    }
    if (liveNeedle !== needle || serverLoading || serverGroups == null) {
      setPendingSince((current) => current ?? Date.now());
      return;
    }
    setKept(serverGroups);
    setPendingSince(null);
  }, [fixtures, needle, roster, configured, liveNeedle, serverLoading, serverGroups]);

  useEffect(() => {
    if (pendingSince == null) {
      setSlow(false);
      return;
    }
    const elapsed = Date.now() - pendingSince;
    if (elapsed >= 150) {
      setSlow(true);
      return;
    }
    const id = window.setTimeout(() => setSlow(true), 150 - elapsed);
    return () => window.clearTimeout(id);
  }, [pendingSince]);

  useEffect(() => {
    setActive(0);
    setIntent('active');
    setExpanded({});
  }, [needle, scope]);

  const close = useCallback(() => {
    setOpen(false);
    clearSearchParam('q');
    const trigger = triggerRef.current;
    triggerRef.current = null;
    window.requestAnimationFrame(() => trigger?.focus());
  }, []);

  const loadRecents = useCallback(() => {
    if (typeof window === 'undefined') return [];
    return readSearchRecents(window.localStorage, recentScopeRef.current);
  }, []);

  const openSearch = useCallback((trigger: HTMLElement | null) => {
    triggerRef.current = trigger;
    setScope('all');
    setOpen(true);
    setRecents(loadRecents());
  }, [loadRecents]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initial = params.get('q');
    if (initial) {
      setQuery(initial);
      openSearch(null);
    }
    const onOpen = (event: Event) => {
      const trigger = event instanceof CustomEvent ? event.detail?.trigger : null;
      openSearch(trigger instanceof HTMLElement ? trigger : null);
    };
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((current) => {
          if (current) {
            const trigger = triggerRef.current;
            triggerRef.current = null;
            clearSearchParam('q');
            window.requestAnimationFrame(() => trigger?.focus());
            return false;
          }
          triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          setScope('all');
          setRecents(loadRecents());
          return true;
        });
      }
    };
    window.addEventListener('wh-open-search', onOpen);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('wh-open-search', onOpen);
      window.removeEventListener('keydown', onKey);
    };
  }, [loadRecents, openSearch]);

  useEffect(() => {
    setRecents(loadRecents());
  }, [loadRecents, recentScope.authUserId, recentScope.tier, recentScope.orgId]);

  const choose = useCallback((hit: SearchHit) => {
    if (typeof window !== 'undefined') {
      setRecents(writeSearchRecent(window.localStorage, recentScopeRef.current, hit));
    }
    setOpen(false);
    clearSearchParam('q');
    openPortalHref(hit.href, (next) => router.replace(next, { scroll: false }));
  }, [router]);

  const chooseLink = useCallback((tab: PortalTab) => {
    setOpen(false);
    clearSearchParam('q');
    setActiveTab(tab);
  }, [setActiveTab]);

  const scoped = useMemo(() => {
    if (scope === 'all') return kept;
    return { ...blankGroups(), [scope]: kept[scope] };
  }, [kept, scope]);

  const items = useMemo(() => {
    if (!needle) {
      const recentItems: Item[] = recents.map((hit) => ({
        key: `recent-${hit.kind}-${hit.id}`,
        kind: 'hit' as const,
        hit: forAudience(hit, isStaff),
        group: 'projects' as const,
      }));
      const links: Item[] = QUICK_LINKS.map((link) => ({
        key: `link-${link.id}`,
        kind: 'link' as const,
        label: link.label,
        tab: link.tab,
        icon: link.icon,
      }));
      return [...recentItems, ...links];
    }
    const next: Item[] = [];
    for (const group of GROUPS) {
      if (scope !== 'all' && scope !== group.key) continue;
      const hits = scoped[group.key];
      const visible = expanded[group.key] ? hits : hits.slice(0, GROUP_CAP);
      for (const hit of visible) {
        next.push({ key: `${hit.kind}-${hit.id}`, kind: 'hit', hit: forAudience(hit, isStaff), group: group.key });
      }
    }
    return next;
  }, [needle, recents, isStaff, scope, scoped, expanded]);

  const resultCount = useMemo(() => {
    if (!needle) return recents.length;
    return GROUPS.reduce((sum, group) => {
      if (scope !== 'all' && scope !== group.key) return sum;
      return sum + scoped[group.key].length;
    }, 0);
  }, [needle, recents.length, scope, scoped]);

  const keptCount = GROUPS.reduce((sum, group) => sum + kept[group.key].length, 0);
  const showSkeleton = Boolean(needle) && slow && pendingSince != null && keptCount === 0;
  const unavailable = Boolean(needle) && !fixtures && !roster;
  const empty = Boolean(needle) && !showSkeleton && pendingSince == null && !unavailable && resultCount === 0;
  const copy = isStaff ? SEARCH_NO_RESULTS_COPY.staff : SEARCH_NO_RESULTS_COPY.client;

  useEffect(() => {
    if (!open) return;
    const node = document.getElementById(`search-hit-${active}`);
    node?.scrollIntoView({ block: 'nearest' });
  }, [open, active, items.length]);

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
        setIntent('keyboard');
        setActive((current) => (items.length === 0 ? 0 : (current + 1) % items.length));
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        event.stopPropagation();
        setIntent('keyboard');
        setActive((current) => (items.length === 0 ? 0 : (current - 1 + items.length) % items.length));
        return;
      }
      if (event.key === 'Enter' && !event.isComposing && items[active]) {
        event.preventDefault();
        event.stopPropagation();
        const item = items[active];
        if (item.kind === 'hit') choose(item.hit);
        else chooseLink(item.tab);
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open, items, active, choose, chooseLink, close]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
  }, [open]);

  if (!open) return null;

  const countLabel = !needle ? 'Recent' : showSkeleton ? 'Searching…' : `${resultCount} result${resultCount === 1 ? '' : 's'}`;
  let cursor = -1;

  const activate = (index: number, from: Intent) => {
    setActive(index);
    setIntent(from);
  };

  return (
    <div
      role="presentation"
      onClick={close}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 90,
        background: 'rgb(0 0 0 / 45%)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: narrow ? '56px 20px 24px' : '72px 20px 24px',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        data-testid="portal-search"
        onClick={(event) => event.stopPropagation()}
        style={{
          width: narrow ? '100%' : 640,
          maxWidth: '100%',
          maxHeight: narrow ? 'calc(100dvh - 80px)' : 'min(780px, calc(100dvh - 96px))',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 28,
          boxShadow: '0 24px 64px rgb(0 0 0 / 45%)',
          color: 'var(--fg)',
        }}
      >
        <div style={{ padding: narrow ? '20px 20px 12px' : '20px 20px 12px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label
            className="flex min-w-0 items-center gap-2.5"
            style={{
              borderRadius: 18,
              border: '1.5px solid var(--border)',
              background: 'var(--surface-2)',
              padding: narrow ? '8px 8px 8px 14px' : '12px 14px',
            }}
          >
            <span style={{ color: 'var(--muted)' }}>
              <TaskGlyph src="/icons/resource-search.svg" size={16} />
            </span>
            <input
              ref={inputRef}
              autoFocus
              value={query}
              maxLength={100}
              onChange={(event) => setQuery(event.target.value.slice(0, 100))}
              placeholder={narrow ? 'Search' : 'Search projects, tasks, docs, resources'}
              aria-label="Search projects, tasks, docs, resources"
              aria-controls="portal-search-results"
              aria-activedescendant={items[active] ? `search-hit-${active}` : undefined}
              data-testid="portal-search-input"
              className="min-w-0 flex-1 placeholder:text-[var(--muted)]"
              style={{ border: 0, background: 'transparent', color: 'var(--fg)', outline: 'none', fontSize: 16 }}
            />
            {narrow ? (
              <button
                type="button"
                aria-label="Close search"
                data-testid="portal-search-close"
                onClick={close}
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 12,
                  border: '1px solid var(--border-2)',
                  background: 'transparent',
                  color: 'var(--fg)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  flex: '0 0 auto',
                }}
              >
                <CloseGlyph />
              </button>
            ) : (
              <button
                type="button"
                onClick={close}
                aria-label="Close search"
                style={{ border: 0, background: 'transparent', padding: 0, cursor: 'pointer' }}
              >
                <Kbd>Esc</Kbd>
              </button>
            )}
          </label>
          {needle ? (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Filter results">
              {SCOPES.map((chip) => {
                const selected = scope === chip.key;
                return (
                  <button
                    key={chip.key}
                    type="button"
                    aria-pressed={selected}
                    className="ds-mono"
                    onClick={() => setScope(chip.key)}
                    style={{
                      borderRadius: 999,
                      padding: '4px 10px',
                      fontSize: 12,
                      cursor: 'pointer',
                      background: selected ? 'var(--fg)' : 'transparent',
                      color: selected ? 'var(--bg)' : 'var(--fg)',
                      border: selected ? '1px solid transparent' : '1px solid var(--border-2)',
                    }}
                  >
                    {chip.label}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
        <div style={{ height: 1, background: 'var(--border)', flex: '0 0 auto' }} />
        <div
          id="portal-search-results"
          role="listbox"
          aria-label="Search results"
          style={{ position: 'relative', flex: '1 1 auto', minHeight: 0, overflow: 'auto', padding: '4px 12px 12px' }}
        >
          {unavailable ? (
            <p data-testid="portal-search-empty" style={{ color: 'var(--muted)', fontSize: 14, margin: '24px 12px' }}>
              Search isn&apos;t available in this environment yet.
            </p>
          ) : null}
          {showSkeleton ? (
            <div data-testid="portal-search-skeleton" className="flex flex-col">
              {[280, 220, 280].map((width, index) => (
                <div key={width + index} className="flex items-center gap-3" style={{ padding: '12px' }}>
                  <span className="animate-pulse shrink-0" style={{ width: 36, height: 36, borderRadius: 12, background: 'var(--surface-2)' }} />
                  <span className="flex min-w-0 flex-col gap-2">
                    <span className="animate-pulse" style={{ width, maxWidth: '100%', height: 12, borderRadius: 6, background: 'var(--surface-2)' }} />
                    <span className="animate-pulse" style={{ width: 180, maxWidth: '70%', height: 10, borderRadius: 6, background: 'var(--surface-2)' }} />
                  </span>
                </div>
              ))}
            </div>
          ) : null}
          {empty ? (
            <div data-testid="portal-search-empty" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '40px 16px', textAlign: 'center' }}>
              <span style={{ width: 36, height: 36, borderRadius: 12, background: 'var(--surface-2)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>
                <TaskGlyph src="/icons/resource-search.svg" size={16} />
              </span>
              <p style={{ margin: 0, fontSize: 16, fontWeight: 500, overflowWrap: 'anywhere' }}>{copy.title(needle)}</p>
              <p className="ds-mono" style={{ margin: 0, fontSize: 12, color: 'var(--muted)', overflowWrap: 'anywhere' }}>{copy.hint}</p>
            </div>
          ) : null}
          {!needle && !unavailable ? (
            <div className="flex flex-col" style={{ gap: 8 }}>
              {recents.length > 0 ? (
                <section>
                  <h2 className="ds-mono" style={{ fontSize: 11, letterSpacing: '0.88px', color: 'var(--muted)', margin: 0, padding: '10px 12px 6px', textTransform: 'uppercase' }}>
                    Recent
                  </h2>
                  <ul className="flex flex-col" style={{ gap: 2 }}>
                    {recents.map((hit) => {
                      cursor += 1;
                      const index = cursor;
                      return (
                        <ResultRow
                          key={`recent-${hit.kind}-${hit.id}`}
                          hit={forAudience(hit, isStaff)}
                          index={index}
                          selected={index === active}
                          intent={intent}
                          narrow={narrow}
                          staff={isStaff}
                          onHover={() => activate(index, 'hover')}
                          onChoose={() => choose(hit)}
                        />
                      );
                    })}
                  </ul>
                </section>
              ) : null}
              <section>
                <h2 className="ds-mono" style={{ fontSize: 11, letterSpacing: '0.88px', color: 'var(--muted)', margin: 0, padding: '10px 12px 6px', textTransform: 'uppercase' }}>
                  Quick links
                </h2>
                <div className="flex flex-wrap gap-2" style={{ padding: '0 12px 4px' }}>
                  {QUICK_LINKS.map((link) => {
                    cursor += 1;
                    const index = cursor;
                    const selected = index === active;
                    return (
                      <button
                        key={link.id}
                        type="button"
                        role="option"
                        id={`search-hit-${index}`}
                        aria-selected={selected}
                        onMouseEnter={() => activate(index, 'hover')}
                        onClick={() => chooseLink(link.tab)}
                        className="ds-mono inline-flex items-center gap-1.5"
                        style={{
                          borderRadius: 999,
                          border: '1px solid var(--border-2)',
                          background: selected && intent !== 'hover' ? 'var(--surface-2)' : 'transparent',
                          boxShadow: selected && intent === 'keyboard' ? 'inset 0 0 0 2px var(--border)' : undefined,
                          color: 'var(--fg)',
                          fontSize: 12,
                          padding: '6px 12px',
                          cursor: 'pointer',
                        }}
                      >
                        <LinkGlyph icon={link.icon} />
                        {link.label}
                      </button>
                    );
                  })}
                </div>
              </section>
            </div>
          ) : null}
          {needle && !showSkeleton && !empty && !unavailable ? (
            <div className="flex flex-col" style={{ gap: 8 }}>
              {GROUPS.map((group) => {
                if (scope !== 'all' && scope !== group.key) return null;
                const hits = scoped[group.key];
                if (hits.length === 0) return null;
                const visible = expanded[group.key] ? hits : hits.slice(0, GROUP_CAP);
                return (
                  <section key={group.key}>
                    <h2 className="ds-mono" style={{ fontSize: 11, letterSpacing: '0.88px', color: 'var(--muted)', margin: 0, padding: '10px 12px 6px', textTransform: 'uppercase' }}>
                      {group.label}
                    </h2>
                    <ul className="flex flex-col" style={{ gap: 2 }}>
                      {visible.map((hit) => {
                        cursor += 1;
                        const index = cursor;
                        return (
                          <ResultRow
                            key={`${hit.kind}-${hit.id}`}
                            hit={forAudience(hit, isStaff)}
                            index={index}
                            selected={index === active}
                            intent={intent}
                            narrow={narrow}
                            staff={isStaff}
                            onHover={() => activate(index, 'hover')}
                            onChoose={() => choose(hit)}
                          />
                        );
                      })}
                    </ul>
                    {hits.length > GROUP_CAP && !expanded[group.key] ? (
                      <button
                        type="button"
                        className="ds-mono"
                        onClick={() => setExpanded((current) => ({ ...current, [group.key]: true }))}
                        style={{
                          margin: '2px 12px 0',
                          padding: '4px 0',
                          border: 0,
                          background: 'transparent',
                          color: 'var(--muted)',
                          fontSize: 12,
                          cursor: 'pointer',
                        }}
                      >
                        Show all {hits.length}
                      </button>
                    ) : null}
                  </section>
                );
              })}
            </div>
          ) : null}
          {narrow ? (
            <div
              aria-hidden
              style={{
                pointerEvents: 'none',
                position: 'sticky',
                bottom: 0,
                height: 28,
                marginTop: -28,
                background: 'linear-gradient(to bottom, transparent, var(--surface))',
              }}
            />
          ) : null}
        </div>
        <div style={{ height: 1, background: 'var(--border)', flex: '0 0 auto' }} />
        <div className="flex items-center gap-4" style={{ padding: narrow ? '14px 20px' : '14px 20px' }}>
          {narrow ? (
            <span className="ds-mono" style={{ fontSize: 11, color: 'var(--muted)' }}>Tap a result to open</span>
          ) : (
            <div className="flex items-center gap-4">
              <span className="inline-flex items-center gap-1.5"><Kbd>↑↓</Kbd><span className="ds-mono" style={{ fontSize: 11, color: 'var(--muted)' }}>Move</span></span>
              <span className="inline-flex items-center gap-1.5"><Kbd>↵</Kbd><span className="ds-mono" style={{ fontSize: 11, color: 'var(--muted)' }}>Open</span></span>
              <span className="inline-flex items-center gap-1.5"><Kbd>Esc</Kbd><span className="ds-mono" style={{ fontSize: 11, color: 'var(--muted)' }}>Close</span></span>
            </div>
          )}
          <span className="ds-mono ml-auto" style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{countLabel}</span>
        </div>
      </div>
    </div>
  );
}

function ResultRow({
  hit,
  index,
  selected,
  intent,
  narrow,
  staff,
  onHover,
  onChoose,
}: {
  hit: SearchHit;
  index: number;
  selected: boolean;
  intent: Intent;
  narrow: boolean;
  staff: boolean;
  onHover: () => void;
  onChoose: () => void;
}) {
  const showPublish = staff && (hit.kind === 'doc' || hit.kind === 'resource') && typeof hit.published === 'boolean';
  const showStage = hit.kind === 'task' && Boolean(hit.stage);
  const marks = showStage || showPublish ? (
    <span className="inline-flex flex-wrap items-center gap-2">
      {showStage && hit.stage ? (
        <span
          className="ds-mono inline-flex items-center gap-2 whitespace-nowrap"
          style={{
            border: `1px solid ${stageIsDanger(hit.stage) ? 'var(--danger)' : 'var(--border-2)'}`,
            borderRadius: 999,
            padding: '4px 12px',
            fontSize: 11,
            letterSpacing: '0.44px',
            color: stageIsDanger(hit.stage) ? 'var(--danger)' : 'var(--fg)',
          }}
        >
          <TaskGlyph src="/icons/task-stage.svg" size={12} />
          {hit.stage}
        </span>
      ) : null}
      {showPublish ? <PublishMark published={Boolean(hit.published)} /> : null}
    </span>
  ) : null;

  return (
    <li>
      <button
        type="button"
        role="option"
        id={`search-hit-${index}`}
        aria-selected={selected}
        data-kind={hit.kind}
        data-testid="portal-search-row"
        onMouseEnter={onHover}
        onClick={onChoose}
        className="flex w-full items-center gap-3 text-left"
        style={{
          border: 0,
          borderRadius: 18,
          padding: '10px 12px',
          color: 'inherit',
          cursor: 'pointer',
          minWidth: 0,
          ...rowChrome(selected, intent),
        }}
      >
        <span
          className="inline-flex shrink-0 items-center justify-center"
          style={{
            width: 36,
            height: 36,
            borderRadius: 12,
            background: selected && intent !== 'hover' ? 'var(--bg-2)' : 'var(--surface-2)',
            color: 'var(--muted)',
          }}
        >
          <TaskGlyph src={hitIcon(hit)} size={16} />
        </span>
        <span className="min-w-0 flex-1">
          <span
            className="block"
            style={{
              fontSize: 14,
              fontWeight: 500,
              lineHeight: '21px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: narrow ? 'normal' : 'nowrap',
              display: narrow ? '-webkit-box' : 'block',
              WebkitLineClamp: narrow ? 2 : undefined,
              WebkitBoxOrient: narrow ? 'vertical' : undefined,
            }}
          >
            {hit.title}
          </span>
          <span className="ds-mono flex min-w-0" style={{ fontSize: 12, lineHeight: '18px', color: 'var(--muted)' }}>
            <span className="shrink-0">{hit.metaType || hit.subtitle}</span>
            {hit.metaWhen ? <span className="shrink-0">{`${META_SEP}${hit.metaWhen}`}</span> : null}
            {hit.metaProject ? <span className="min-w-0 truncate">{`${META_SEP}${hit.metaProject}`}</span> : null}
          </span>
          {narrow && marks ? <span className="mt-1 flex flex-wrap">{marks}</span> : null}
        </span>
        {!narrow ? marks : null}
        <span style={{ color: 'var(--muted)' }}>
          <TaskGlyph src="/icons/docs-chev.svg" size={16} />
        </span>
      </button>
    </li>
  );
}
