'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { OutlineButton, PrimaryButton } from '@/components/ui/primitives';
import { PortalModal } from '@/components/ui/PortalModal';
import { PortalToast, type PortalToastKind } from '@/components/ui/PortalToast';

const TOAST_KINDS: PortalToastKind[] = ['success', 'error', 'moved', 'invite-sent'];

type Fixture = 'toast' | 'move' | 'needs' | 'search' | 'notice' | 'menu';

/**
 * Unsigned /preview captures. `?fixture=` opens one consolidated surface.
 * `?theme=light|dark` wins over the saved theme so Dark and Light can be shot.
 */
export function PreviewModalFixtures() {
  const pathname = usePathname();
  const [fixture, setFixture] = useState<Fixture | null>(null);
  const [kind, setKind] = useState<PortalToastKind | null>(null);
  const active = pathname === '/preview';

  useEffect(() => {
    if (!active) return;
    const params = new URLSearchParams(window.location.search);
    const theme = params.get('theme');
    const apply = () => {
      if (theme === 'light') document.documentElement.classList.add('light');
      if (theme === 'dark') document.documentElement.classList.remove('light');
    };
    apply();
    const timer = window.setTimeout(apply, 0);
    const next = params.get('fixture');
    if (next === 'toast' || next === 'move' || next === 'needs' || next === 'search' || next === 'notice' || next === 'menu') {
      setFixture(next);
    }
    const asked = params.get('kind');
    setKind(TOAST_KINDS.includes(asked as PortalToastKind) ? asked as PortalToastKind : null);
    const openSurface = () => {
      if (next === 'search') {
        window.dispatchEvent(new CustomEvent('wh-open-search', { detail: { trigger: document.body } }));
      }
      if (next === 'notice') window.dispatchEvent(new Event('wh-open-notices'));
      if (next === 'menu') window.dispatchEvent(new Event('wh-open-menu'));
    };
    openSurface();
    const again = window.setTimeout(openSurface, 400);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(again);
    };
  }, [active]);

  if (!active) return null;
  if (fixture === 'toast') {
    const kinds = kind ? [kind] : TOAST_KINDS;
    return (
      <div
        data-testid="shared-toast-fixture"
        className="ds-scope"
        style={{
          position: 'fixed',
          zIndex: 200,
          top: 88,
          left: 16,
          right: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          alignItems: 'center',
        }}
      >
        {kinds.map((item) => (
          <PortalToast
            key={item}
            kind={item}
            placement="flow"
            autoHideMs={0}
            onRetry={item === 'error' ? () => undefined : undefined}
            onUndo={item === 'moved' ? () => undefined : undefined}
          />
        ))}
      </div>
    );
  }
  if (fixture === 'move') {
    return (
      <PortalModal testId="task-move-sheet" label="Move to" onClose={() => undefined} narrow sheet="bottom" width={640} panelStyle={{ padding: '0 16px 16px' }}>
        <div className="mb-3 flex items-center justify-between">
          <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 'var(--t-md)' }}>Move to</h2>
          <button type="button" aria-label="Close">Close</button>
        </div>
        <ul className="flex flex-col gap-2">
          {['To Do', 'In Progress · Current', 'Done'].map((label) => (
            <li key={label}>
              <button type="button" className="flex w-full items-center justify-between text-left" style={{ minHeight: 44, border: '1px solid var(--border)', borderRadius: 12, padding: '0.7rem 0.85rem', background: 'var(--surface)', color: 'var(--fg)' }}>
                {label}
              </button>
            </li>
          ))}
        </ul>
      </PortalModal>
    );
  }
  if (fixture === 'needs') {
    return (
      <PortalModal testId="task-needs-dialog" label="Move to Ready to Ship" onClose={() => undefined} width={640} panelStyle={{ padding: 24 }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--t-md)', margin: '0 0 12px' }}>Move to Ready to Ship</h2>
        <p style={{ fontSize: 14, lineHeight: '21px', color: 'var(--muted)', margin: '0 0 16px' }}>
          “Homepage” needs a linked pull request before it can be Ready to Ship.
        </p>
        <div className="flex justify-end gap-2">
          <OutlineButton>Cancel</OutlineButton>
          <PrimaryButton>Move to Ready to Ship</PrimaryButton>
        </div>
      </PortalModal>
    );
  }
  return null;
}
