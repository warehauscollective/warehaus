'use client';

import { memo, useEffect, useRef } from 'react';
import { useLayout, type ActiveTab } from '@/components/providers/LayoutProvider';
import { useScrollObserver } from '@/hooks/useScrollObserver';
import { useSwipeTabs } from '@/hooks/useSwipeTabs';
import { Bevel } from '@/components/react/ui/Bevel';
import { WORLDS, type World, type WorldKey } from '@/lib/data/worlds';
import { Card, DsButton, Eyebrow, Section, SectionHead, Wrap } from '@/components/pages/styleguide/_shared';

const TABS: WorldKey[] = ['dream', 'design', 'develop'];

function isWorldTab(value: string | null): value is WorldKey {
  return value === 'dream' || value === 'design' || value === 'develop';
}

/** The sub-nav rail entries for one world tab. */
function worldSections(k: WorldKey) {
  return [
    { key: `${k}-overview`, label: 'Overview' },
    { key: `${k}-subjects`, label: 'Subjects' },
    { key: `${k}-architecture`, label: 'Architecture' },
    { key: `${k}-characters`, label: 'Characters' },
    { key: `${k}-atmosphere`, label: 'Atmosphere' },
    { key: `${k}-forbidden`, label: 'Forbidden' },
    { key: `${k}-palette`, label: 'Palette' },
  ];
}

/** One world's full content — overview, the five vocab columns, and its palette. */
function WorldPanel({ world }: { world: World }) {
  const k = world.key;
  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      {/* Overview */}
      <Section id={`${k}-overview`} pad={false} style={{ paddingBlock: 'clamp(3.5rem, 2rem + 8vw, 7rem)' }}>
        <Wrap>
          <div className="flex items-baseline" style={{ gap: 'var(--s-4)' }}>
            <span className="font-display" style={{ fontStyle: 'italic', fontWeight: 900, fontSize: 'var(--t-2xl)', lineHeight: 0.85, color: world.accent, letterSpacing: '-0.04em', flex: 'none' }}>{world.num}</span>
            <Eyebrow style={{ color: world.accent }}>{world.kick}</Eyebrow>
          </div>
          <h1
            className="font-display"
            style={{ fontStyle: 'italic', fontWeight: 900, fontSize: 'var(--t-3xl)', lineHeight: 0.95, letterSpacing: '-0.03em', textTransform: 'uppercase', color: world.accent, marginTop: 'var(--s-3)' }}
          >
            {world.name}
          </h1>
          <p
            className="font-display"
            style={{ fontStyle: 'italic', fontWeight: 700, fontSize: 'clamp(1.25rem,2.6vw,1.75rem)', lineHeight: 1.2, maxWidth: '26ch', marginTop: 'var(--s-5)' }}
          >
            {world.tag}
          </p>
          <p className="ds-lead" style={{ marginTop: 'var(--s-5)', maxWidth: '70ch' }}>{world.prose}</p>
          <div className="flex flex-wrap gap-2" style={{ marginTop: 'var(--s-6)' }}>
            <DsButton variant="secondary" as="a" href="/style-guide?tab=brand">← Back to Brand</DsButton>
          </div>
        </Wrap>
      </Section>

      {/* Vocabulary columns — one section each */}
      {world.vocab.map((vc) => (
        <Section key={vc.lab} id={`${k}-${vc.lab.toLowerCase()}`}>
          <Wrap>
            <SectionHead title={vc.lab} pill={vc.forbid ? 'never — wrong world' : undefined} />
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))' }}>
              {vc.items.map((it) => (
                <Card key={it} cut={24} shoulder={9} padding="var(--s-5)" style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-3)' }}>
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: vc.forbid ? 'var(--faint)' : world.accent, flex: 'none' }} />
                  <span style={{ fontSize: 'var(--t-sm)', color: vc.forbid ? 'var(--faint)' : 'var(--fg)', textDecoration: vc.forbid ? 'line-through' : undefined }}>{it}</span>
                </Card>
              ))}
            </div>
          </Wrap>
        </Section>
      ))}

      {/* Palette */}
      <Section id={`${k}-palette`}>
        <Wrap>
          <SectionHead title="Palette" pill="pillar tokens" />
          <div className="flex flex-wrap" style={{ gap: 'var(--s-4)' }}>
            {world.palette.map((c) => (
              <div key={c.nm} className="flex flex-col" style={{ gap: 8, width: 128 }}>
                <Bevel corners="br" cut={22} shoulder={8} clip fill="var(--surface)" stroke="var(--border)">
                  <div style={{ height: 84, background: c.value }} />
                </Bevel>
                <span style={{ fontSize: 'var(--t-xs)', color: 'var(--fg)' }}>{c.nm}</span>
                <span className="ds-mono" style={{ fontSize: 11, color: 'var(--muted)' }}>{c.token}</span>
              </div>
            ))}
          </div>
          <div className="flex" style={{ marginTop: 'var(--s-7)', gap: 'var(--s-3)' }}>
            <DsButton variant="secondary" as="a" href="/style-guide?tab=brand">← Back to Brand</DsButton>
          </div>
        </Wrap>
      </Section>
    </div>
  );
}

