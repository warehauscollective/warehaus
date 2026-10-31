/**
 * Per-user notification toggles. Stored in Convex. Nothing here sends email.
 * `INVITE_EMAIL_ENABLED` stays unset and Resend is not called.
 */

export const NOTIFICATION_EMAIL_ENABLED = false;

export const NOTIFICATION_PREF_KEYS = [
  'awaitingGo',
  'syncProblems',
  'draftRecaps',
  'inviteNotices',
  'needsAttention',
  'sharedRecaps',
  'weeklySummary',
] as const;

export type NotificationPrefKey = (typeof NOTIFICATION_PREF_KEYS)[number];

export type NotificationPrefs = Record<NotificationPrefKey, boolean>;

/** Figma defaults. Staff invite notices and the client weekly summary start off. */
export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  awaitingGo: true,
  syncProblems: true,
  draftRecaps: true,
  inviteNotices: false,
  needsAttention: true,
  sharedRecaps: true,
  weeklySummary: false,
};

export const STAFF_NOTIFICATION_KEYS = [
  'awaitingGo',
  'syncProblems',
  'draftRecaps',
  'inviteNotices',
] as const satisfies readonly NotificationPrefKey[];

export const CLIENT_NOTIFICATION_KEYS = [
  'needsAttention',
  'sharedRecaps',
  'weeklySummary',
] as const satisfies readonly NotificationPrefKey[];

export function notificationKeysFor(staff: boolean): readonly NotificationPrefKey[] {
  return staff ? STAFF_NOTIFICATION_KEYS : CLIENT_NOTIFICATION_KEYS;
}

function boolOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function normalizeNotificationPrefs(
  input: Partial<NotificationPrefs> | null | undefined,
): NotificationPrefs {
  const defaults = DEFAULT_NOTIFICATION_PREFS;
  return {
    awaitingGo: boolOr(input?.awaitingGo, defaults.awaitingGo),
    syncProblems: boolOr(input?.syncProblems, defaults.syncProblems),
    draftRecaps: boolOr(input?.draftRecaps, defaults.draftRecaps),
    inviteNotices: boolOr(input?.inviteNotices, defaults.inviteNotices),
    needsAttention: boolOr(input?.needsAttention, defaults.needsAttention),
    sharedRecaps: boolOr(input?.sharedRecaps, defaults.sharedRecaps),
    weeklySummary: boolOr(input?.weeklySummary, defaults.weeklySummary),
  };
}

/** Keep the other audience's saved flags when one side saves. */
export function mergeNotificationPrefs(
  current: NotificationPrefs | null | undefined,
  patch: Partial<NotificationPrefs>,
): NotificationPrefs {
  return normalizeNotificationPrefs({ ...normalizeNotificationPrefs(current), ...patch });
}

/** Older builds stored staff flags in localStorage. Client keys were absent. */
export function readLegacyNotificationPrefs(raw: string | null): Partial<NotificationPrefs> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const patch: Partial<NotificationPrefs> = {};
    for (const key of NOTIFICATION_PREF_KEYS) {
      if (typeof parsed[key] === 'boolean') patch[key] = parsed[key];
    }
    return Object.keys(patch).length > 0 ? patch : null;
  } catch {
    return null;
  }
}

/**
 * Keep the signed-in audience's keys. A client must not write staff toggles,
 * and staff must not write client ones. Reject before the merge.
 */
export function audienceNotificationPatch(
  staff: boolean,
  args: Partial<Record<NotificationPrefKey, boolean | undefined>>,
): Partial<NotificationPrefs> {
  const allowed = new Set<NotificationPrefKey>(notificationKeysFor(staff));
  const foreign = NOTIFICATION_PREF_KEYS.filter((key) => args[key] !== undefined && !allowed.has(key));
  if (foreign.length > 0) {
    const who = staff ? 'Staff' : 'Clients';
    const other = staff ? 'client' : 'staff';
    throw new Error(`${who} cannot set ${other} notification settings: ${foreign.join(', ')}`);
  }
  const patch: Partial<NotificationPrefs> = {};
  for (const key of notificationKeysFor(staff)) {
    if (typeof args[key] === 'boolean') patch[key] = args[key];
  }
  return patch;
}
