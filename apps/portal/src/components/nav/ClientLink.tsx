'use client';

const labelStyle = {
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  fontWeight: 400,
  lineHeight: 'normal',
  letterSpacing: '0.8px',
  color: 'var(--faint)',
  whiteSpace: 'nowrap' as const,
};

const chipStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '4px 8px',
  borderRadius: 10,
  border: '1px solid var(--border)',
  background: 'transparent',
  boxSizing: 'border-box' as const,
};

const nameStyle = {
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  fontWeight: 400,
  lineHeight: 'normal',
  color: 'var(--fg)',
  textDecorationLine: 'underline' as const,
  textDecorationThickness: 'from-font' as const,
  textUnderlineOffset: 'from-font' as const,
  whiteSpace: 'nowrap' as const,
};

/**
 * Figma Meta / Client link (330:1589).
 * Linked opens Account → Clients → that client. Empty is a muted dash, not a control.
 */
export function ClientLink({
  name,
  orgId,
  onOpen,
}: {
  name?: string | null;
  orgId?: string | null;
  onOpen: (orgId: string) => void;
}) {
  const label = name?.trim() ?? '';
  const id = orgId?.trim() ?? '';
  const linked = Boolean(label && id);

  return (
    <div className="flex items-center" style={{ gap: 6 }} data-testid="project-client-link">
      <span style={labelStyle}>CLIENT</span>
      {linked ? (
        <button
          type="button"
          data-testid="project-client-chip"
          aria-label={`Open client ${label}`}
          onClick={() => onOpen(id)}
          style={{ ...chipStyle, cursor: 'pointer' }}
        >
          <span style={nameStyle}>{label}</span>
          <span className="relative shrink-0" style={{ width: 12, height: 12 }} aria-hidden>
            <span className="absolute inset-x-0 top-0" style={{ bottom: '-13.88%' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt="" src="/icons/client-chev.svg" className="block size-full max-w-none" />
            </span>
          </span>
        </button>
      ) : (
        <span data-testid="project-client-empty" style={{ ...chipStyle, ...nameStyle, color: 'var(--faint)', textDecorationLine: 'none' }}>
          —
        </span>
      )}
    </div>
  );
}
