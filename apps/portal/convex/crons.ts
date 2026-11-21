import { cronJobs } from 'convex/server';
import { internal } from './_generated/api';

/**
 * last_edited_time backstop — catches missed webhooks.
 * Full allowlisted pull for now; incremental filter can tighten later.
 */
const crons = cronJobs();

crons.interval(
  'notion-pull-backstop',
  { minutes: 15 },
  internal.sync.pull.pullAll,
  {},
);

/**
 * Granola import. Without GRANOLA_API_KEY this records that the source is
 * not configured. It does not call Granola and does not write fixture notes.
 */
crons.interval(
  'granola-import',
  { minutes: 15 },
  internal.sync.granola.runImport,
  {},
);

/**
 * Runner runs whose runner went quiet for 30 minutes go back in the queue.
 * One indexed read of running runs, at most 25. With no run open it writes nothing.
 */
crons.interval(
  'release-stuck-runs',
  { minutes: 10 },
  internal.agent.releaseStuckRuns,
  {},
);

/** Live invite tokens past expiresAt become expired and queue Invite Status Expired for Notion. */
crons.interval(
  'expire-invite-tokens',
  { hours: 1 },
  internal.invites.expireDue,
  {},
);

/** Portal → Notion. No-ops unless NOTION_WRITEBACK_ENABLED is exactly "true". */
crons.interval(
  'notion-outbox',
  { minutes: 1 },
  internal.sync.outboxWork.processDue,
  {},
);

/** Drop Blob copies for unpublished / archived Shared Resources. */
crons.daily(
  'blob-gc-unpublished-shared',
  { hourUTC: 7, minuteUTC: 15 },
  internal.sync.blobGc.gcUnpublishedSharedBlobs,
);

/** Processed Notion webhook rows only — never business data. */
crons.daily(
  'sync-events-retention',
  { hourUTC: 8, minuteUTC: 5 },
  internal.sync.queue.deleteExpiredSyncEvents,
  {},
);

/** Convex storage left behind when a client upload never finalized. */
crons.daily(
  'client-upload-orphan-gc',
  { hourUTC: 7, minuteUTC: 45 },
  internal.clientUploads.gcOrphanedUploadBlobs,
  {},
);

export default crons;
