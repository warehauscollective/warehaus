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

/** Drop Blob copies for unpublished / archived Shared Resources. */
crons.daily(
  'blob-gc-unpublished-shared',
  { hourUTC: 7, minuteUTC: 15 },
  internal.sync.blobGc.gcUnpublishedSharedBlobs,
);

export default crons;
