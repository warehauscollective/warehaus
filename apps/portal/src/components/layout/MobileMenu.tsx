'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { usePathname } from 'next/navigation';
import type { PortalTab } from '@warehaus/logic/portal';
import { TaskGlyph } from '@/components/tasks/TaskGlyph';
import { usePortalView } from '@/components/providers/PortalViewProvider';
import { usePortalData } from '@/hooks/usePortalData';
import { useFixturePreview } from '@/components/providers/FixturePreviewProvider';
import { useSafeQuery } from '@/hooks/useSafeQuery';
import { api } from '@convex/_generated/api';
import { getHostSlugFromLocation } from '@/lib/auth/host-slug';
import { isConvexConfigured } from '@/lib/convex/client';
import { FIXTURE_NOTICES } from '@/lib/data/fixtures';
import { dialogTabBoundary, isolateOutsideDialog } from '@/components/projects/milestoneGuards';
import { findPageScroller, headerBorderFromScroll } from './headerScroll';
import type { PortalSidebarSection } from '@/lib/data/sidebarSections';

/** Shown only while the menu search field is focused. */
export const SEARCH_RESULTS_HINT = 'Enter opens the existing search results.';

/** Project menu chips. The desktop rail keeps every section; the sheet does not add a shipped chip. */
export function projectMenuChips(sections: readonly PortalSidebarSection[]): PortalSidebarSection[] {
  return sections.filter((section) => section.key !== 'shipped');
}

/** Close, search, the chips that are actually shown, then Notifications for staff. */
export function menuFocusIds(staff: boolean, chips: readonly { key: string }[]): string[] {
  return ['menu-close', 'menu-search', ...chips.map((chip) => `menu-chip-${chip.key}`), ...(staff ? ['menu-notifications'] : [])];
}

function unreadLabel(count: number): string {
  const shown = count > 99 ? '99+' : String(count);
  return count === 1 ? `Menu, ${shown} unread notification` : `Menu, ${shown} unread notifications`;
}

/**
 * Phone header from the menu spec: wordmark and a ghost Menu control.
 * Search, the current tab’s filters, and staff notifications live in the sheet.
 */
