/**
 * 24px under the phone header, on the scrolling content.
 * The shell wrapper does not add it: that band sat outside the scrollport,
 * doubled pages that already pad their header, and clipped tiles on scroll.
 */
export const PHONE_SCROLL_INSET = 'max-lg:pt-6';

/**
 * Phone side margin, and the wordmark's x, from the 390 frames under
 * Figma 473:29440. One value for Dashboard, Resources, Activity, Account,
 * Projects and Milestones.
 */
export const PHONE_SHELL_INSET_PX = 16;

/** Phone uses {@link PHONE_SHELL_INSET_PX} on every tab. Desktop keeps its own insets. */
export function tabPanelPadding(
  phone: boolean,
  project: boolean,
): { paddingLeft: number | string; paddingRight: number | string } {
  if (phone) {
    return { paddingLeft: PHONE_SHELL_INSET_PX, paddingRight: PHONE_SHELL_INSET_PX };
  }
  if (project) return { paddingLeft: 24, paddingRight: 24 };
  return { paddingLeft: '1.25rem', paddingRight: '4.5rem' };
}

/**
 * Phone shell gap is 0 on every tab. Desktop keeps its own gap.
 * The wrapper has no top padding, so the inset cannot stack on the page header.
 */
export function tabPanelShellLayout(project: boolean): {
  shellClassName: string;
  contentClassName: string;
} {
  const frame =
    'portal-tab-shell box-border flex h-full min-h-0 flex-col overflow-hidden lg:flex-row lg:items-stretch';
  const shellClassName = project
    ? `${frame} gap-0 pb-0 pt-4 lg:gap-6 lg:pb-28 lg:pt-6`
    : `${frame} gap-0 pb-28 pt-3 lg:gap-[var(--portal-panel-gap,1.25rem)] lg:pt-[var(--portal-panel-gap,1.25rem)]`;
  return {
    shellClassName,
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
