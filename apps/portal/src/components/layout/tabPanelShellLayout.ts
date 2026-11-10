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

/** Horizontal inset at 768 and up, including 1440. Projects already used this. */
export const DESKTOP_SHELL_INSET_PX = 24;

/**
 * Phone uses {@link PHONE_SHELL_INSET_PX} on every tab.
 * Desktop uses {@link DESKTOP_SHELL_INSET_PX} on every tab.
 */
export function tabPanelPadding(
  phone: boolean,
  project: boolean,
): { paddingLeft: number | string; paddingRight: number | string } {
  // Projects and the other tabs share one inset. `project` stays in the
  // signature so callers do not branch the shell themselves.
  void project;
  if (phone) {
    return { paddingLeft: PHONE_SHELL_INSET_PX, paddingRight: PHONE_SHELL_INSET_PX };
  }
  return { paddingLeft: DESKTOP_SHELL_INSET_PX, paddingRight: DESKTOP_SHELL_INSET_PX };
}

/**
 * One shell for every tab: the Projects layout.
 * Phone is pt-4 (wordmark at y≈31) and pb-0 so the scroller reaches the
 * bottom of the viewport and content can move under the dock.
 * Desktop is 24px top (lg:pt-6) with the dock clearance below the fold.
 */
export function tabPanelShellLayout(project: boolean): {
  shellClassName: string;
  contentClassName: string;
} {
  void project;
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
