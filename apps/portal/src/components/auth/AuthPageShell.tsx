import type { ReactNode } from 'react';

export function AuthPageShell({
  subtitle,
  children,
  footer,
}: {
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main
      className="ds-scope flex min-h-[100dvh] items-center justify-center px-6 py-12"
      style={{
        background:
          'radial-gradient(900px 480px at 50% 0%, color-mix(in oklab, var(--accent) 14%, transparent), transparent 70%), var(--background)',
      }}
    >
      <div className="flex w-full max-w-md flex-col gap-8">
        <header className="text-center">
          <p
            className="font-display"
            style={{
              fontSize: 'clamp(2rem, 1.5rem + 2vw, 2.75rem)',
              fontWeight: 700,
              letterSpacing: '-0.02em',
              lineHeight: 1,
            }}
          >
            Warehaus
          </p>
          <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', marginTop: 10 }}>
            {subtitle}
          </p>
        </header>
        {children}
        {footer}
      </div>
    </main>
  );
}
