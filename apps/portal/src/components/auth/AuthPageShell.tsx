import type { ReactNode } from 'react';
import Image from 'next/image';

export function AuthPageShell({
  subtitle,
  children,
  footer,
  tone = 'default',
}: {
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Invite accept frames: Eurostile display wordmark, top glow, 448px column. */
  tone?: 'default' | 'invite';
}) {
  const invite = tone === 'invite';
  return (
    <main
      className={
        invite
          ? 'ds-scope relative flex min-h-[100dvh] items-center justify-center overflow-hidden px-6 py-8 md:px-8 md:py-16'
          : 'ds-scope flex min-h-[100dvh] items-center justify-center px-6 py-12'
      }
      style={
        invite
          ? { background: 'var(--background)' }
          : {
              background:
                'radial-gradient(900px 480px at 50% 0%, color-mix(in oklab, var(--accent) 14%, transparent), transparent 70%), var(--background)',
            }
      }
    >
      {invite ? (
        <Image
          alt=""
          src="/invites/glow.svg"
          width={1320}
          height={880}
          unoptimized
          priority
          className="pointer-events-none absolute"
          style={{ left: '50%', top: -468, transform: 'translateX(-50%)', maxWidth: 'none' }}
        />
      ) : null}
      <div className="relative flex w-full max-w-md flex-col gap-8">
        <header className="flex flex-col items-center gap-2 text-center">
          <p
            className="font-display"
            style={{
              fontSize: invite ? 'clamp(2.25rem, 2rem + 0.6vw, 2.75rem)' : 'clamp(2rem, 1.5rem + 2vw, 2.75rem)',
              fontWeight: invite ? undefined : 700,
              letterSpacing: invite ? undefined : '-0.02em',
              lineHeight: 1,
            }}
          >
            Warehaus
          </p>
          <p style={{ fontSize: 14, color: 'var(--muted)', margin: 0 }}>{subtitle}</p>
        </header>
        {children}
        {footer}
      </div>
    </main>
  );
}
