'use client';

import { useEffect, useRef, useState } from 'react';
import { useLayout, type StyleGuideTab } from '@/components/providers/LayoutProvider';
import { useScrollObserver } from '@/hooks/useScrollObserver';
import { useSwipeTabs } from '@/hooks/useSwipeTabs';
import { BrandPanel } from '@/components/pages/styleguide/BrandPanel';
import { WebsitePanel } from '@/components/pages/styleguide/WebsitePanel';
import { PortalPanel } from '@/components/pages/styleguide/PortalPanel';
import { STYLE_GUIDE_SECTIONS } from '@/components/pages/styleguide/sections';
import { BevelFrame } from '@/components/react/ui/BevelFrame';
import { WarehausLogo } from '@/components/react/ui/WarehausLogo';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';

const TABS: StyleGuideTab[] = ['brand', 'website', 'portal'];

function isStyleGuideTab(value: string | null): value is StyleGuideTab {
  return value === 'brand' || value === 'website' || value === 'portal';
}

/** Sidebar rail bounds (px). The value drives --left-sidebar-w (the content
    reserve); the rail itself renders at that minus the 1.6rem gutter. */
const MIN_RAIL = 200;
const MAX_RAIL = 460;
const DEFAULT_RAIL = 244;

export function StyleGuideContent() {
  const { activeTab, setActiveTab, activeSection } = useLayout();
  // The shared activeTab is widened across surfaces; within this page it is
  // always one of the Style Guide tabs.
  const sgTab: StyleGuideTab = isStyleGuideTab(activeTab) ? activeTab : 'brand';

  const brandRef = useRef<HTMLDivElement>(null);
  const websiteRef = useRef<HTMLDivElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);
  const panelRefs = { brand: brandRef, website: websiteRef, portal: portalRef };

  // Scroll observers — only the active tab writes to context
  useScrollObserver(brandRef, sgTab === 'brand');
  useScrollObserver(websiteRef, sgTab === 'website');
  useScrollObserver(portalRef, sgTab === 'portal');

  // Default the shared tab to the first Style Guide tab on mount when arriving
  // with a pillar tab still active.
  useEffect(() => {
    if (!isStyleGuideTab(activeTab)) setActiveTab('brand');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Shared swipe-tab behavior (settle-debounced, no scroll collisions, panels
  // start from the top, ?tab= sync).
  const scrollRef = useSwipeTabs({
    tabs: TABS,
    active: sgTab,
    setActiveTab,
    panelRefs,
    isValidTab: isStyleGuideTab,
  });

  // Scroll the active panel to a section (sub-nav rail click).
  const scrollToSection = (key: string) => {
    const panel = panelRefs[sgTab]?.current;
    const el = panel?.querySelector<HTMLElement>(`[data-section="${key}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const railSections = STYLE_GUIDE_SECTIONS[sgTab];

  // ── Resizable + collapsible rail ──
  const [railW, setRailW] = useState(DEFAULT_RAIL);
  const [collapsed, setCollapsed] = useState(false);
  const dragRaf = useRef(0);

  // Restore persisted width/collapsed (client-only → no SSR/hydration mismatch).
  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem('sg-rail-w'));
      if (saved >= MIN_RAIL && saved <= MAX_RAIL) setRailW(saved);
      setCollapsed(localStorage.getItem('sg-rail-collapsed') === '1');
    } catch {
      /* localStorage unavailable — use defaults */
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem('sg-rail-w', String(railW));
    } catch {
      /* ignore */
    }
  }, [railW]);
  useEffect(() => {
    try {
      localStorage.setItem('sg-rail-collapsed', collapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  // Drag the right-edge handle to resize. rAF-throttled; clamped to bounds.
  const startRailDrag = (e: React.PointerEvent) => {
    e.preventDefault();
    const onMove = (ev: PointerEvent) => {
      if (dragRaf.current) return;
      dragRaf.current = requestAnimationFrame(() => {
        dragRaf.current = 0;
        // The handle sits just right of the rail edge; clientX tracks the grip.
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
    <div
      className="ds-scope w-full h-[100dvh] overflow-hidden"
      style={{ '--sg-rail-w': collapsed ? '0px' : `${railW}px` } as React.CSSProperties}
    >
      {/* Left sub-nav rail (desktop only). Framed glass: a translucent,
          blurred outer frame (inverted background) rendered as a RING, with a
          separate translucent inner panel that blurs the page directly — the
          frame is knocked out behind the content. */}
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
        inspectorLabel="Sidebar rail"
        aria-label={`${sgTab} sections`}
        className="hidden lg:flex fixed z-[70]"
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
          style={{ padding: 'var(--s-4) var(--s-3)', borderBottom: '1px solid var(--border)', marginBottom: 'var(--s-4)' }}
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
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>
        <p
          className="ds-mono"
          style={{ fontSize: 'var(--t-xs)', textTransform: 'uppercase', letterSpacing: '0.16em', color: 'var(--muted)', marginBottom: 'var(--s-2)' }}
        >
          {sgTab}
        </p>
        {railSections.map((s) => {
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
                background: active ? 'color-mix(in oklab, var(--fg) 8%, transparent)' : 'transparent',
                borderColor: active ? 'color-mix(in oklab, var(--fg) 14%, transparent)' : 'transparent',
                borderWidth: 1,
              }}
            >
              {s.label}
            </button>
          );
        })}
      </BevelFrame>

      {/* Drag-to-resize handle just outside the rail's right edge. A wide,
          transparent hover/drag zone sits near the edge; the grip itself is
          offset right (clear of the surface) and only reveals on hover. */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        onPointerDown={startRailDrag}
        className="hidden lg:block fixed z-[71] group"
        style={{
          top: 'var(--sidebar-inset, 1.1rem)',
          bottom: '1.75rem',
          left: 'calc(var(--sidebar-inset, 1.1rem) + var(--left-sidebar-w, 244px) - 1.6rem - 2px)',
          width: 24,
          cursor: 'col-resize',
          touchAction: 'none',
        }}
      >
        <span className="absolute left-2.5 top-1/4 bottom-1/4 w-[3px] rounded-full bg-[var(--border-2)] opacity-0 transition-opacity duration-150 group-hover:opacity-100" />
      </div>
        </>
      )}

      {/* Collapsed: floating expand button in the rail's place. */}
      {collapsed && (
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          aria-label="Expand sidebar"
          title="Expand sidebar"
          className="hidden lg:flex fixed z-[71] items-center justify-center transition-opacity hover:opacity-80"
          style={{
            top: 'var(--sidebar-inset, 1.1rem)',
            left: 'var(--sidebar-inset, 1.1rem)',
            width: 40,
            height: 40,
            borderRadius: 12,
            background: 'var(--nav-bg)',
            border: '1px solid var(--border)',
            color: 'var(--fg)',
            backdropFilter: 'blur(12px)',
          }}
        >
          <PanelLeftOpen className="w-4 h-4" />
        </button>
      )}

      <div
        ref={scrollRef}
        className="flex h-full overflow-x-auto snap-x snap-mandatory scrollbar-none overscroll-x-contain"
        style={{ scrollbarWidth: 'none', willChange: 'scroll-position' }}
      >
        {TABS.map((tab) => (
          <div
            key={tab}
            id={`tabpanel-${tab}`}
            role="tabpanel"
            aria-labelledby={`tab-${tab}`}
            ref={panelRefs[tab]}
            className="h-full overflow-y-auto shrink-0 w-screen snap-start"
          >
            {tab === 'brand' && <BrandPanel />}
            {tab === 'website' && <WebsitePanel />}
            {tab === 'portal' && <PortalPanel />}
          </div>
        ))}
      </div>
    </div>
  );
}
