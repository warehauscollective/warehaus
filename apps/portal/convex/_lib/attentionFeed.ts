/**
 * Attention feed (see GLOSSARY.md, ADR-0006 multi-platform point 5). What
 * needs the signed-in person right now: the open Asks waiting on them, and
 * Ready to Ship alerts for milestones waiting on someone else's approval.
 * The rules live here so every client (web, the Mac app, later Expo) shows
 * the same feed.
 *
 * Rules:
 * - Staff only. Asks and milestone status are staff matters; anyone else
 *   gets an empty feed.
 * - An open Ask waiting on the viewer is an `ask` alert (Needs you).
 * - An open approval Ask waiting on someone else, on a milestone that is
 *   Ready to Ship, is a `readyToShip` alert. The approval Ask is written on
 *   entering Ready to Ship and closed on leaving it or on approval, so its id
 *   is new on every entry and each iteration alerts once.
 * - The viewer's own actions are left out: an Ask they raised themselves.
 * - Each kind follows a notification preference (`ATTENTION_PREF`).
 * - Archived milestones and clients staff may not read are left out.
 *
 * The alert shape is the native bridge's `AttentionAlert`
 * (`packages/native-bridge`). The test decodes a feed through the bridge.
 *
 * Every read is indexed and bounded: one prefs row, two Ask reads, and one
 * milestone and one client per Ask.
 */

import type { Doc, Id } from '../_generated/dataModel';
import type { QueryCtx } from '../_generated/server';
import { OPEN_ASK_LIMIT, openAsks } from './askStore';
import { isStaff, type PortalIdentity } from './identity';
import { normalizeNotificationPrefs, type NotificationPrefKey, type NotificationPrefs } from './notificationPrefs';
import { staffOrgs } from './staffRead';

export type AttentionKind = 'ask' | 'readyToShip';

export type AttentionAlert = {
  /** The Ask's id. Stable, so a client can tell a new alert from one it has shown. */
  id: string;
  kind: AttentionKind;
  /** The milestone's name. Clients add their own lead-in, such as "Needs you:". */
  title: string;
  /** A `warehaus://` link to the blocked task, or to the milestone. */
  url: string;
  createdAt: number;
};

export type AttentionFeed = { count: number; alerts: AttentionAlert[] };

export const EMPTY_ATTENTION_FEED: AttentionFeed = { count: 0, alerts: [] };

/** Alerts one feed returns. Matches the native bridge's `MAX_ALERTS`. */
export const ATTENTION_LIMIT = 20;

/** Open Asks read to find the approvals waiting on someone else. */
export const READY_TO_SHIP_SCAN = 50;

/**
 * The preference each kind follows. There is no Needs you or Ready to Ship
 * toggle yet, so both follow the one staff toggle about work waiting on a
 * go-ahead. Change this map when those toggles are designed.
 */
export const ATTENTION_PREF: Record<AttentionKind, NotificationPrefKey> = {
  ask: 'awaitingGo',
  readyToShip: 'awaitingGo',
};

/** `warehaus://milestone/<id>?project=<projectId>`, the form `portalLinkHref` opens on the project page. */
export function milestoneLink(milestone: Pick<Doc<'milestones'>, '_id' | 'projectId'>): string {
  return `warehaus://milestone/${milestone._id}?project=${milestone.projectId}`;
}

export function taskLink(taskId: Id<'tasks'>): string {
  return `warehaus://task/${taskId}`;
}

/**
 * The kind of alert an open Ask is for this viewer, or null when it is not
 * theirs to see. Pure.
 */
export function attentionKind(
  ask: Pick<Doc<'milestoneNotes'>, 'waitingOn' | 'reason' | 'addedBy'>,
  milestone: Pick<Doc<'milestones'>, 'status' | 'archivedAt'>,
  viewer: { contactId: string; name: string },
): AttentionKind | null {
  if (milestone.archivedAt != null) return null;
  if (ask.addedBy === viewer.name) return null;
  if (ask.waitingOn === viewer.contactId) return 'ask';
  if (ask.reason === 'approval' && milestone.status === 'Ready to Ship') return 'readyToShip';
  return null;
}

export async function loadAttentionFeed(ctx: QueryCtx, identity: PortalIdentity): Promise<AttentionFeed> {
  if (!isStaff(identity)) return EMPTY_ATTENTION_FEED;
  const contactId = identity.contactId as Id<'contacts'>;
  const row = await ctx.db
    .query('notificationPrefs')
    .withIndex('by_contactId', (q) => q.eq('contactId', contactId))
    .unique();
  const prefs: NotificationPrefs = normalizeNotificationPrefs(row);
  const wants = (kind: AttentionKind) => prefs[ATTENTION_PREF[kind]];
  if (!wants('ask') && !wants('readyToShip')) return EMPTY_ATTENTION_FEED;

  const asks = new Map<Id<'milestoneNotes'>, Doc<'milestoneNotes'>>();
  if (wants('ask')) {
    for (const ask of await openAsks(ctx, { waitingOn: contactId, limit: OPEN_ASK_LIMIT })) asks.set(ask._id, ask);
  }
  if (wants('readyToShip')) {
    for (const ask of await openAsks(ctx, { limit: READY_TO_SHIP_SCAN })) {
      if (ask.reason === 'approval' && ask.waitingOn !== contactId) asks.set(ask._id, ask);
    }
  }

  const orgs = staffOrgs(ctx);
  const milestones = new Map<Id<'milestones'>, Doc<'milestones'> | null>();
  const viewer = { contactId, name: identity.name };
  const alerts: AttentionAlert[] = [];
  const newestFirst = [...asks.values()].sort((a, b) => b.createdAt - a.createdAt);
  for (const ask of newestFirst) {
    if (alerts.length >= ATTENTION_LIMIT) break;
    if (ask.addedBy === viewer.name) continue;
    if (!milestones.has(ask.milestoneId)) milestones.set(ask.milestoneId, await ctx.db.get(ask.milestoneId));
    const milestone = milestones.get(ask.milestoneId);
    if (!milestone) continue;
    const kind = attentionKind(ask, milestone, viewer);
    if (!kind || !wants(kind)) continue;
    const title = milestone.name.trim();
    if (!title) continue;
    if (!(await orgs.visible(ask.orgId))) continue;
    alerts.push({
      id: ask._id,
      kind,
      title,
      url: ask.taskId ? taskLink(ask.taskId) : milestoneLink(milestone),
      createdAt: ask.createdAt,
    });
  }
  return { count: alerts.length, alerts };
}
