'use client';

import { useRef } from 'react';
import { useLayout, type PillarTab } from '@/components/providers/LayoutProvider';
import { useScrollObserver } from '@/hooks/useScrollObserver';
import { useSwipeTabs } from '@/hooks/useSwipeTabs';
import { DreamContent } from '@/components/pages/DreamContent';
import { DesignContent } from '@/components/pages/DesignContent';
import { DevelopContent } from '@/components/pages/DevelopContent';
import { LoadingScreen } from '@/components/layout/LoadingScreen';

const TABS: PillarTab[] = ['dream', 'design', 'develop'];

function isPillarTab(value: string | null): value is PillarTab {
  return value === 'dream' || value === 'design' || value === 'develop';
}

export function HomeContent() {
  const { activeTab, setActiveTab } = useLayout();
  // The shared activeTab is widened across surfaces; on the home page it is
  // always one of the pillar tabs.
  const pillarTab: PillarTab = isPillarTab(activeTab) ? activeTab : 'dream';

  const dreamRef = useRef<HTMLDivElement>(null);
  const designRef = useRef<HTMLDivElement>(null);
  const developRef = useRef<HTMLDivElement>(null);
  const panelRefs = { dream: dreamRef, design: designRef, develop: developRef };

  // Scroll observers — only the active tab writes to context
  useScrollObserver(dreamRef, pillarTab === 'dream');
  useScrollObserver(designRef, pillarTab === 'design');
  useScrollObserver(developRef, pillarTab === 'develop');

  // Shared swipe-tab behavior (settle-debounced, no scroll collisions, panels
  // start from the top, ?tab= sync).
  const scrollRef = useSwipeTabs({
    tabs: TABS,
    active: pillarTab,
    setActiveTab,
    panelRefs,
    isValidTab: isPillarTab,
  });

  return (
    <div className="w-full h-[100dvh] overflow-hidden">
      <LoadingScreen />
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
            {tab === 'dream' && <DreamContent />}
            {tab === 'design' && <DesignContent />}
            {tab === 'develop' && <DevelopContent />}
          </div>
        ))}
      </div>
    </div>
  );
}
