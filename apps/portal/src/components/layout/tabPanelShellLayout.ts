/**
 * 24px under the phone header, on the scrolling content.
 * The shell wrapper does not add it: that band sat outside the scrollport,
 * doubled pages that already pad their header, and clipped tiles on scroll.
 */
export const PHONE_SCROLL_INSET = 'max-lg:pt-6';

/**
 * One shell for every tab: the Projects layout.
 * Phone is pt-4 (wordmark at y≈31) and pb-0 so the scroller reaches the
 * bottom of the viewport and content can move under the dock.
 * Desktop is 24px top (lg:pt-6) with the dock clearance below the fold.
 */
export function tabPanelShellLayout(): {
  shellClassName: string;
  contentClassName: string;
} {
  const frame =
    'portal-tab-shell box-border flex h-full min-h-0 flex-col overflow-hidden lg:flex-row lg:items-stretch';
  return {
    shellClassName: `${frame} gap-0 pb-0 pt-4 lg:gap-6 lg:pb-28 lg:pt-6`,
    contentClassName: 'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden',
  };
}

function phoneTokens(className: string): string {
  return className.replace(/lg:[^\s]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** True when a phone gap and a wrapper inset would both sit under the header. */
export function phoneInsetDoubled(layout: { shellClassName: string; contentClassName: string }): boolean {
  const phoneShell = phoneTokens(layout.shellClassName);
  const phoneWrap = phoneTokens(layout.contentClassName);
  const phoneGap = /(?:^|\s)gap-(?!0(?:\s|$))\S+/.test(phoneShell);
  const wrapperInset = /(?:^|\s)(?:pt-6|max-lg:pt-6)(?:\s|$)/.test(phoneWrap);
  return phoneGap || wrapperInset;
}
