'use client';

export function StaffLinkFinish({ slow, onRetry }: { slow: boolean; onRetry: () => void }) {
  return (
    <section
      className="accept-card"
      data-testid="finishing-setup"
      data-slow={slow ? 'true' : 'false'}
    >
      <div className="accept-stack">
        <p className="ds-mono" style={{ margin: 0, fontSize: 12, lineHeight: '18px', letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--accept-muted, var(--muted))' }}>
          Staff invite
        </p>
        <h1 style={{ margin: 0, fontSize: 24, lineHeight: '32px', fontWeight: 600 }}>Finishing setup</h1>
        <p style={{ margin: 0, fontSize: 14, lineHeight: '22px', color: 'var(--accept-muted, var(--muted))' }}>
          We’re linking your staff access. This usually takes a moment.
        </p>
      </div>
      {slow ? (
        <>
          <div className="accept-progress" data-testid="finishing-progress" role="progressbar" aria-label="Finishing setup">
            <span />
          </div>
          <p data-testid="finishing-slow" style={{ margin: 0, fontSize: 14, lineHeight: '22px', color: 'var(--accept-muted, var(--muted))' }}>
            This is taking longer than usual. Your invite is still accepted. Stay on this page and try again.
          </p>
          <button type="button" onClick={onRetry} className="accept-primary" style={retryButton}>
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
  background: 'var(--accent, var(--foreground))',
  color: 'var(--accent-fg, var(--background))',
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
