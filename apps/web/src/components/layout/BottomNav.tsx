'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { useLayout, type ActiveTab } from '@/components/providers/LayoutProvider';
import { getNavTabsForPath } from '@/lib/data/navTabs';
import { Menu, X, MessageCircle, ChevronDown } from 'lucide-react';

export function BottomNav() {
  const { activeTab, setActiveTab, toggleMenu, menuOpen, toggleChatOverlay, chatOverlayOpen } = useLayout();
  const pathname = usePathname();

  // Tabs are route-aware: the home surface shows the pillars, /style-guide shows
  // Brand/Website/Portal, etc.
  const TABS = getNavTabsForPath(pathname);
  const activeColorClass = TABS.find((t) => t.value === activeTab)?.colorClass ?? 'text-accent';

  // When the route's tab set changes, keep the global active tab valid for it.
  useEffect(() => {
    if (!TABS.some((t) => t.value === activeTab)) {
      setActiveTab(TABS[0].value);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const navRef = useRef<HTMLElement>(null);
  const tabRefs = useRef<Map<ActiveTab, HTMLButtonElement>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);
  const [indicators, setIndicators] = useState<Map<ActiveTab, { center: number }>>(new Map());

  const updatePositions = useCallback(() => {
    if (!containerRef.current || !rowRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const rowRect = rowRef.current.getBoundingClientRect();

    // Update pill position relative to the row
    const el = tabRefs.current.get(activeTab);
    if (el) {
      const tabRect = el.getBoundingClientRect();
      setPill({
        left: tabRect.left - rowRect.left,
        width: tabRect.width,
      });
    }

    // Update indicator positions for all tabs
    const newIndicators = new Map<ActiveTab, { center: number }>();
    tabRefs.current.forEach((btn, tab) => {
      const r = btn.getBoundingClientRect();
      newIndicators.set(tab, { center: r.left - containerRect.left + r.width / 2 });
    });
    setIndicators(newIndicators);
  }, [activeTab]);

  useEffect(() => {
    updatePositions();
    const timer = setTimeout(updatePositions, 50);
    return () => clearTimeout(timer);
  }, [updatePositions]);

  useEffect(() => {
    window.addEventListener('resize', updatePositions);
    return () => window.removeEventListener('resize', updatePositions);
  }, [updatePositions]);

  // Expose nav width as CSS variable for menu overlay
  useEffect(() => {
    if (!navRef.current) return;
    const w = navRef.current.offsetWidth;
    document.documentElement.style.setProperty('--nav-width', `${w}px`);
  });

  return (
    <nav
      ref={navRef}
      className={`fixed left-1/2 -translate-x-1/2 z-50 flex w-[calc(100vw-1.5rem)] md:w-auto max-w-[calc(100vw-1rem)] items-center justify-center gap-1.5 md:gap-2 px-3 md:px-4 pt-3 bg-transparent transition-transform duration-300 ${
        chatOverlayOpen ? 'max-md:translate-y-[calc(100%+2rem)]' : ''
      }`}
      style={{ bottom: '1.75rem' }}
    >
      {/* Menu button */}
      <button
        type="button"
        onClick={toggleMenu}
        aria-label={menuOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={menuOpen}
        className="flex shrink-0 h-12 w-12 md:h-14 md:w-14 items-center justify-center rounded-2xl md:rounded-3xl backdrop-blur-2xl transition-colors"
        style={{ background: 'var(--nav-bg)', borderColor: 'var(--nav-border)', borderWidth: '1px', color: 'var(--nav-text)' }}
      >
        {/* Animated hamburger ↔ close icon (crossfade + rotate) */}
        <span className="relative block h-5 w-5" aria-hidden="true">
          <Menu
            className="absolute inset-0 w-5 h-5"
            style={{
              opacity: menuOpen ? 0 : 1,
              transform: menuOpen ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'opacity 200ms ease, transform 250ms cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          />
          <X
            className="absolute inset-0 w-5 h-5"
            style={{
              opacity: menuOpen ? 1 : 0,
              transform: menuOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
              transition: 'opacity 200ms ease, transform 250ms cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          />
        </span>
      </button>

      {/* Tab slider */}
      <div
        ref={containerRef}
        role="tablist"
        aria-label="Content tabs"
        className="relative flex min-w-0 max-md:flex-1 flex-col items-center rounded-2xl md:rounded-3xl backdrop-blur-2xl p-[2px] md:min-w-[400px]"
        style={{ background: 'var(--nav-bg)', borderColor: 'var(--nav-border)', borderWidth: '1px' }}
      >
        {/* Floating indicators above tabs — positioned per tab */}
        {TABS.map(({ value }) => {
          const isActive = activeTab === value;
          const pos = indicators.get(value);
          const w = isActive ? 56 : 12;
          return (
            <div
              key={`indicator-${value}`}
              className="absolute -top-3 pointer-events-none"
              style={{
                left: pos ? `${pos.center - w / 2}px` : '50%',
                width: `${w}px`,
                transition: 'left 200ms cubic-bezier(0.4, 0, 0.2, 1), width 200ms cubic-bezier(0.4, 0, 0.2, 1), opacity 150ms ease',
              }}
            >
              <div
                className="h-[5px] w-full rounded-full"
                style={{ background: isActive ? 'var(--nav-text-active)' : 'var(--nav-text-muted)' }}
              />
            </div>
          );
        })}

        {/* Tab buttons row */}
        <div ref={rowRef} className="relative flex items-stretch w-full">
          {/* Sliding pill background */}
          {pill && (
            <div
              className="absolute top-0 bottom-0 rounded-[13px] md:rounded-[21px] pointer-events-none"
              data-pill
              style={{
                left: `${pill.left}px`,
                width: `${pill.width}px`,
                background: 'var(--nav-pill-bg)',
                borderColor: 'var(--nav-pill-border)',
                borderWidth: '1px',
                transition: 'left 300ms cubic-bezier(0.4, 0, 0.2, 1), width 300ms cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            />
          )}

          {TABS.map(({ label, value }) => {
            const isActive = activeTab === value;
            return (
              <button
                key={value}
                ref={(el) => { if (el) tabRefs.current.set(value, el); }}
                role="tab"
                aria-selected={isActive}
                aria-controls={`tabpanel-${value}`}
                onClick={() => setActiveTab(value)}
                className="relative z-10 flex flex-1 items-center justify-center min-w-0 md:min-w-[96px] px-2 md:px-6 py-4 md:py-5 text-xs md:text-sm font-black tracking-widest leading-none rounded-xl transition-colors duration-300 font-display whitespace-nowrap"
                style={{ color: isActive ? 'var(--nav-text-inverse)' : 'var(--nav-text-muted)' }}
              >
                {/* text-box trims the line-box leading to the cap height so the
                    all-caps Eurostile sits optically centered (graceful no-op on
                    browsers without text-box support — falls back to leading-none). */}
                <span className="block [text-box:trim-both_cap_alphabetic]">{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Chat button */}
      <button
        type="button"
        onClick={toggleChatOverlay}
        aria-label={chatOverlayOpen ? 'Close chat' : 'Open chat'}
        className={`flex shrink-0 h-12 w-12 md:h-14 md:w-14 items-center justify-center rounded-2xl md:rounded-3xl backdrop-blur-2xl transition-colors ${activeColorClass}`}
        style={{ background: 'var(--nav-bg)', borderColor: 'var(--nav-border)', borderWidth: '1px' }}
      >
        {chatOverlayOpen ? (
          <ChevronDown className="w-5 h-5" />
        ) : (
          <MessageCircle className="w-5 h-5" />
        )}
      </button>
    </nav>
  );
}
