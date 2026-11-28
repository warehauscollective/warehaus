import { MAX_ALERTS, SHELL_HANDLER_NAME, decodePageMessage, type Attention } from '@warehaus/native-bridge';
import type { ShellState } from './shellState';

/**
 * Shell sync (ADR-0006, decision 6): passes the Convex attention feed to
 * whatever shell the Portal runs in. Two adapters. Inside the Mac app the feed
 * goes to the shell as one `attention` message, which sets the Dock badge and
 * posts notifications. In a browser only the count goes in the tab title.
 *
 * Pure, so it is tested without a browser. `ShellSync.tsx` mounts it once in
 * PortalShell; nothing else in the Portal sends to the bridge.
 */

/** What `attention.feed` returns. Kept loose: the bridge decoder is the check. */
export type AttentionFeedView = { count: number; alerts: readonly unknown[] };

export type AttentionAdapter = {
  /** Show this feed. Called again whenever the feed or the shell changes. */
  show: (feed: AttentionFeedView) => void;
  /** Put back what `show` changed. The Mac shell keeps its own state. */
  clear: () => void;
};

/**
 * The `attention` message for a feed, or null when the bridge would refuse it.
 * Runs the bridge's own decoder, so the page never posts what the shell drops.
 */
export function attentionMessage(feed: AttentionFeedView): Attention | null {
  const decoded = decodePageMessage({
    type: 'attention',
    count: feed.count,
    alerts: feed.alerts.slice(0, MAX_ALERTS),
  });
  return decoded.ok && decoded.message.type === 'attention' ? decoded.message : null;
}

type WebkitWindow = {
  webkit?: { messageHandlers?: Record<string, { postMessage?: (message: unknown) => void } | undefined> };
};

/** Posts one message to the Mac app's `warehaus` handler. False when there is none. */
export function postToShell(win: unknown, message: Attention): boolean {
  const handler = (win as WebkitWindow | null | undefined)?.webkit?.messageHandlers?.[SHELL_HANDLER_NAME];
  if (!handler || typeof handler.postMessage !== 'function') return false;
  try {
    handler.postMessage(message);
    return true;
  } catch {
    return false;
  }
}

/** Mac adapter: the whole feed goes to the shell. A feed the bridge refuses is not sent. */
export function macAttentionAdapter(post: (message: Attention) => void): AttentionAdapter {
  return {
    show: (feed) => {
      const message = attentionMessage(feed);
      if (message) post(message);
    },
    clear: () => undefined,
  };
}

const COUNT_PREFIX = /^\(\d+\+?\)\s+/;

/** "(3) Warehaus Portal" while something waits, the plain title at 0. Never stacks a second count. */
export function tabTitleWithCount(title: string, count: number): string {
  const base = title.replace(COUNT_PREFIX, '');
  return Number.isInteger(count) && count > 0 ? `(${count}) ${base}` : base;
}

/** Browser adapter: only the count, in the tab title. */
export function tabTitleAdapter(doc: { title: string }): AttentionAdapter {
  const set = (count: number) => {
    const next = tabTitleWithCount(doc.title, count);
    if (next !== doc.title) doc.title = next;
  };
  return { show: (feed) => set(feed.count), clear: () => set(0) };
}

/**
 * The adapter for this shell, or null when there is nothing to show it on:
 * inside the Mac app before its hello, or when the app claims neither the
 * badge nor notifications. The Mac window has no tab, so it never gets the
 * title adapter.
 */
export function attentionAdapterFor(
  shell: ShellState,
  env: { doc: { title: string }; post: (message: Attention) => void },
): AttentionAdapter | null {
  if (shell.kind !== 'mac') return tabTitleAdapter(env.doc);
  if (!shell.can.badge && !shell.can.notify) return null;
  return macAttentionAdapter(env.post);
}
