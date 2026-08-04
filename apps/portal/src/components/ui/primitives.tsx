import type { CSSProperties, ReactNode } from 'react';
import { Bevel, Eyebrow as UiEyebrow } from '@warehaus/ui';
import { PORTAL_SURFACE_RADIUS } from '@/lib/design/portal-chrome';

export function Eyebrow({ children }: { children: ReactNode }) {
  return <UiEyebrow>{children}</UiEyebrow>;
}

export function Pill({
  children,
  color,
}: {
  children: ReactNode;
  color?: string;
}) {
  return (
    <span className="ds-pill" style={color ? { color, borderColor: color } : undefined}>
      {children}
    </span>
  );
}

export function Section({
  id,
  children,
  style,
}: {
  id: string;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <section
      data-section={id}
      style={{
        paddingBlock: 'clamp(2.5rem, 1.5rem + 4vw, 4.5rem)',
        ...style,
      }}
    >
      {children}
    </section>
  );
}

export function Surface({
  children,
  style,
}: {
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <Bevel
      corners="br"
      radius={PORTAL_SURFACE_RADIUS}
      cut={1.75}
      shoulder={0.625}
      fill="var(--surface)"
      stroke="var(--border)"
      style={{ padding: 'var(--s-6)', ...style }}
    >
      {children}
    </Bevel>
  );
}

export function PrimaryButton({
  children,
  type = 'button',
  onClick,
  disabled,
}: {
  children: ReactNode;
  type?: 'button' | 'submit';
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center justify-center"
      style={{
        background: 'var(--accent)',
        color: 'var(--accent-fg)',
        border: 0,
        borderRadius: 9,
        fontFamily: 'var(--font-body)',
        fontSize: 'var(--t-sm)',
        fontWeight: 600,
        padding: '0.65rem 1.1rem',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
      }}
    >
      {children}
    </button>
  );
}

export function GhostButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center justify-center"
      style={{
        background: 'transparent',
        color: 'var(--muted)',
        border: '1px solid var(--border)',
        borderRadius: 9,
        fontFamily: 'var(--font-body)',
        fontSize: 'var(--t-sm)',
        padding: '0.65rem 1.1rem',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}
