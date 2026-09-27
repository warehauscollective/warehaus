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

/** Notion outbox. No-ops while NOTION_WRITEBACK_ENABLED is off. */
crons.interval(
  'notion-outbox',
  { minutes: 1 },
  internal.sync.outbox.processDue,
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