export function MobileMenu({
  tab,
  sections,
  activeSection,
  onSelect,
}: {
  tab: PortalTab;
  sections: readonly PortalSidebarSection[];
  activeSection: string;
  onSelect: (key: string) => void;
}) {
  const { data } = usePortalData();
  const { openProjectId } = usePortalView();
  const fixtures = useFixturePreview();
  const staff = data.tenant.mode === 'team';
  const configured = isConvexConfigured();
  const hostSlug = typeof window !== 'undefined' ? getHostSlugFromLocation() ?? undefined : undefined;
  const enabled = configured && staff && !fixtures && data.tenant.ok;
  const notices = useSafeQuery<Array<{ unread: boolean }>>(
    api.invitesSync.listStaffNotices,
    enabled ? { hostSlug } : 'skip',
  );
  const unread = !staff
    ? 0
    : fixtures
      ? FIXTURE_NOTICES.filter((row) => row.unread).length
      : (notices.data ?? []).filter((row) => row.unread).length;
  const chips = tab === 'projects' ? projectMenuChips(sections) : sections.filter((section) => section.key !== 'shipped');
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLButtonElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const pushed = useRef(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();
  const scrollTops = useRef(new WeakMap<EventTarget, number>());

  useEffect(() => {
    const header = headerRef.current;
    const panel = header?.closest('[role="tabpanel"]');
    if (!panel) return;
    const marked = Array.from(panel.querySelectorAll<HTMLElement>('[data-page-scroll]'));
    const scroller = findPageScroller(marked);
    for (const node of marked) scrollTops.current.set(node, node.scrollTop);
    setScrolled((scroller?.scrollTop ?? 0) > 0);
    const onScroll = (event: Event) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      const scrollTop = target?.scrollTop ?? 0;
      const next = headerBorderFromScroll({
        eventTarget: target,
        scrollTop,
        previousScrollTop: target ? scrollTops.current.get(target) ?? null : null,
      });
      if (target?.hasAttribute('data-page-scroll')) scrollTops.current.set(target, scrollTop);
      if (next == null) return;
      setScrolled(next);
    };
    const options = { capture: true, passive: true } as const;
    panel.addEventListener('scroll', onScroll, options);
    return () => panel.removeEventListener('scroll', onScroll, options);
  }, [pathname, openProjectId]);

  const close = (fromPop: boolean) => {
    setOpen(false);
    if (!fromPop && pushed.current) {
      pushed.current = false;
      history.back();
    } else {
      pushed.current = false;
    }
    window.requestAnimationFrame(() => menuRef.current?.focus());
  };

  const openSheet = () => {
    setOpen(true);
    if (!pushed.current) {
      history.pushState({ whMenu: true }, '');
      pushed.current = true;
    }
  };

  return (
    <>
      <header
        ref={headerRef}
        className="sticky top-0 z-20 flex shrink-0 items-center justify-between lg:hidden"
        style={{
          boxSizing: 'border-box',
          paddingTop: 6,
          paddingBottom: 6,
          minHeight: 56,
          background: 'var(--bg)',
          borderBottom: `1px solid ${scrolled ? 'var(--border)' : 'transparent'}`,
        }}
        data-testid="mobile-app-header"
        data-scrolled={scrolled ? 'true' : 'false'}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt="warehaus"
          src="/icons/wordmark.svg"
          width={189}
          height={25.593}
          className="portal-wordmark shrink-0"
        />
        <button
          ref={menuRef}
          type="button"
          className="relative inline-flex items-center justify-center"
          aria-expanded={open}
          aria-controls="menu-sheet"
          aria-label={unread > 0 ? unreadLabel(unread) : 'Menu'}
          data-testid="mobile-menu-button"
          onClick={openSheet}
          style={{
            minWidth: 44,
            minHeight: 44,
            height: 44,
            padding: '12px 16px',
            borderRadius: 9,
            border: 0,
            background: 'transparent',
            color: 'var(--muted)',
            fontFamily: 'var(--font-geist), var(--font-body)',
            fontSize: 14,
            fontWeight: 500,
            lineHeight: 'normal',
            cursor: 'pointer',
          }}
        >
          Menu
          {unread > 0 ? (
            <span
              aria-hidden
              data-testid="menu-unread-dot"
              className="pointer-events-none absolute"
              style={{
                top: 8,
                right: 2,
                width: 10,
                height: 10,
                borderRadius: 999,
                background: 'var(--danger)',
                boxShadow: '0 0 0 2px var(--bg)',
              }}
            />
          ) : null}
        </button>
      </header>

      {open ? (
        <MenuSheetDialog
          staff={staff}
          chips={chips}
          tab={tab}
          activeSection={activeSection}
          unread={unread}
          onDismiss={close}
          onSelect={(key) => {
            onSelect(key);
            close(false);
          }}
          onSearch={(query) => {
            const trigger = menuRef.current;
            close(false);
            window.dispatchEvent(new CustomEvent('wh-open-search', { detail: { trigger, query } }));
          }}
        />
      ) : null}
    </>
  );
}

