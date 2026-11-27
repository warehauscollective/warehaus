'use client';

import { useState, type CSSProperties, type InputHTMLAttributes } from 'react';
import { Eye, EyeOff } from 'lucide-react';

/**
 * A password field with a show/hide button inside its right edge.
 * Figma: Portal/Input (147:967), Type=Password, Revealed=false|true.
 * The button shows Eye while the password is hidden and EyeOff while it is shown.
 */
export function PasswordInput({
  style,
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const [revealed, setRevealed] = useState(false);
  const inputStyle: CSSProperties = { ...style, paddingRight: 48 };

  return (
    <span style={{ position: 'relative', display: 'block', width: '100%' }}>
      <input
        {...props}
        type={revealed ? 'text' : 'password'}
        className={['w-full [&::-ms-reveal]:hidden', className].filter(Boolean).join(' ')}
        style={inputStyle}
      />
      <button
        type="button"
        aria-label={revealed ? 'Hide password' : 'Show password'}
        aria-pressed={revealed}
        data-testid="password-reveal"
        onClick={() => setRevealed((value) => !value)}
        className="inline-flex items-center justify-center rounded-lg transition-colors hover:text-[var(--fg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
        style={{
          position: 'absolute',
          right: 8,
          top: '50%',
          transform: 'translateY(-50%)',
          width: 32,
          height: 32,
          border: 0,
          background: 'transparent',
          color: 'var(--muted)',
          cursor: 'pointer',
        }}
      >
        {revealed ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
      </button>
    </span>
  );
}
