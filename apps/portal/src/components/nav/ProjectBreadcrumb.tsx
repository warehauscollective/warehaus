'use client';

/**
 * Plain milestone trail used by the project page and the milestone detail.
 * Phone shows the back control. Desktop shows the 11px trail.
 * Both use the same hover and focus treatment.
 */
export function ProjectBreadcrumb({
  back,
  trail,
}: {
  back: { label: string; onClick: () => void };
  trail: { label: string; onClick?: () => void; testId: string }[];
}) {
  return (
    <>
      <button
        type="button"
        className="portal-crumb portal-crumb-back inline-flex items-center justify-start lg:hidden"
        data-testid="nav-breadcrumb-back"
        onClick={back.onClick}
        style={{
          minHeight: 44,
          padding: '12px 16px',
          border: 0,
          borderRadius: 9,
          background: 'transparent',
          color: 'var(--muted)',
          fontFamily: 'var(--font-geist), var(--font-body)',
          fontSize: 14,
          fontWeight: 500,
          lineHeight: 'normal',
          cursor: 'pointer',
        }}
      >
        {back.label}
      </button>
      <nav
        aria-label="Breadcrumb"
        data-testid="nav-breadcrumb"
        className="ds-mono hidden min-w-0 lg:block"
        style={{ fontSize: 11, lineHeight: '17px', color: 'var(--muted)', letterSpacing: 0, textTransform: 'none' }}
      >
        {trail.map((item, index) => (
          <span key={item.testId}>
            {index > 0 ? <span aria-hidden> / </span> : null}
            {item.onClick ? (
              <button
                type="button"
                className="portal-crumb"
                data-testid={item.testId}
                onClick={item.onClick}
                style={{
                  font: 'inherit',
                  color: 'inherit',
                  background: 'none',
                  border: 0,
                  padding: 0,
                  cursor: 'pointer',
                }}
              >
                {item.label}
              </button>
            ) : (
              <span data-testid={item.testId}>{item.label}</span>
            )}
          </span>
        ))}
      </nav>
    </>
  );
}
