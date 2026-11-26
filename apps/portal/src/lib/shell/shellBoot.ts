import { SHELL_EVENT, SHELL_HANDLER_NAME } from '@warehaus/native-bridge';

/** Where the boot script keeps the last hello, in case it lands before React hydrates. */
export const SHELL_HELLO_KEY = '__warehausShellHello';

/** Where the boot script keeps a `navigate` that lands before React hydrates. ShellProvider takes it once. */
export const SHELL_NAVIGATE_KEY = '__warehausShellNavigate';

/**
 * Inline <head> script. Inside the Mac app it sets `data-shell="mac"` on <html>
 * before first paint, so the window inset never flashes, and keeps the shell's
 * hello and any early `navigate` until ShellProvider mounts. In a browser it
 * does nothing.
 */
export const shellBootScript = `(function(){try{var h=window.webkit&&window.webkit.messageHandlers;if(!h||!h[${JSON.stringify(SHELL_HANDLER_NAME)}])return;document.documentElement.dataset.shell='mac';window.addEventListener(${JSON.stringify(SHELL_EVENT)},function(e){var d=e&&e.detail;if(d&&d.type==='shell.hello')window[${JSON.stringify(SHELL_HELLO_KEY)}]=d;if(d&&d.type==='navigate')window[${JSON.stringify(SHELL_NAVIGATE_KEY)}]=d;});}catch(e){}})();`;
