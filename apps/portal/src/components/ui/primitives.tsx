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

export function ButtonSpinner() {
  return (
    <span
      aria-hidden
      className="inline-block animate-spin"
      style={{
        width: 14,
        height: 14,
        borderRadius: 999,
        border: '1.5px solid currentColor',
        borderRightColor: 'transparent',
        flex: '0 0 auto',
      }}
    />
  );
}

export function PrimaryButton({
  children,
  type = 'button',
  onClick,
  disabled,
  className,
  title,
  solidWhenDisabled = false,
}: {
  children: ReactNode;
  type?: 'button' | 'submit';
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  title?: string;
  /** Keep the primary fill. The control stays disabled; the tooltip explains why. */
  solidWhenDisabled?: boolean;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-disabled={disabled || undefined}
      title={title}
      className={['inline-flex items-center justify-center gap-2', className].filter(Boolean).join(' ')}
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
        opacity: disabled && !solidWhenDisabled ? 0.55 : 1,
      }}
    >
      {children}
    </button>
  );
}

export function OutlineButton({
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
        background: 'transparent',
        color: 'var(--fg)',
        border: '1px solid var(--border)',
        borderRadius: 9,
        fontFamily: 'var(--font-body)',
        fontSize: 14,
        fontWeight: 500,
        padding: '0.65rem 1rem',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
      }}
    >
      {children}
    </button>
  );
}

export function PortalCheckbox({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <span className="relative inline-flex shrink-0" style={{ width: 18, height: 18 }}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange?.(event.target.checked)}
        className="absolute inset-0 cursor-pointer opacity-0"
      />
      <span
        aria-hidden
        style={{
          width: 18,
          height: 18,
          borderRadius: 4,
          border: '1.5px solid var(--fg)',
          background: checked ? 'var(--fg)' : 'transparent',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {checked ? (
          <span
            style={{
              width: 8,
              height: 4,
              borderLeft: '2px solid var(--bg)',
              borderBottom: '2px solid var(--bg)',
              transform: 'rotate(-45deg)',
              marginTop: -2,
            }}
          />
        ) : null}
      </span>
    </span>
  );
}

export function PortalRadio({
  checked,
  disabled,
  name,
}: {
  checked?: boolean;
  disabled?: boolean;
  name?: string;
}) {
  return (
    <span className="relative inline-flex shrink-0" style={{ width: 18, height: 18 }}>
      <input
        type="radio"
        name={name}
        checked={checked}
        disabled={disabled}
        readOnly
        className="absolute inset-0 opacity-0"
      />
      <span
        aria-hidden
        style={{
          width: 18,
          height: 18,
          borderRadius: 999,
          border: '1.5px solid var(--fg)',
          opacity: disabled ? 0.45 : 1,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {checked ? (
          <span style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--fg)' }} />
        ) : null}
      </span>
    </span>
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
