'use client';

import { useEffect, useRef } from 'react';
import { useLayout, type StyleGuideTab } from '@/components/providers/LayoutProvider';
import { useScrollObserver } from '@/hooks/useScrollObserver';
import { useSwipeTabs } from '@/hooks/useSwipeTabs';
import { BrandPanel } from '@/components/pages/styleguide/BrandPanel';
import { WebsitePanel } from '@/components/pages/styleguide/WebsitePanel';
import { PortalPanel } from '@/components/pages/styleguide/PortalPanel';
import { STYLE_GUIDE_SECTIONS } from '@/components/pages/styleguide/sections';
import { BevelFrame } from '@/components/react/ui/BevelFrame';
import { WarehausLogo } from '@/components/react/ui/WarehausLogo';

const TABS: StyleGuideTab[] = ['brand', 'website', 'portal'];

function isStyleGuideTab(value: string | null): value is StyleGuideTab {
  return value === 'brand' || value === 'website' || value === 'portal';
}

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

  return (
    <div className="ds-scope w-full h-[100dvh] overflow-hidden">
      {/* Left sub-nav rail (desktop only). Framed glass: a translucent,
          blurred outer frame (inverted background) rendered as a RING, with a
          separate translucent inner panel that blurs the page directly — the
          frame is knocked out behind the content. */}
      <BevelFrame
        as="nav"
        corners="br"
        radius={1.25}
        cut={3}
        shoulder={0.875}
        frame={{ top: 1, right: 1, bottom: 48, left: 1 }}
        innerFill="var(--nav-bg)"
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
        innerStyle={{ padding: 'var(--s-6) var(--s-5)' }}
      >
        <div
          className="flex items-center"
          style={{ paddingBottom: 'var(--s-5)', borderBottom: '1px solid var(--border)', marginBottom: 'var(--s-4)' }}
        >
          <WarehausLogo height={22} color="var(--fg)" />
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
