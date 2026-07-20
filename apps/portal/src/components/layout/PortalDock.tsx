'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, MessageCircle } from 'lucide-react';
import {
  PORTAL_TABS,
  getPortalTabForPath,
  type PortalTab,
} from '@warehaus/logic/portal';

/**
 * Portal floating dock — same chrome paradigm as the website BottomNav,
 * but route-driven (links) so each tab is a real portal destination.
 *
 * Presentational extraction into `@warehaus/ui` comes once the website dock
 * and this component share a stable props contract.
 */
export function PortalDock() {
  const pathname = usePathname();
  const activeTab = getPortalTabForPath(pathname);

  const navRef = useRef<HTMLElement>(null);
  const tabRefs = useRef<Map<PortalTab, HTMLAnchorElement>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);
  const [indicators, setIndicators] = useState<Map<PortalTab, { center: number }>>(
    new Map(),
  );

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
  }, [updatePositions]);

  useEffect(() => {
    window.addEventListener('resize', updatePositions);
    return () => window.removeEventListener('resize', updatePositions);
  }, [updatePositions]);

  return (
    <nav
      ref={navRef}
      className="fixed left-1/2 z-50 flex w-[calc(100vw-1.5rem)] max-w-[calc(100vw-1rem)] -translate-x-1/2 items-center justify-center gap-1.5 px-3 pt-3 md:w-auto md:gap-2 md:px-4"
      style={{ bottom: '1.75rem' }}
      aria-label="Portal navigation"
    >
      <button
        type="button"
        aria-label="Open menu"
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl backdrop-blur-2xl md:h-14 md:w-14 md:rounded-3xl"
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
        className="relative flex min-w-0 max-md:flex-1 flex-col items-center rounded-2xl p-[2px] backdrop-blur-2xl md:min-w-[400px] md:rounded-3xl"
        style={{
          background: 'var(--nav-bg)',
          borderColor: 'var(--nav-border)',
          borderWidth: 1,
        }}
      >
        {PORTAL_TABS.map(({ value }) => {
          const isActive = value === activeTab;
          const pos = indicators.get(value);
          const w = isActive ? 56 : 12;
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
              className="pointer-events-none absolute top-0 bottom-0 rounded-[13px] md:rounded-[21px]"
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

          {PORTAL_TABS.map(({ label, value, href }) => {
            const isActive = value === activeTab;
            return (
              <Link
                key={value}
                href={href}
                ref={(el) => {
                  if (el) tabRefs.current.set(value, el);
                }}
                role="tab"
                aria-selected={isActive}
                className="relative z-10 flex min-w-0 flex-1 items-center justify-center whitespace-nowrap rounded-xl px-2 py-4 text-xs font-black tracking-widest leading-none md:min-w-[96px] md:px-6 md:py-5 md:text-sm"
                style={{
                  fontFamily: 'var(--font-display)',
                  color: isActive ? 'var(--nav-text-inverse)' : 'var(--nav-text-muted)',
                }}
              >
                <span className="block [text-box:trim-both_cap_alphabetic]">{label}</span>
              </Link>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        aria-label="Open chat"
        className="text-accent flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl backdrop-blur-2xl md:h-14 md:w-14 md:rounded-3xl"
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
