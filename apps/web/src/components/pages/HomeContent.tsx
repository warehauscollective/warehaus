'use client';

import { useMemo, useRef } from 'react';
import { SwipeTabView, useSwipeTabs } from '@warehaus/ui';
import { useLayout, type PillarTab } from '@/components/providers/LayoutProvider';
import { useScrollObserver } from '@/hooks/useScrollObserver';
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
  const panelRefs = useMemo(
    () => ({ dream: dreamRef, design: designRef, develop: developRef }),
    [],
  );

  // Scroll observers — only the active tab writes to context
  useScrollObserver(dreamRef, pillarTab === 'dream');
  useScrollObserver(designRef, pillarTab === 'design');
  useScrollObserver(developRef, pillarTab === 'develop');

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
      <SwipeTabView
        tabs={TABS}
        scrollRef={scrollRef}
        panelRefs={panelRefs}
        renderPanel={(tab) => {
          if (tab === 'dream') return <DreamContent />;
          if (tab === 'design') return <DesignContent />;
          return <DevelopContent />;
        }}
      />
    </div>
  );
}
