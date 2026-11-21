/** Matches the Figma frame "Portal / 404 + login loading": code, rule, one line. */
export default function NotFound() {
  return (
    <main className="ds-scope flex min-h-[100dvh] items-center justify-center px-6">
      <div className="flex items-center" style={{ gap: 'var(--s-4)' }}>
        <h1 style={{ fontSize: 'var(--t-lg)', fontWeight: 500, lineHeight: 1 }}>404</h1>
        <span
          aria-hidden="true"
          style={{ alignSelf: 'stretch', width: 1, minHeight: 32, background: 'var(--border)' }}
        />
        <p style={{ fontSize: 'var(--t-sm)' }}>This page could not be found.</p>
      </div>
    </main>
  );
}
