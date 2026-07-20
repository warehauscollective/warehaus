'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { getPortalTabForPath } from '@warehaus/logic/portal';
import { BevelFrame } from '@/components/ui/BevelFrame';
import { WarehausLogo } from '@/components/ui/WarehausLogo';
import { PORTAL_SIDEBAR_SECTIONS } from '@/lib/data/sidebarSections';

const MIN_RAIL = 200;
const MAX_RAIL = 460;
const DEFAULT_RAIL = 244;

function scrollToSection(key: string) {
  document
    .querySelector<HTMLElement>(`[data-section="${key}"]`)
    ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
 * Section navigation:
 * - Desktop (lg+): left BevelFrame rail (style-guide pattern)
 * - Mobile / tablet: floating top nav with horizontal section chips
 */
export function PortalSidebar({
  activeSection,
}: {
  activeSection: string;
}) {
  const pathname = usePathname();
  const tab = getPortalTabForPath(pathname);
  const sections = PORTAL_SIDEBAR_SECTIONS[tab];

  const [railW, setRailW] = useState(DEFAULT_RAIL);
  const [collapsed, setCollapsed] = useState(false);
  const dragRaf = useRef(0);

  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem('portal-rail-w'));
      if (saved >= MIN_RAIL && saved <= MAX_RAIL) setRailW(saved);
      setCollapsed(localStorage.getItem('portal-rail-collapsed') === '1');
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('portal-rail-w', String(railW));
    } catch {
      /* ignore */
    }
  }, [railW]);

  useEffect(() => {
    try {
      localStorage.setItem('portal-rail-collapsed', collapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  // Desktop rail width only — mobile uses the top nav (no left reserve).
  useEffect(() => {
    const root = document.documentElement;
    const mq = window.matchMedia('(min-width: 1024px)');
    const sync = () => {
      if (!mq.matches) {
        root.style.setProperty('--portal-rail-w', '0px');
        return;
      }
      root.style.setProperty('--portal-rail-w', collapsed ? '0px' : `${railW}px`);
    };
    sync();
    mq.addEventListener('change', sync);
    return () => {
      mq.removeEventListener('change', sync);
      root.style.removeProperty('--portal-rail-w');
    };
  }, [railW, collapsed]);

  const startRailDrag = (e: React.PointerEvent) => {
    e.preventDefault();
    const onMove = (ev: PointerEvent) => {
      if (dragRaf.current) return;
      dragRaf.current = requestAnimationFrame(() => {
        dragRaf.current = 0;
        setRailW(Math.min(MAX_RAIL, Math.max(MIN_RAIL, ev.clientX)));
      });
    };
    const onUp = () => {
      if (dragRaf.current) {
        cancelAnimationFrame(dragRaf.current);
        dragRaf.current = 0;
      }
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <>
      {/* ── Mobile / tablet: floating top nav ── */}
      <nav
        aria-label={`${tab} sections`}
        className="fixed inset-x-3 top-3 z-[70] flex items-center gap-2 rounded-2xl px-3 py-2 backdrop-blur-2xl lg:hidden"
        style={{
          background: 'var(--nav-bg)',
          border: '1px solid var(--nav-border)',
          boxShadow: '0 8px 32px color-mix(in oklab, var(--ink) 18%, transparent)',
        }}
      >
        <WarehausLogo height={18} color="var(--fg)" className="shrink-0" />
        <span
          className="ds-mono hidden shrink-0 sm:inline"
          style={{
            fontSize: '0.65rem',
            textTransform: 'uppercase',
            letterSpacing: '0.14em',
            color: 'var(--muted)',
          }}
        >
          {tab}
        </span>
        <div
          className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto overscroll-x-contain"
          style={{ scrollbarWidth: 'none' }}
        >
          {sections.map((s) => {
            const active = activeSection === s.key;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => scrollToSection(s.key)}
                aria-current={active ? 'true' : undefined}
                className="shrink-0 whitespace-nowrap transition-colors"
                style={{
                  fontSize: 'var(--t-xs)',
                  fontWeight: active ? 600 : 500,
                  padding: '0.45rem 0.7rem',
                  borderRadius: 999,
                  color: active ? 'var(--nav-text-inverse)' : 'var(--nav-text)',
                  background: active ? 'var(--nav-pill-bg)' : 'transparent',
                  border: active
                    ? '1px solid var(--nav-pill-border)'
                    : '1px solid transparent',
                }}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </nav>

      {/* ── Desktop: left BevelFrame rail ── */}
      {!collapsed && (
        <>
          <BevelFrame
            as="nav"
            corners="br"
            innerCorners="bl"
            radius={2.25}
            cut={3.75}
            shoulder={1}
            frame={{ top: 1, right: 1, bottom: 48, left: 1 }}
            innerFill="var(--nav-bg)"
            inspectorLabel="Portal sidebar"
            aria-label={`${tab} sections`}
            className="fixed z-[70] hidden lg:flex"
            style={{
              position: 'fixed',
              top: 'var(--sidebar-inset, 1.1rem)',
              left: 'var(--sidebar-inset, 1.1rem)',
              bottom: '1.75rem',
              width: 'calc(var(--left-sidebar-w, 244px) - 1.6rem)',
            }}
            innerClassName="flex flex-col gap-1 overflow-y-auto overscroll-contain"
            innerStyle={{ padding: 'var(--s-3)' }}
          >
            <div
              className="flex items-center justify-between"
              style={{
                padding: 'var(--s-4) var(--s-3)',
                borderBottom: '1px solid var(--border)',
                marginBottom: 'var(--s-4)',
              }}
            >
              <WarehausLogo height={22} color="var(--fg)" />
              <button
                type="button"
                onClick={() => setCollapsed(true)}
                aria-label="Collapse sidebar"
                title="Collapse sidebar"
                className="flex items-center justify-center transition-opacity hover:opacity-70"
                style={{ width: 28, height: 28, borderRadius: 8, color: 'var(--muted)' }}
              >
                <PanelLeftClose className="h-4 w-4" />
              </button>
            </div>
            <p
              className="ds-mono"
              style={{
                fontSize: 'var(--t-xs)',
                textTransform: 'uppercase',
                letterSpacing: '0.16em',
                color: 'var(--muted)',
                marginBottom: 'var(--s-2)',
              }}
            >
              {tab}
            </p>
            {sections.map((s) => {
              const active = activeSection === s.key;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => scrollToSection(s.key)}
                  aria-current={active ? 'true' : undefined}
                  className="text-left transition-colors"
                  style={{
                    fontSize: 'var(--t-sm)',
                    padding: '0.6rem 0.8rem',
                    borderRadius: 12,
                    color: active ? 'var(--fg)' : 'var(--muted)',
                    background: active
                      ? 'color-mix(in oklab, var(--fg) 8%, transparent)'
                      : 'transparent',
                    borderColor: active
                      ? 'color-mix(in oklab, var(--fg) 14%, transparent)'
                      : 'transparent',
                    borderWidth: 1,
                  }}
                >
                  {s.label}
                </button>
              );
            })}
          </BevelFrame>

          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize sidebar"
            onPointerDown={startRailDrag}
            className="group fixed z-[71] hidden lg:block"
            style={{
              top: 'var(--sidebar-inset, 1.1rem)',
              bottom: '1.75rem',
              left: 'calc(var(--sidebar-inset, 1.1rem) + var(--left-sidebar-w, 244px) - 1.6rem - 2px)',
              width: 24,
              cursor: 'col-resize',
              touchAction: 'none',
            }}
          >
            <span className="absolute top-1/4 bottom-1/4 left-2.5 w-[3px] rounded-full bg-[var(--border-2)] opacity-0 transition-opacity duration-150 group-hover:opacity-100" />
          </div>
        </>
      )}

      {collapsed && (
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          aria-label="Expand sidebar"
          title="Expand sidebar"
          className="fixed z-[71] hidden flex-row items-center gap-3 transition-opacity hover:opacity-80 lg:flex"
          style={{
            top: 'var(--sidebar-inset, 1.1rem)',
            left: 'var(--sidebar-inset, 1.1rem)',
            padding: '10px 14px',
            borderRadius: 14,
            background: 'var(--nav-bg)',
            border: '1px solid var(--border)',
            color: 'var(--fg)',
            backdropFilter: 'blur(12px)',
          }}
        >
          <WarehausLogo height={20} color="var(--fg)" />
          <span className="block h-5 w-px" style={{ background: 'var(--border)' }} />
          <PanelLeftOpen className="h-4 w-4" style={{ color: 'var(--muted)' }} />
        </button>
      )}
    </>
  );
}
