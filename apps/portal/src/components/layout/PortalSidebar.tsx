'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { PortalTab } from '@warehaus/logic/portal';
import { getPortalSidebarSections } from '@/lib/data/sidebarSections';
import { usePortalView } from '@/components/providers/PortalViewProvider';
import { TaskGlyph } from '@/components/tasks/TaskGlyph';
import { usePortalData } from '@/hooks/usePortalData';

/**
 * In-flow section rail for one swipe tab.
 * Lives inside the tab panel so it scrolls/swipes away with that page —
 * not a fixed shell chrome.
 */
export function PortalTabSidebar({ tab }: { tab: PortalTab }) {
  const { sectionFor, setSectionFor } = usePortalView();
  const { data } = usePortalData();
  const sections = getPortalSidebarSections(tab, data.tenant.mode);
  const activeSection = sectionFor(tab);

  useEffect(() => {
    if (sections.length > 0 && !sections.some((section) => section.key === activeSection)) {
      const first = sections[0]?.key;
      if (first) setSectionFor(tab, first);
    }
  }, [sections, activeSection, setSectionFor, tab]);

  useEffect(() => {
    const scroller = document.querySelector<HTMLElement>(
      `nav[aria-label="${tab} sections"] .section-scroller`,
    );
    const active = scroller?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!scroller || !active) return;
    const reveal = () => {
      const bounds = scroller.getBoundingClientRect();
      if (bounds.width < 8) return;
      const chip = active.getBoundingClientRect();
      const leftInset = 20;
      const rightInset = 20;
      const maxScroll = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
      let next = scroller.scrollLeft;
      if (chip.left < bounds.left + leftInset) next += chip.left - (bounds.left + leftInset);
      else if (chip.right > bounds.right - rightInset) next += chip.right - (bounds.right - rightInset);
      let chipLeftAfter = chip.left - (next - scroller.scrollLeft);
      if (chipLeftAfter < bounds.left + leftInset) {
        next = scroller.scrollLeft + (chip.left - (bounds.left + leftInset));
        chipLeftAfter = bounds.left + leftInset;
      }
      const previous = active.previousElementSibling;
      if (previous instanceof HTMLElement) {
        const prevRight = previous.getBoundingClientRect().right - (next - scroller.scrollLeft);
        const tail = prevRight - (bounds.left + leftInset);
        const room = chipLeftAfter - (bounds.left + leftInset);
        if (tail > 0 && room > 0) next += Math.min(tail, room);
      }
      scroller.scrollLeft = Math.max(0, Math.min(maxScroll, next));
    };
    reveal();
    const frame = requestAnimationFrame(reveal);
    const observer = new ResizeObserver(reveal);
    observer.observe(scroller);
    observer.observe(active);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [activeSection, tab, sections]);

  if (sections.length === 0) return null;

  return (
    <>
      {/* Mobile / tablet: in-flow chip row (scrolls with the tab) */}
      <nav
        aria-label={`${tab} sections`}
        className="mb-3 flex shrink-0 items-center gap-2 rounded-2xl px-3 py-2 backdrop-blur-2xl lg:hidden"
        style={{
          background: 'var(--nav-bg)',
          border: '1px solid var(--nav-border)',
          // The staff notice bell is 42px, fixed 20px from the viewport edge.
          // The page already insets 20px, so reserve the overlap plus a small gap
          // (3.125rem) instead of a wider cut that squeezes the chip row.
          overflow: 'hidden',
          minWidth: data.tenant.mode === 'team' ? 0 : undefined,
          width: data.tenant.mode === 'team' ? 'calc(100% - 3.125rem)' : undefined,
          maxWidth: data.tenant.mode === 'team' ? 'calc(100% - 3.125rem)' : undefined,
          alignSelf: data.tenant.mode === 'team' ? 'flex-start' : undefined,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt="warehaus"
          src="/icons/wordmark.svg"
          width={91.6264}
          height={12.4073}
          className="portal-wordmark shrink-0"
        />
        <button
          type="button"
          aria-label="Search"
          className="inline-flex shrink-0 items-center justify-center"
          style={{
            width: 32,
            height: 32,
            borderRadius: 999,
            border: '1px solid var(--nav-border)',
            background: 'transparent',
            color: 'var(--nav-text)',
            cursor: 'pointer',
          }}
          onClick={(event) => {
            window.dispatchEvent(new CustomEvent('wh-open-search', { detail: { trigger: event.currentTarget } }));
          }}
        >
          <TaskGlyph src="/icons/resource-search.svg" size={16} />
        </button>
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
        <SectionScroller>
          {sections.map((s) => {
            const active = activeSection === s.key;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setSectionFor(tab, s.key)}
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
        </SectionScroller>
      </nav>

      {/* Desktop: floating wordmark card (Figma 284:8408). No bar mark, no swoop. */}
      <nav
        aria-label={`${tab} sections`}
        data-testid="portal-sidebar"
        className="hidden max-h-full min-h-0 w-[244px] shrink-0 flex-col overflow-y-auto lg:flex"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 36,
          padding: 12,
          gap: 4,
        }}
      >
        <div
          className="flex w-full items-center justify-between"
          style={{ padding: '8px 12px' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt="warehaus"
            src="/icons/wordmark.svg"
            width={91.6264}
            height={12.4073}
            className="portal-wordmark"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="" src="/icons/sidebar-menu.svg" width={16} height={16} />
        </div>
        <div className="flex w-full flex-col" style={{ paddingTop: 16, gap: 4 }}>
          <p
            className="ds-mono"
            style={{
              fontSize: 11,
              letterSpacing: '0.88px',
              color: 'var(--faint)',
              padding: '8px 12px',
              textTransform: 'uppercase',
            }}
          >
            {data.tenant.mode === 'client'
              ? `${data.tenant.clientName ?? 'Portal'} / ${tab}`
              : `Portal / ${tab}`}
          </p>
          {sections.map((s) => {
            const active = activeSection === s.key;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setSectionFor(tab, s.key)}
                aria-current={active ? 'true' : undefined}
                className="w-full text-left transition-colors"
                style={{
                  fontSize: 14,
                  lineHeight: '20px',
                  fontWeight: active ? 600 : 500,
                  padding: 12,
                  borderRadius: 12,
                  color: active ? 'var(--fg)' : 'var(--muted)',
                  background: active ? 'var(--surface-2)' : 'transparent',
                  border: active ? '1px solid var(--border-2)' : '1px solid transparent',
                }}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}

function SectionScroller({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const update = () => {
      const hiddenRight = node.scrollWidth - node.scrollLeft - node.clientWidth;
      setEdges({
        left: node.scrollLeft > 1,
        right: hiddenRight > 16,
      });
    };
    update();
    node.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(node);
    window.addEventListener('resize', update);
    return () => {
      node.removeEventListener('scroll', update);
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [children]);
  const mask = `linear-gradient(to right, ${
    edges.left ? 'transparent 0px, transparent 18px, #000 20px' : '#000 0px'
  }, ${edges.right ? '#000 calc(100% - 28px), transparent' : '#000 100%'})`;
  return (
    <div className="relative min-w-0 flex-1">
      <div
        ref={ref}
        className="section-scroller flex min-w-0 items-center gap-1 overscroll-x-contain"
        style={{
          scrollbarWidth: 'none',
          overflowX: 'auto',
          overflowY: 'hidden',
          paddingLeft: 20,
          scrollPaddingLeft: 20,
          scrollPaddingRight: 28,
          maskImage: mask,
          WebkitMaskImage: mask,
        }}
      >
        {children}
      </div>
      {edges.left ? (
        <div aria-hidden data-testid="section-edge-fade-left" className="pointer-events-none absolute inset-y-0 left-0 w-5" />
      ) : null}
      {edges.right ? (
        <div aria-hidden data-testid="section-edge-fade" className="pointer-events-none absolute inset-y-0 right-0 w-7" />
      ) : null}
    </div>
  );
}

/** @deprecated Use PortalTabSidebar — kept as alias during migrate. */
export const PortalSidebar = PortalTabSidebar;
