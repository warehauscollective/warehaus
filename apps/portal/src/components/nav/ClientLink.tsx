'use client';

import { Icon } from '@/components/ui/Icon';
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
          <Icon name="ArrowRight2" size="xs" color="muted" className="shrink-0" />
        </button>
      ) : (
        <span data-testid="project-client-empty" style={{ ...chipStyle, ...nameStyle, color: 'var(--faint)', textDecorationLine: 'none' }}>
          —
        </span>
      )}
    </div>
  );
}
