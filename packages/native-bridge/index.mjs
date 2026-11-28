/**
 * Native bridge: the one place the web Portal and a native shell (the Mac app)
 * agree on the messages between them. ADR-0006, decision 7.
 *
 * Four messages. Shell to page: `shell.hello`, `navigate`. Page to shell:
 * `attention`, `openExternal`. The Swift copy in `swift/` decodes the same
 * examples in `fixtures/messages.json`; a change here changes all three.
 *
 * Only the shell sync module in PortalShell imports this. Pages ask
 * useShell() instead. Plain ESM with no imports, like runner-protocol.
 */

/** Bump only with a matching Swift change. A page refuses a newer hello. */
export const BRIDGE_VERSION = 1;

export const SHELL_CAPABILITIES = Object.freeze(['badge', 'notify', 'openExternal']);
export const ALERT_KINDS = Object.freeze(['ask', 'readyToShip']);
/** Why a blocked Ask's task stopped (its Blocked cause). Only on an `ask` alert for a Blocked task. */
export const ALERT_CAUSES = Object.freeze(['needs_input', 'failed', 'stalled']);
export const PORTAL_LINK_SCHEME = 'warehaus:';
/** At most this many alerts in one attention message. */
export const MAX_ALERTS = 20;

/**
 * Transport. The shell adds a WKWebView script message handler with this name;
 * the page posts with `window.webkit.messageHandlers.warehaus.postMessage(msg)`.
 */
export const SHELL_HANDLER_NAME = 'warehaus';
/** The shell sends to the page by dispatching a CustomEvent with this name on window; `detail` is the message. */
export const SHELL_EVENT = 'warehaus:shell';

const SHELL_TO_PAGE = new Set(['shell.hello', 'navigate']);
const PAGE_TO_SHELL = new Set(['attention', 'openExternal']);

const fail = (reason) => ({ ok: false, reason });
const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const isText = (v) => typeof v === 'string' && v.trim().length > 0;

function urlWithScheme(value, scheme) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === scheme ? url : null;
  } catch {
    return null;
  }
}

function decodeHello(m) {
  if (m.bridgeVersion !== BRIDGE_VERSION) return fail(`bridgeVersion must be ${BRIDGE_VERSION}`);
  if (m.platform !== 'macos') return fail('platform must be macos');
  if (typeof m.appVersion !== 'string' || !/^\d{1,3}\.\d{1,3}\.\d{1,4}$/.test(m.appVersion)) {
    return fail('appVersion must look like 1.4.0');
  }
  if (!Array.isArray(m.capabilities) || !m.capabilities.every((c) => SHELL_CAPABILITIES.includes(c))) {
    return fail(`capabilities must be from ${SHELL_CAPABILITIES.join(', ')}`);
  }
  return {
    ok: true,
    message: {
      type: 'shell.hello',
      bridgeVersion: BRIDGE_VERSION,
      platform: 'macos',
      appVersion: m.appVersion,
      capabilities: [...new Set(m.capabilities)],
    },
  };
}

function decodeNavigate(m) {
  if (!urlWithScheme(m.url, PORTAL_LINK_SCHEME)) return fail('url must be a warehaus:// link');
  return { ok: true, message: { type: 'navigate', url: m.url } };
}

function decodeAlert(a) {
  if (!isObject(a)) return null;
  if (!isText(a.id) || !isText(a.title)) return null;
  if (!ALERT_KINDS.includes(a.kind)) return null;
  if (!urlWithScheme(a.url, PORTAL_LINK_SCHEME)) return null;
  if (typeof a.createdAt !== 'number' || !Number.isFinite(a.createdAt)) return null;
  const alert = { id: a.id, kind: a.kind, title: a.title, url: a.url, createdAt: a.createdAt };
  if (a.cause == null) return alert;
  if (a.kind !== 'ask' || !ALERT_CAUSES.includes(a.cause)) return null;
  return { ...alert, cause: a.cause };
}

function decodeAttention(m) {
  if (!Number.isInteger(m.count) || m.count < 0) return fail('count must be a whole number from 0');
  if (!Array.isArray(m.alerts) || m.alerts.length > MAX_ALERTS) return fail(`alerts must be a list of at most ${MAX_ALERTS}`);
  const alerts = [];
  for (const raw of m.alerts) {
    const alert = decodeAlert(raw);
    if (!alert) return fail('each alert needs an id, a known kind, a title, a warehaus:// url and createdAt, and a known cause if it has one');
    alerts.push(alert);
  }
  return { ok: true, message: { type: 'attention', count: m.count, alerts } };
}

function decodeOpenExternal(m) {
  if (!urlWithScheme(m.url, 'https:')) return fail('url must be an https link');
  return { ok: true, message: { type: 'openExternal', url: m.url } };
}

const DECODERS = {
  'shell.hello': decodeHello,
  navigate: decodeNavigate,
  attention: decodeAttention,
  openExternal: decodeOpenExternal,
};

function decode(value, allowed, direction) {
  if (!isObject(value)) return fail('message must be an object');
  if (!(value.type in DECODERS)) return fail('unknown message type');
  if (!allowed.has(value.type)) return fail(`${value.type} is not a ${direction} message`);
  return DECODERS[value.type](value);
}

/** Reads a message the shell sent to the page. Anything off is refused with one plain reason. */
export function decodeShellMessage(value) {
  return decode(value, SHELL_TO_PAGE, 'shell to page');
}

/** Reads a message the page sent to the shell. The Swift copy does the same on its side. */
export function decodePageMessage(value) {
  return decode(value, PAGE_TO_SHELL, 'page to shell');
}