export function MenuSheetDialog({
  staff,
  chips,
  tab,
  activeSection,
  unread,
  onDismiss,
  onSelect,
  onSearch,
}: {
  staff: boolean;
  chips: readonly { key: string; label: string }[];
  tab: PortalTab;
  activeSection: string;
  unread: number;
  onDismiss: (fromPop: boolean) => void;
  onSelect: (key: string) => void;
  onSearch: (query: string) => void;
}) {
  const titleId = useId();
  const [searchFocused, setSearchFocused] = useState(false);
  const [sheetHeight, setSheetHeight] = useState<number | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    const release = isolateOutsideDialog(sheet);
    const previousOverflow = document.body.style.overflow;
    const scrollY = window.scrollY;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const onPop = () => dismissRef.current(true);
    window.addEventListener('popstate', onPop);
    const viewport = window.visualViewport;
    const fit = () => {
      if (!viewport) return;
      setSheetHeight(viewport.height);
    };
    fit();
    viewport?.addEventListener('resize', fit);
    viewport?.addEventListener('scroll', fit);
    return () => {
      release();
      document.body.style.overflow = previousOverflow;
      window.scrollTo(0, scrollY);
      window.removeEventListener('popstate', onPop);
      viewport?.removeEventListener('resize', fit);
      viewport?.removeEventListener('scroll', fit);
    };
  }, []);

  const onSheetKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      dismissRef.current(false);
      return;
    }
    if (event.key !== 'Tab') return;
    const sheet = sheetRef.current;
    if (!sheet) return;
    const nodes = menuFocusIds(staff, chips)
      .map((id) => sheet.querySelector<HTMLElement>(`#${id}`))
      .filter((node): node is HTMLElement => node != null);
    if (nodes.length === 0) return;
    const boundary = dialogTabBoundary({
      shiftKey: event.shiftKey,
      atFirst: document.activeElement === nodes[0],
      atLast: document.activeElement === nodes[nodes.length - 1],
    });
    if (boundary == null) return;
    event.preventDefault();
    nodes[boundary === 'first' ? 0 : nodes.length - 1]?.focus();
  };

  return (
        <div
          ref={sheetRef}
          id="menu-sheet"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          data-testid="menu-sheet"
          className="menu-sheet fixed inset-x-0 top-0 z-[60] flex flex-col"
          style={{
            height: sheetHeight ?? '100dvh',
            background: 'var(--bg)',
            paddingTop: 'env(safe-area-inset-top)',
            overscrollBehavior: 'contain',
          }}
          onKeyDown={onSheetKey}
        >
          <div
            className="flex shrink-0 items-center justify-between"
            style={{ padding: '6px 16px', borderBottom: '1px solid var(--border)', minHeight: 56 }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt="" src="/icons/wordmark.svg" width={189} height={25.593} className="portal-wordmark shrink-0" />
            <h2 id={titleId} className="sr-only">
              Menu
            </h2>
            <button
              ref={closeRef}
              id="menu-close"
              type="button"
              data-testid="menu-close"
              onClick={() => dismissRef.current(false)}
              className="inline-flex items-center justify-center"
              style={{
                minWidth: 44,
                minHeight: 44,
                height: 44,
                padding: '12px 16px',
                borderRadius: 9,
                border: 0,
                background: 'transparent',
                color: 'var(--muted)',
                fontFamily: 'var(--font-geist), var(--font-body)',
                fontSize: 14,
                fontWeight: 500,
                lineHeight: 'normal',
                cursor: 'pointer',
              }}
            >
              Close
            </button>
          </div>
          <div
            className="flex min-h-0 flex-1 flex-col overflow-y-auto"
            style={{ gap: 32, padding: '24px 16px', overscrollBehavior: 'contain', paddingBottom: 'calc(24px + env(safe-area-inset-bottom))' }}
          >
            <div className="flex flex-col" style={{ gap: 8 }}>
              <p className="ds-mono" style={{ fontSize: 10, lineHeight: '15px', letterSpacing: '0.88px', color: 'var(--muted)' }}>
                SEARCH
              </p>
              <label className="sr-only" htmlFor="menu-search">
                Search projects, milestones, resources
              </label>
              <span
                className="flex items-center"
                style={{
                  height: 52,
                  boxSizing: 'border-box',
                  gap: 12,
                  padding: '0 16px',
                  borderRadius: 16,
                  background: 'var(--surface-2)',
                  border: searchFocused ? '2px solid var(--ring)' : '1px solid var(--border)',
                }}
              >
                <TaskGlyph src="/icons/resource-search.svg" size={16} />
                <input
                  ref={searchRef}
                  id="menu-search"
                  data-testid="menu-search"
                  type="search"
                  enterKeyHint="search"
                  placeholder="Search projects, milestones, resources"
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setSearchFocused(false)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      onSearch(searchRef.current?.value ?? '');
                    }
                  }}
                  style={{
                    flex: '1 1 auto',
                    minWidth: 0,
                    border: 0,
                    outline: 0,
                    background: 'transparent',
                    color: 'var(--fg)',
                    fontFamily: 'var(--font-geist), var(--font-body)',
                    fontSize: 15,
                    lineHeight: '22px',
                    fontWeight: 400,
                  }}
                />
              </span>
              {searchFocused ? (
                <p data-testid="menu-search-hint" style={{ fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: '16px', color: 'var(--muted)' }}>
                  {SEARCH_RESULTS_HINT}
                </p>
              ) : null}
            </div>

            {chips.length > 0 ? (
              <div className="flex flex-col" style={{ gap: 8 }}>
                <p className="ds-mono" style={{ fontSize: 10, lineHeight: '15px', letterSpacing: '0.88px', color: 'var(--muted)' }}>
                  {tab === 'projects' ? 'PROJECTS' : tab.toUpperCase()}
                </p>
                <div className="flex flex-wrap" style={{ gap: 8 }}>
                  {chips.map((section) => {
                    const selected = activeSection === section.key;
                    return (
                      <button
                        key={section.key}
                        id={`menu-chip-${section.key}`}
                        type="button"
                        data-testid={`menu-chip-${section.key}`}
                        aria-pressed={selected}
                        onClick={() => onSelect(section.key)}
                        className="inline-flex items-center justify-center"
                        style={{
                          height: 44,
                          boxSizing: 'border-box',
                          padding: '8px 16px',
                          borderRadius: 999,
                          border: selected ? '1px solid var(--border-2)' : '1px solid var(--border)',
                          background: selected ? 'var(--surface-2)' : 'transparent',
                          color: selected ? 'var(--fg)' : 'var(--muted)',
                          fontFamily: 'var(--font-geist), var(--font-body)',
                          fontSize: 13,
                          fontWeight: 500,
                          lineHeight: 'normal',
                          cursor: 'pointer',
                        }}
                      >
                        {section.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {staff ? (
              <div className="flex flex-col" style={{ gap: 8 }}>
                <p className="ds-mono" style={{ fontSize: 10, lineHeight: '15px', letterSpacing: '0.88px', color: 'var(--muted)' }}>
                  YOU
                </p>
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
                  <button
                    id="menu-notifications"
                    type="button"
                    data-testid="menu-notifications"
                    onClick={() => {
                      window.dispatchEvent(new CustomEvent('wh-open-notices'));
                      dismissRef.current(false);
                    }}
                    className="flex w-full items-center text-left"
                    style={{ minHeight: 56, gap: 12, padding: '0 16px', background: 'transparent', border: 0, color: 'var(--fg)', cursor: 'pointer' }}
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                      <path
                        d="M8 1.5a4 4 0 0 0-4 4V8.2L2.7 10.4a.7.7 0 0 0 .6 1.1h9.4a.7.7 0 0 0 .6-1.1L12 8.2V5.5a4 4 0 0 0-4-4Z"
                        stroke="currentColor"
                        strokeWidth="1.33"
                      />
                      <path d="M6.5 12.5a1.5 1.5 0 0 0 3 0" stroke="currentColor" strokeWidth="1.33" strokeLinecap="round" />
                    </svg>
                    <span style={{ flex: '1 1 auto', fontFamily: 'var(--font-geist), var(--font-body)', fontSize: 15, lineHeight: '22px', fontWeight: 500 }}>
                      Notifications
                    </span>
                    {unread > 0 ? (
                      <span
                        className="ds-mono"
                        data-testid="menu-unread-count"
                        style={{
                          background: 'var(--accent)',
                          color: 'var(--accent-fg)',
                          borderRadius: 999,
                          padding: '2px 8px',
                          fontSize: 11,
                          lineHeight: '16px',
                          fontWeight: 500,
                        }}
                      >
                        {unread > 99 ? '99+' : unread}
                      </span>
                    ) : null}
                    <span className="inline-flex shrink-0" style={{ color: 'var(--muted)' }}>
                      <TaskGlyph src="/icons/menu-arrow.svg" size={16} />
                    </span>
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
  );
}
