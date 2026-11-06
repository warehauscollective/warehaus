/**
 * Pluggable task source (spec: "Portal: Pluggable task source (Notion + Linear)").
 *
 * A task source is where a project's tasks come from. Notion is the default and
 * the only source wired today. Linear is planned as read-only.
 *
 * Rules that hold for every source:
 * - A task row with no `taskSource` is a Notion task.
 * - Config resolves project override → client default → `notion`.
 * - Stage always lives in Notion. A non-Notion source never sets Stage.
 * - Clients see the same Status and Stage whatever the source. The source
 *   badge, source URL, identifier and raw state type are staff-only.
 */

import type { LiveTaskStatus, TaskStage } from './taskBoard';

export const TASK_SOURCE_IDS = ['notion', 'linear'] as const;

export type TaskSourceId = (typeof TASK_SOURCE_IDS)[number];

export const DEFAULT_TASK_SOURCE: TaskSourceId = 'notion';

export type TaskSyncDirection = 'read' | 'two-way';

export function isTaskSourceId(value: unknown): value is TaskSourceId {
  return typeof value === 'string' && (TASK_SOURCE_IDS as readonly string[]).includes(value);
}

/** Missing or unknown `taskSource` on a stored task means Notion. */
export function taskSourceOf(row: { taskSource?: string | null }): TaskSourceId {
  return isTaskSourceId(row.taskSource) ? row.taskSource : DEFAULT_TASK_SOURCE;
}

/** The shape of a `taskSourceConfigs` row the resolver needs. */
export type TaskSourceConfigRow = {
  /** Convex id as a string, so this module stays Convex-free. */
  id: string;
  projectId?: string | null;
  source: TaskSourceId;
  syncDirection: TaskSyncDirection;
  enabled: boolean;
  credentialId?: string | null;
  linear?: { organizationId: string; teamId: string; projectId?: string | null } | null;
};

export type ResolvedTaskSourceConfig = {
  source: TaskSourceId;
  /** Where the answer came from. `default` means no enabled row applied. */
  origin: 'project' | 'client' | 'default';
  syncDirection: TaskSyncDirection;
  configId?: string;
  credentialId?: string;
  linear?: { organizationId: string; teamId: string; projectId?: string };
};

/**
 * Project override → client default → Notion.
 * A disabled row is skipped, so turning a project override off falls back to
 * the client default rather than to Notion.
 * `clientConfig` must be the org row with no projectId; a row passed there that
 * carries a projectId is ignored.
 */
export function resolveTaskSourceConfig(input: {
  projectConfig?: TaskSourceConfigRow | null;
  clientConfig?: TaskSourceConfigRow | null;
}): ResolvedTaskSourceConfig {
  const project = input.projectConfig;
  if (project && project.enabled && project.projectId) {
    return fromRow(project, 'project');
  }
  const client = input.clientConfig;
  if (client && client.enabled && !client.projectId) {
    return fromRow(client, 'client');
  }
  return { source: DEFAULT_TASK_SOURCE, origin: 'default', syncDirection: 'read' };
}

function fromRow(
  row: TaskSourceConfigRow,
  origin: 'project' | 'client',
): ResolvedTaskSourceConfig {
  const resolved: ResolvedTaskSourceConfig = {
    source: row.source,
    origin,
    syncDirection: row.syncDirection,
    configId: row.id,
  };
  if (row.credentialId) resolved.credentialId = row.credentialId;
  if (row.linear) {
    resolved.linear = {
      organizationId: row.linear.organizationId,
      teamId: row.linear.teamId,
      ...(row.linear.projectId ? { projectId: row.linear.projectId } : {}),
    };
  }
  return resolved;
}

// ---------------------------------------------------------------------------
// Adapter contract
// ---------------------------------------------------------------------------

export type TaskSourceCapabilities = {
  /** The portal may edit tasks from this source (subject to that source's own gate). */
  canWrite: boolean;
  supportsWebhooks: boolean;
  supportsDependencies: boolean;
  /** Stage comes from this source. Only Notion. */
  supportsStage: boolean;
};

/** Source-neutral task as an adapter reads it. Not a Convex row. */
export type NeutralTask = {
  source: TaskSourceId;
  /** Notion page id, or Linear issue UUID. */
  externalId: string;
  /** Human id, e.g. ABC-123. Staff-only. */
  identifier?: string;
  /** Link into the source. Staff-only. */
  url?: string;
  title: string;
  description?: string;
  status: LiveTaskStatus;
  hiddenFromClients: boolean;
  /** Only sources with `supportsStage`. */
  stage?: TaskStage | null;
  assignee?: string;
  dependencyExternalIds: string[];
  definitionOfDone?: string;
  dueDate?: string;
  notionContextPageId?: string;
  /** Source edit stamp (ISO). Upserts skip when not newer than stored. */
  sourceUpdatedAt: string;
};

export type TaskPatch = Partial<
  Pick<NeutralTask, 'title' | 'description' | 'status' | 'assignee' | 'dueDate'>
>;

export type UpsertResult =
  | { ok: true; externalId: string; sourceUpdatedAt: string }
  | { ok: false; error: SourceError };

export type SourceErrorKind =
  | 'auth'
  | 'rateLimited'
  | 'notFound'
  | 'conflict'
  | 'transient'
  | 'invalid';

/**
 * Typed adapter error. `auth` marks the credential broken and raises a staff
 * notice; it is never shown to clients.
 */
export class SourceError extends Error {
  readonly kind: SourceErrorKind;
  readonly retryAfterMs?: number;

  constructor(kind: SourceErrorKind, message: string, retryAfterMs?: number) {
    super(message);
    this.name = 'SourceError';
    this.kind = kind;
    if (retryAfterMs !== undefined) this.retryAfterMs = retryAfterMs;
  }
}

export function isSourceError(err: unknown): err is SourceError {
  return err instanceof SourceError;
}

export type ParsedWebhook = {
  deliveryId: string;
  externalIds: string[];
  action: 'create' | 'update' | 'remove';
};

export type StatusMapping = { status: LiveTaskStatus; hiddenFromClients: boolean };

export interface TaskSource {
  readonly id: TaskSourceId;
  readonly capabilities: TaskSourceCapabilities;
  list(
    cfg: ResolvedTaskSourceConfig,
    opts: { updatedSince?: string; cursor?: string },
  ): Promise<{ tasks: NeutralTask[]; nextCursor?: string }>;
  get(cfg: ResolvedTaskSourceConfig, externalId: string): Promise<NeutralTask | null>;
  /**
   * Direct write. Only when `capabilities.canWrite`. A source with its own
   * durable queue (Notion → `notionOutbox`) leaves this unset and keeps writes
   * on that queue.
   */
  upsert?(
    cfg: ResolvedTaskSourceConfig,
    patch: TaskPatch,
    expectedSourceUpdatedAt: string,
    idempotencyKey: string,
  ): Promise<UpsertResult>;
  mapStatus(raw: unknown, ctx: { hasOpenBlocker: boolean }): StatusMapping;
  verifyWebhook?(
    req: { headers: { get(name: string): string | null } },
    rawBody: string,
    cfg: ResolvedTaskSourceConfig | null,
  ): Promise<boolean>;
  parseWebhook?(rawBody: string): ParsedWebhook;
}
