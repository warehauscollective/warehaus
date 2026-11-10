'use client';

export function StaffLinkFinish({ slow, onRetry }: { slow: boolean; onRetry: () => void }) {
  return (
    <section
      data-testid="finishing-setup"
      data-slow={slow ? 'true' : 'false'}
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: 32,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      <p style={{ margin: 0, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)' }}>
        Staff invite
      </p>
      <h1 style={{ margin: 0, fontSize: 24, lineHeight: '32px', fontWeight: 600 }}>Finishing setup</h1>
      <p style={{ margin: 0, fontSize: 14, lineHeight: '22px', color: 'var(--muted)' }}>
        We’re linking your staff access. This usually takes a moment.
      </p>
      {slow ? (
        <>
          <p data-testid="finishing-slow" style={{ margin: 0, fontSize: 14, lineHeight: '22px', color: 'var(--muted)' }}>
            This is taking longer than usual. Your invite is still accepted. Stay on this page and try again.
          </p>
          <button type="button" onClick={onRetry} style={retryButton}>
            Try again
          </button>
        </>
      ) : null}
    </section>
  );
}

const retryButton = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'var(--foreground)',
  color: 'var(--background)',
  border: 0,
  borderRadius: 9,
  minHeight: 42,
  padding: '0 16px',
  fontSize: 14,
  fontWeight: 600,
  lineHeight: '18px',
  cursor: 'pointer',
  alignSelf: 'flex-start',
} as const;
