import { Eyebrow, Pill, PrimaryButton, Section, Surface } from '@/components/ui/primitives';

const THREADS = [
  { id: 'TH-12', title: 'Dock 3 capacity', preview: 'Can we flip the 14:20 to Dock 7?', meta: '2m · 4 msgs' },
  { id: 'TH-09', title: 'SH-4822 delay', preview: 'Portland ETA slipped — need a rewrite.', meta: '18m · 11 msgs' },
  { id: 'TH-04', title: 'Onboarding checklist', preview: 'First warehouse connected. Invite next?', meta: 'Yesterday · 6 msgs' },
];

export function ChatroomContent() {
  return (
    <div style={{ maxWidth: 'var(--maxw)' }}>
      <Section id="overview" style={{ paddingTop: 'clamp(3rem, 2rem + 5vw, 5rem)' }}>
        <Eyebrow>Portal · Chatroom</Eyebrow>
        <h1
          className="type-display"
          style={{ fontSize: 'var(--t-3xl)', marginTop: 'var(--s-4)', maxWidth: '14ch' }}
        >
          Chatroom
        </h1>
        <p className="ds-lead" style={{ marginTop: 'var(--s-5)' }}>
          Product conversation for operators — separate from the marketing site’s AI overlay. Threads
          stay next to the work.
        </p>
      </Section>

      <Section id="threads">
        <Eyebrow>Threads</Eyebrow>
        <h2 className="type-heading" style={{ fontSize: 'var(--t-2xl)', marginTop: 'var(--s-3)' }}>
          Open conversations
        </h2>
        <div className="flex flex-col" style={{ marginTop: 'var(--s-6)', gap: 'var(--s-3)' }}>
          {THREADS.map((t) => (
            <Surface key={t.id} style={{ padding: 'var(--s-5)' }}>
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <div>
                  <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--faint)' }}>
                    {t.id}
                  </p>
                  <h3 style={{ fontSize: 'var(--t-md)', fontWeight: 600, marginTop: 4 }}>{t.title}</h3>
                  <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', marginTop: 4 }}>
                    {t.preview}
                  </p>
                </div>
                <Pill>{t.meta}</Pill>
              </div>
            </Surface>
          ))}
        </div>
      </Section>

      <Section id="compose">
        <Eyebrow>Compose</Eyebrow>
        <h2 className="type-heading" style={{ fontSize: 'var(--t-2xl)', marginTop: 'var(--s-3)' }}>
          New thread
        </h2>
        <Surface style={{ marginTop: 'var(--s-6)' }}>
          <label className="flex flex-col" style={{ gap: 'var(--s-2)' }}>
            <span style={{ fontSize: 'var(--t-sm)', fontWeight: 500, color: 'var(--muted)' }}>
              Subject
            </span>
            <input className="ds-input" placeholder="What’s this about?" />
          </label>
          <label className="flex flex-col" style={{ gap: 'var(--s-2)', marginTop: 'var(--s-5)' }}>
            <span style={{ fontSize: 'var(--t-sm)', fontWeight: 500, color: 'var(--muted)' }}>
              Message
            </span>
            <textarea className="ds-textarea" rows={4} placeholder="Write to the team…" />
          </label>
          <div className="flex justify-end" style={{ marginTop: 'var(--s-5)' }}>
            <PrimaryButton>Start thread</PrimaryButton>
          </div>
        </Surface>
      </Section>
    </div>
  );
}
