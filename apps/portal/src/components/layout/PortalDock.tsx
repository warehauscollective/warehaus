'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Menu, MessageCircle } from 'lucide-react';
import { PORTAL_TABS, type PortalTab } from '@warehaus/logic/portal';
import { PORTAL_TAB_ICONS } from '@/lib/data/tabIcons';
import { usePortalTab } from '@/components/providers/PortalTabProvider';

/**
 * Portal floating dock — same chrome paradigm as the website BottomNav.
 * Tabs call into PortalTabProvider (swipe shell) instead of hard navigations,
 * so left/right swipe and dock clicks stay one continuous surface.
 *
 * Below `lg`: icon-only tabs so all five fit. `lg+`: full word labels.
 */
export function PortalDock() {
  const { activeTab, setActiveTab } = usePortalTab();
  const [iconMode, setIconMode] = useState(true);

  const navRef = useRef<HTMLElement>(null);
  const tabRefs = useRef<Map<PortalTab, HTMLButtonElement>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);
  const [indicators, setIndicators] = useState<Map<PortalTab, { center: number }>>(
    new Map(),
  );

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    const sync = () => setIconMode(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const updatePositions = useCallback(() => {
    if (!containerRef.current || !rowRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const rowRect = rowRef.current.getBoundingClientRect();

    const el = tabRefs.current.get(activeTab);
    if (el) {
      const tabRect = el.getBoundingClientRect();
      setPill({
        left: tabRect.left - rowRect.left,
        width: tabRect.width,
      });
    }

    const next = new Map<PortalTab, { center: number }>();
    tabRefs.current.forEach((btn, tab) => {
      const r = btn.getBoundingClientRect();
      next.set(tab, { center: r.left - containerRect.left + r.width / 2 });
    });
    setIndicators(next);
  }, [activeTab]);

  useEffect(() => {
    updatePositions();
    const timer = setTimeout(updatePositions, 50);
    return () => clearTimeout(timer);
  }, [updatePositions, iconMode]);

  useEffect(() => {
    window.addEventListener('resize', updatePositions);
    return () => window.removeEventListener('resize', updatePositions);
  }, [updatePositions]);

  return (
    <nav
      ref={navRef}
      className="fixed left-1/2 z-50 flex w-[calc(100vw-1.25rem)] max-w-[calc(100vw-0.75rem)] -translate-x-1/2 items-center justify-center gap-1.5 px-2 pt-3 sm:gap-2 sm:px-3 md:w-auto md:px-4"
      style={{ bottom: '1.25rem' }}
      aria-label="Portal navigation"
    >
      <button
        type="button"
        aria-label="Open menu"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl backdrop-blur-2xl sm:h-12 sm:w-12 lg:h-14 lg:w-14 lg:rounded-3xl"
        style={{
          background: 'var(--nav-bg)',
          borderColor: 'var(--nav-border)',
          borderWidth: 1,
          color: 'var(--nav-text)',
        }}
      >
        <Menu className="h-5 w-5" />
      </button>

      <div
        ref={containerRef}
        role="tablist"
        aria-label="Portal sections"
        className="relative flex min-w-0 flex-1 flex-col items-center rounded-2xl p-[2px] backdrop-blur-2xl lg:min-w-[400px] lg:flex-none lg:rounded-3xl"
        style={{
          background: 'var(--nav-bg)',
          borderColor: 'var(--nav-border)',
          borderWidth: 1,
        }}
      >
        {PORTAL_TABS.map(({ value }) => {
          const isActive = value === activeTab;
          const pos = indicators.get(value);
          const w = isActive ? (iconMode ? 28 : 56) : 10;
          return (
            <div
              key={`indicator-${value}`}
              className="pointer-events-none absolute -top-3"
              style={{
                left: pos ? `${pos.center - w / 2}px` : '50%',
                width: `${w}px`,
                transition:
                  'left 200ms cubic-bezier(0.4, 0, 0.2, 1), width 200ms cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            >
              <div
                className="h-[5px] w-full rounded-full"
                style={{
                  background: isActive
                    ? 'var(--nav-text-active)'
                    : 'var(--nav-text-muted)',
                }}
              />
            </div>
          );
        })}

        <div ref={rowRef} className="relative flex w-full items-stretch">
          {pill && (
            <div
              className="pointer-events-none absolute top-0 bottom-0 rounded-[13px] lg:rounded-[21px]"
              style={{
                left: `${pill.left}px`,
                width: `${pill.width}px`,
                background: 'var(--nav-pill-bg)',
                borderColor: 'var(--nav-pill-border)',
                borderWidth: 1,
                transition:
                  'left 300ms cubic-bezier(0.4, 0, 0.2, 1), width 300ms cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            />
          )}

          {PORTAL_TABS.map(({ label, value }) => {
            const isActive = value === activeTab;
            const Icon = PORTAL_TAB_ICONS[value];
            return (
              <button
                key={value}
                type="button"
                id={`tab-${value}`}
                ref={(el) => {
                  if (el) tabRefs.current.set(value, el);
                }}
                role="tab"
                aria-selected={isActive}
                aria-controls={`tabpanel-${value}`}
                aria-label={label}
                title={label}
                onClick={() => setActiveTab(value)}
                className="relative z-10 flex min-w-0 flex-1 items-center justify-center rounded-xl px-1 py-3 sm:px-2 sm:py-3.5 lg:min-w-[96px] lg:px-6 lg:py-5"
                style={{
                  fontFamily: 'var(--font-display)',
                  color: isActive ? 'var(--nav-text-inverse)' : 'var(--nav-text-muted)',
                }}
              >
                <Icon className="h-5 w-5 lg:hidden" strokeWidth={isActive ? 2.25 : 1.75} />
                <span className="hidden text-xs font-black tracking-widest leading-none whitespace-nowrap lg:block lg:text-sm [text-box:trim-both_cap_alphabetic]">
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        aria-label="Open chat"
        className="text-accent flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl backdrop-blur-2xl sm:h-12 sm:w-12 lg:h-14 lg:w-14 lg:rounded-3xl"
        style={{
          background: 'var(--nav-bg)',
          borderColor: 'var(--nav-border)',
          borderWidth: 1,
        }}
      >
        <MessageCircle className="h-5 w-5" />
      </button>
    </nav>
  );
}
