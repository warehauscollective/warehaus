'use client';

import { SHELL_EVENT } from '@warehaus/native-bridge';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { SHELL_HELLO_KEY } from './shellBoot';
import {
  MAC_SHELL_WAITING,
  WEB_SHELL,
  shellAfterMessage,
  shellKindFromAttribute,
  type ShellState,
} from './shellState';

const ShellContext = createContext<ShellState>(WEB_SHELL);

/**
 * Mounted once in PortalShell. Starts as the web (server render matches), then
 * reads the boot script's `data-shell` and any hello it kept, and listens for
 * the next one. The window inset is CSS on `data-shell`, so it never waits for this.
 */
export function ShellProvider({ children }: { children: ReactNode }) {
  const [shell, setShell] = useState<ShellState>(WEB_SHELL);

  useEffect(() => {
    if (shellKindFromAttribute(document.documentElement.dataset.shell) !== 'mac') return;
    const kept = (window as unknown as Record<string, unknown>)[SHELL_HELLO_KEY];
    setShell(shellAfterMessage(MAC_SHELL_WAITING, kept));
    const onMessage = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      setShell((current) => shellAfterMessage(current, detail));
    };
    window.addEventListener(SHELL_EVENT, onMessage);
    return () => window.removeEventListener(SHELL_EVENT, onMessage);
  }, []);

  return <ShellContext.Provider value={shell}>{children}</ShellContext.Provider>;
}

/** Which shell the Portal runs in and what it can do. Pages branch on `can`, not on `kind`. */
export function useShell(): ShellState {
  return useContext(ShellContext);
}
