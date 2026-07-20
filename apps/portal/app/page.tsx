import { PortalPage } from '@/components/layout/PortalPage';

export default function PortalHomePage() {
  return (
    <PortalPage
      eyebrow="Portal"
      title="Overview"
      description="Your operating picture. This scaffold shares Warehaus tokens, type, and the floating dock — product surfaces land here next."
    >
      <div
        className="rounded-[var(--radius)] border"
        style={{
          borderColor: 'var(--border)',
          background: 'var(--surface)',
          padding: 'var(--s-6)',
        }}
      >
        <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>
          portal.* · apps/portal · @warehaus/tokens · @warehaus/logic
        </p>
        <p style={{ marginTop: 'var(--s-3)', color: 'var(--foreground)' }}>
          Empty state on purpose. Auth, tables, and operator flows come in the next phases —
          without touching the marketing website.
        </p>
      </div>
    </PortalPage>
  );
}
