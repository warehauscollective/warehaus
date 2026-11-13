'use client';

import { useEffect } from 'react';
import { StaffLiveFields } from './StaffLiveFields';
import { TaskSourcesPanel } from './TaskSources';
import { SOURCE_PANEL_LINKS, type SourcePanelScreen } from './sourcePanelFixtures';

export function SourcesReview({
  audience,
  screen,
}: {
  audience: 'staff' | 'client';
  screen: SourcePanelScreen;
}) {
  const staff = audience === 'staff';
  return (
    <div
      className="ds-scope"
      data-testid="sources-preview"
      data-audience={audience}
      data-screen={screen}
      style={{
        minHeight: '100vh',
        background: 'var(--bg)',
        color: 'var(--fg)',
        padding: 24,
        fontFamily: 'var(--font-body)',
      }}
    >
      <div style={{ width: 'min(100%, 296px)' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, lineHeight: '28px', margin: '0 0 16px' }}>
          Build the project page
        </h2>
        {staff ? (
          <StaffLiveFields source="portal" estimate="M" priority="High" />
        ) : (
          <div className="flex flex-col gap-1" data-testid="sources-client-fields">
            <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--faint)', margin: 0 }}>Status</p>
            <p style={{ margin: '4px 0 12px', fontSize: 'var(--t-sm)' }}>In Progress</p>
            <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--faint)', margin: 0 }}>Assignee</p>
            <p style={{ margin: '4px 0 12px', fontSize: 'var(--t-sm)' }}>Alex Bauer</p>
            <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--faint)', margin: 0 }}>Due date</p>
            <p style={{ margin: '4px 0 0', fontSize: 'var(--t-sm)' }}>Oct 20</p>
          </div>
        )}
        {staff ? (
          <div className="task-sources-section" data-testid="task-sources-section">
            <TaskSourcesPanel
              links={screen === 'links' ? SOURCE_PANEL_LINKS : []}
              loading={screen === 'loading'}
              truncated={screen === 'links'}
              error={screen === 'error' ? 'unavailable' : null}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function SourcesReviewPage({
  audience,
  screen,
  theme,
}: {
  audience: 'staff' | 'client';
  screen: SourcePanelScreen;
  theme: 'light' | 'dark';
}) {
  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light');
    document.documentElement.style.colorScheme = theme;
  }, [theme]);
  return <SourcesReview audience={audience} screen={screen} />;
}
