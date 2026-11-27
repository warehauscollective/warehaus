'use client';

import { SHELL_EVENT } from '@warehaus/native-bridge';
import { useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { openPortalHref } from '../nav/openPortalHref';
import { SHELL_HELLO_KEY, SHELL_NAVIGATE_KEY } from './shellBoot';
import {
  MAC_SHELL_WAITING,
  WEB_SHELL,
  shellAfterMessage,
  shellKindFromAttribute,
  shellNavigateHref,
  type ShellState,
} from './shellState';

const ShellContext = createContext<ShellState>(WEB_SHELL);

/**
 * Mounted once in PortalShell. Starts as the web (server render matches), then
 * reads the boot script's `data-shell` and any hello it kept, and listens for
 * the next one. The window inset is CSS on `data-shell`, so it never waits for this.
 *
 * A `navigate` from the shell (a warehaus:// link) opens the Portal path
 * `portalLinkHref` resolves it to. One that landed before hydration is taken
 * from the boot script once.
 */
export function ShellProvider({ children }: { children: ReactNode }) {
  const [shell, setShell] = useState<ShellState>(WEB_SHELL);
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;

  useEffect(() => {
    if (shellKindFromAttribute(document.documentElement.dataset.shell) !== 'mac') return;
    const store = window as unknown as Record<string, unknown>;
    const navigate = (value: unknown) => {
      const href = shellNavigateHref(MAC_SHELL_WAITING, value);
      if (href) openPortalHref(href, (next) => routerRef.current.push(next));
    };
    setShell(shellAfterMessage(MAC_SHELL_WAITING, store[SHELL_HELLO_KEY]));
    const early = store[SHELL_NAVIGATE_KEY];
    delete store[SHELL_NAVIGATE_KEY];
    navigate(early);
    const onMessage = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      setShell((current) => shellAfterMessage(current, detail));
      navigate(detail);
      delete store[SHELL_NAVIGATE_KEY];
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
