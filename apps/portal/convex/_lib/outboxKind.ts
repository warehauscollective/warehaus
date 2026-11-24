/**
 * The outbox `kind` validator. It lists the same kinds as `OUTBOX_KINDS` in
 * `@warehaus/portal-sync`; the type check below fails if they drift.
 */

import type { OutboxKind } from '@warehaus/portal-sync';
import { v, type Infer } from 'convex/values';

export const outboxKind = v.union(
  v.literal('task-status'),
  v.literal('task-stage'),
  v.literal('task-fields'),
  v.literal('task-description'),
  v.literal('task-date'),
  v.literal('task-resources'),
  v.literal('task-link'),
  v.literal('task-archive'),
  v.literal('create'),
  v.literal('update'),
  v.literal('project-create'),
  v.literal('client-create'),
  v.literal('createInvite'),
  v.literal('setInviteState'),
  v.literal('revert'),
);

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const kindsMatch: Same<Infer<typeof outboxKind>, OutboxKind> = true;
void kindsMatch;

/** One field stamp: when and by whom a field was last written. */
export const fieldStamp = v.object({ updatedAt: v.number(), updatedBy: v.string() });
