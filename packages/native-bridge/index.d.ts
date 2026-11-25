export declare const BRIDGE_VERSION: 1;
export declare const SHELL_CAPABILITIES: readonly ShellCapability[];
export declare const ALERT_KINDS: readonly AlertKind[];
export declare const PORTAL_LINK_SCHEME: 'warehaus:';
export declare const MAX_ALERTS: number;

export type ShellCapability = 'badge' | 'notify' | 'openExternal';
export type AlertKind = 'ask' | 'readyToShip';

/** A warehaus:// link. The Portal resolves it to a page; the shell never parses it. */
export type PortalLink = string;

export type ShellHello = {
  type: 'shell.hello';
  bridgeVersion: 1;
  platform: 'macos';
  appVersion: string;
  capabilities: ShellCapability[];
};

export type Navigate = { type: 'navigate'; url: PortalLink };

export type AttentionAlert = {
  id: string;
  kind: AlertKind;
  title: string;
  url: PortalLink;
  createdAt: number;
};

export type Attention = { type: 'attention'; count: number; alerts: AttentionAlert[] };

export type OpenExternal = { type: 'openExternal'; url: string };

export type ShellMessage = ShellHello | Navigate;
export type PageMessage = Attention | OpenExternal;

export type Decoded<T> = { ok: true; message: T } | { ok: false; reason: string };

export declare function decodeShellMessage(value: unknown): Decoded<ShellMessage>;
export declare function decodePageMessage(value: unknown): Decoded<PageMessage>;
