import type { ReactNode } from 'react';

interface PortalPageProps {
  eyebrow: string;
  title: string;
  description: string;
  children?: ReactNode;
}

/** Shared empty-state frame for portal tab routes during the scaffold phase. */
export function PortalPage({ eyebrow, title, description, children }: PortalPageProps) {
  return (
    <section
      className="mx-auto w-full"
      style={{
        maxWidth: 'var(--maxw)',
        paddingInline: 'var(--gutter)',
        paddingBlock: 'clamp(3.5rem, 2rem + 8vw, 7rem)',
      }}
    >
      <p className="ds-eyebrow">{eyebrow}</p>
      <h1
        className="type-display"
        style={{
          fontSize: 'var(--t-3xl)',
          marginTop: 'var(--s-4)',
          maxWidth: '16ch',
        }}
      >
        {title}
      </h1>
      <p className="ds-lead" style={{ marginTop: 'var(--s-5)' }}>
        {description}
      </p>
      {children ? <div style={{ marginTop: 'var(--s-7)' }}>{children}</div> : null}
    </section>
  );
}
