'use client';

export type BreadcrumbLink = {
  label: string;
  onClick: () => void;
};

const trailStyle = {
  fontFamily: 'var(--font-mono)',
  fontSize: 12,
  fontWeight: 400,
  lineHeight: '20px',
  letterSpacing: '0.96px',
  textTransform: 'uppercase' as const,
};

const linkStyle = {
  ...trailStyle,
  color: 'var(--fg)',
  textDecorationLine: 'underline' as const,
  textDecorationThickness: '1px',
  textUnderlineOffset: 'from-font' as const,
  textUnderlinePosition: 'from-font' as const,
  background: 'none',
  border: 0,
  padding: 0,
  cursor: 'pointer',
};

/**
 * Figma Nav / Breadcrumb (325:16937).
 * Back control and the underlined parent share one path to the parent list.
 * Middle is a link. Current is muted and not a link.
 * Desktop detail shows the circle and the current crumb. Mobile hides the
 * current crumb (the page heading carries it). Account sections hide the
 * circle at lg+, where the sidebar is the section nav.
 */
export function NavBreadcrumb({
  parent,
  middle,
  current,
  onBack,
  back = 'always',
}: {
  parent: BreadcrumbLink;
  middle?: BreadcrumbLink;
  current: string;
  onBack: () => void;
  back?: 'always' | 'mobile';
}) {
  return (
    <nav
      aria-label="Breadcrumb"
      data-testid="nav-breadcrumb"
      className="flex min-w-0 items-center"
      style={{ gap: 12 }}
    >
      <button
        type="button"
        onClick={onBack}
        aria-label={`Back to ${parent.label}`}
        data-testid="nav-breadcrumb-back"
        className={
          back === 'mobile'
            ? 'flex shrink-0 items-center justify-center lg:hidden'
            : 'flex shrink-0 items-center justify-center'
        }
        style={{
          width: 28,
          height: 28,
          borderRadius: 14,
          border: '1px solid var(--border-2)',
          background: 'transparent',
          padding: 0,
          cursor: 'pointer',
        }}
      >
        <span className="relative shrink-0" style={{ width: 16, height: 16 }} aria-hidden>
          {/* Figma icon asset — decorative; the button name is the label. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt=""
            src="/icons/nav-back.svg"
            className="nav-back-glyph absolute inset-0 block size-full max-w-none"
          />
        </span>
      </button>
      <ol className="flex min-w-0 items-center overflow-hidden" style={{ ...trailStyle, gap: 8 }}>
        <li className="flex shrink-0 items-center">
          <button
            type="button"
            onClick={parent.onClick}
            data-testid="nav-breadcrumb-parent"
            style={linkStyle}
          >
            {parent.label}
          </button>
        </li>
        {middle ? (
          <li
            className="flex shrink-0 items-center"
            style={{ gap: 8 }}
            data-testid="nav-breadcrumb-middle"
          >
            <span aria-hidden style={{ color: 'var(--faint)' }}>
              /
            </span>
            <button type="button" onClick={middle.onClick} style={linkStyle}>
              {middle.label}
            </button>
          </li>
        ) : null}
        <li
          className="hidden min-w-0 items-center lg:flex"
          style={{ gap: 8 }}
          data-testid="nav-breadcrumb-current"
        >
          <span aria-hidden style={{ color: 'var(--faint)' }}>
            /
          </span>
          <span aria-current="page" className="truncate" style={{ color: 'var(--muted)' }}>
            {current}
          </span>
        </li>
      </ol>
    </nav>
  );
}
