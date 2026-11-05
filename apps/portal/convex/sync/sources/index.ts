/**
 * Task-source registry. Only Notion is wired. Linear arrives read-only in a
 * later PR; until then asking for it is an error, never a silent fallback.
 */

import { SourceError, type TaskSource, type TaskSourceId } from '@warehaus/portal-sync';
import { notionTaskSource } from './notion';

export function taskSourceFor(id: TaskSourceId): TaskSource {
  if (id === 'notion') return notionTaskSource;
  throw new SourceError('invalid', `Task source "${id}" is not wired yet`);
}

export { notionTaskSource };