// Memoized so a tab/section state change in the parent doesn't re-render all
// three heavy world panels mid-/post-swipe (each `world` reference is stable).
const MemoWorldPanel = memo(WorldPanel);

export function WorldsContent() {
  const { activeTab, setActiveTab, activeSection } = useLayout();
  const world: WorldKey = isWorldTab(activeTab) ? activeTab : 'dream';

  const dreamRef = useRef<HTMLDivElement>(null);
  const designRef = useRef<HTMLDivElement>(null);
  const developRef = useRef<HTMLDivElement>(null);
  const panelRefs = { dream: dreamRef, design: designRef, develop: developRef };

  useScrollObserver(dreamRef, world === 'dream');
  useScrollObserver(designRef, world === 'design');
  useScrollObserver(developRef, world === 'develop');

  // Default to the first world if arriving with a non-world tab active.
  useEffect(() => {
    if (!isWorldTab(activeTab)) setActiveTab('dream' as ActiveTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Shared swipe-tab behavior (settle-debounced, no scroll collisions, panels
  // start from the top, ?tab= sync).
  const scrollRef = useSwipeTabs({
    tabs: TABS,
    active: world,
    setActiveTab,
    panelRefs,
    isValidTab: isWorldTab,
  });

  const railSections = worldSections(world);
  const activeWorld = WORLDS.find((w) => w.key === world) ?? WORLDS[0];

  return (
    <div className="ds-scope w-full h-[100dvh] overflow-hidden">
      {/* Per-world sub-nav rail (desktop) */}
      <nav
        aria-label={`${world} sections`}
        className="hidden lg:flex flex-col gap-1 fixed z-[70] overflow-y-auto overscroll-contain backdrop-blur-2xl"
        style={{
          top: 'var(--sidebar-inset, 1.1rem)',
          left: 'var(--sidebar-inset, 1.1rem)',
          bottom: '1.75rem',
          width: 'calc(var(--left-sidebar-w, 244px) - 1.6rem)',
          padding: 'var(--s-6) var(--s-5)',
          background: 'var(--nav-bg)',
          border: '1px solid var(--nav-border)',
          borderRadius: '1rem',
        }}
      >
        <div className="flex items-center gap-3" style={{ paddingBottom: 'var(--s-5)', borderBottom: '1px solid var(--nav-border)', marginBottom: 'var(--s-4)' }}>
          <span aria-hidden style={{ width: 24, height: 24, background: activeWorld.accent, clipPath: 'polygon(0 0,100% 0,100% 64%,64% 100%,0 100%)', flex: 'none' }} />
          <span className="font-display" style={{ fontSize: 'var(--t-md)', letterSpacing: '0.04em', fontStyle: 'normal', fontWeight: 500, color: 'var(--nav-text-active)' }}>
            {activeWorld.name}
          </span>
        </div>
        <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', textTransform: 'uppercase', letterSpacing: '0.16em', color: 'var(--nav-text-muted)', marginBottom: 'var(--s-2)' }}>
          World · {world}
        </p>
        {railSections.map((s) => {
          const active = activeSection === s.key;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => panelRefs[world]?.current?.querySelector<HTMLElement>(`[data-section="${s.key}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              aria-current={active ? 'true' : undefined}
              className="text-left transition-colors"
              style={{
                fontSize: 'var(--t-sm)',
                padding: '0.6rem 0.8rem',
                borderRadius: 12,
                color: active ? 'var(--nav-text-active)' : 'var(--nav-text)',
                background: active ? 'var(--nav-pill-bg)' : 'transparent',
                borderColor: active ? 'var(--nav-pill-border)' : 'transparent',
                borderWidth: 1,
              }}
            >
              {s.label}
            </button>
          );
        })}
      </nav>

      <div
        ref={scrollRef}
        className="flex h-full overflow-x-auto snap-x snap-mandatory scrollbar-none overscroll-x-contain"
        style={{ scrollbarWidth: 'none', willChange: 'scroll-position' }}
      >
        {TABS.map((tab) => {
          const w = WORLDS.find((x) => x.key === tab);
          return (
            <div
              key={tab}
              id={`tabpanel-${tab}`}
              role="tabpanel"
              aria-labelledby={`tab-${tab}`}
              ref={panelRefs[tab]}
              className="h-full overflow-y-auto shrink-0 w-screen snap-start"
            >
              {w && <MemoWorldPanel world={w} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
