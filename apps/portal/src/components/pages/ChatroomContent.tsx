'use client';

import { Pill, PrimaryButton, Surface } from '@/components/ui/primitives';
import { PortalTilePane, PortalWorkspace } from '@/components/layout/PortalWorkspace';
import { usePortalView } from '@/components/providers/PortalViewProvider';

const THREADS = [
  { id: 'TH-12', title: 'Dock 3 capacity', preview: 'Can we flip the 14:20 to Dock 7?', meta: '2m · 4 msgs' },
  { id: 'TH-09', title: 'SH-4822 delay', preview: 'Portland ETA slipped — need a rewrite.', meta: '18m · 11 msgs' },
  { id: 'TH-04', title: 'Onboarding checklist', preview: 'First warehouse connected. Invite next?', meta: 'Yesterday · 6 msgs' },
];

const SECTION_TITLE: Record<string, string> = {
  overview: 'Chatroom',
  threads: 'Threads',
  compose: 'Compose',
};

export function ChatroomContent() {
  const { activeSection, openDetail } = usePortalView();
  const title = SECTION_TITLE[activeSection] ?? 'Chatroom';

  return (
    <PortalWorkspace
      eyebrow="Portal · Chatroom"
      title={title}
      actions={activeSection !== 'compose' ? <PrimaryButton>New thread</PrimaryButton> : undefined}
    >
      {(activeSection === 'overview' || activeSection === 'threads') && (
        <PortalTilePane>
          <div className="flex h-full min-h-0 flex-col gap-2">
            {THREADS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() =>
                  openDetail({
                    id: t.id,
                    title: t.title,
                    subtitle: t.meta,
                    body: (
                      <div className="flex flex-col gap-4">
                        <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>{t.preview}</p>
                        <Surface style={{ padding: 'var(--s-4)' }}>
                          <p style={{ fontSize: 'var(--t-sm)' }}>
                            Thread stays beside the work — reply without leaving the board.
                          </p>
                        </Surface>
                        <PrimaryButton>Reply</PrimaryButton>
                      </div>
                    ),
                  })
                }
                className="text-left"
              >
                <Surface style={{ padding: 'var(--s-4)' }}>
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <div>
                      <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--faint)' }}>
                        {t.id}
                      </p>
                      <h3 style={{ fontSize: 'var(--t-md)', fontWeight: 600, marginTop: 4 }}>
                        {t.title}
                      </h3>
                      <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', marginTop: 4 }}>
                        {t.preview}
                      </p>
                    </div>
                    <Pill>{t.meta}</Pill>
                  </div>
                </Surface>
              </button>
            ))}
          </div>
        </PortalTilePane>
      )}

      {activeSection === 'compose' && (
        <PortalTilePane>
          <Surface style={{ padding: 'var(--s-5)', maxWidth: 640 }}>
            <label className="flex flex-col" style={{ gap: 'var(--s-2)' }}>
              <span style={{ fontSize: 'var(--t-sm)', fontWeight: 500, color: 'var(--muted)' }}>
                Subject
              </span>
              <input className="ds-input" placeholder="What’s this about?" />
            </label>
            <label className="flex flex-col" style={{ gap: 'var(--s-2)', marginTop: 'var(--s-4)' }}>
              <span style={{ fontSize: 'var(--t-sm)', fontWeight: 500, color: 'var(--muted)' }}>
                Message
              </span>
              <textarea className="ds-textarea" rows={5} placeholder="Write to the team…" />
            </label>
            <div className="mt-4 flex justify-end">
              <PrimaryButton>Start thread</PrimaryButton>
            </div>
          </Surface>
        </PortalTilePane>
      )}
    </PortalWorkspace>
  );
}
