import { SHELL_HANDLER_NAME, decodeShellMessage } from '@warehaus/native-bridge';

/**
 * Which shell the Portal runs in, and what that shell can do (ADR-0006).
 * Pages read this through useShell(); they never import the native bridge or
 * read the user agent. Pure, so it is tested without a browser.
 */
export type ShellKind = 'web' | 'mac';

export type ShellState = {
  kind: ShellKind;
  isMacApp: boolean;
  /** What the shell said it can do in its hello. All false until then. */
  can: { badge: boolean; notify: boolean; openExternal: boolean };
  /** The Mac app version from its hello, or null on the web and before hello. */
  appVersion: string | null;
};

const NONE = Object.freeze({ badge: false, notify: false, openExternal: false });

export const WEB_SHELL: ShellState = Object.freeze({ kind: 'web', isMacApp: false, can: NONE, appVersion: null });

/** Inside the Mac app before its hello arrives: the window CSS applies, nothing else is promised. */
export const MAC_SHELL_WAITING: ShellState = Object.freeze({ kind: 'mac', isMacApp: true, can: NONE, appVersion: null });

/** The `data-shell` value the head boot script set on <html>. Anything else is the web. */
export function shellKindFromAttribute(value: string | null | undefined): ShellKind {
  return value === 'mac' ? 'mac' : 'web';
}

type WebkitWindow = { webkit?: { messageHandlers?: Record<string, unknown> } };

/** The Mac app adds a WKWebView message handler named `warehaus`. A browser has none. */
export function hasMacHandler(win: unknown): boolean {
  const handlers = (win as WebkitWindow | null | undefined)?.webkit?.messageHandlers;
  return typeof handlers === 'object' && handlers !== null && handlers[SHELL_HANDLER_NAME] != null;
}

/**
 * The state after a message from the shell. Only a valid `shell.hello` changes
 * it; a hello on the web is ignored, so a page script cannot pose as the app.
 */
export function shellAfterMessage(current: ShellState, value: unknown): ShellState {
  if (current.kind !== 'mac') return current;
  const decoded = decodeShellMessage(value);
  if (!decoded.ok || decoded.message.type !== 'shell.hello') return current;
  const { appVersion, capabilities } = decoded.message;
  return {
    kind: 'mac',
    isMacApp: true,
    appVersion,
    can: {
      badge: capabilities.includes('badge'),
      notify: capabilities.includes('notify'),
      openExternal: capabilities.includes('openExternal'),
    },
  };
}
