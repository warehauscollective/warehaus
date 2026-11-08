import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { projectCountsForTaskGate } from './gates';
import {
  DEFAULT_TASK_SOURCE,
  SourceError,
  isSourceError,
  isTaskSourceId,
  resolveTaskSourceConfig,
  taskSourceOf,
  type TaskSourceConfigRow,
} from './taskSource';

function row(over: Partial<TaskSourceConfigRow>): TaskSourceConfigRow {
  return {
    id: 'cfg_1',
    source: 'linear',
    syncDirection: 'read',
    enabled: true,
    ...over,
  };
}

describe('taskSourceOf', () => {
  it('treats a missing taskSource as notion', () => {
    assert.equal(taskSourceOf({}), 'notion');
    assert.equal(taskSourceOf({ taskSource: undefined }), 'notion');
    assert.equal(taskSourceOf({ taskSource: null }), 'notion');
  });

  it('treats an unknown value as notion', () => {
    assert.equal(taskSourceOf({ taskSource: 'jira' }), 'notion');
  });

  it('keeps a known source', () => {
    assert.equal(taskSourceOf({ taskSource: 'linear' }), 'linear');
    assert.equal(taskSourceOf({ taskSource: 'notion' }), 'notion');
  });

  it('defaults to notion', () => {
    assert.equal(DEFAULT_TASK_SOURCE, 'notion');
    assert.equal(isTaskSourceId('notion'), true);
    assert.equal(isTaskSourceId('linear'), true);
    assert.equal(isTaskSourceId(''), false);
    assert.equal(isTaskSourceId(undefined), false);
  });
});

describe('resolveTaskSourceConfig', () => {
  it('falls back to notion with no rows', () => {
    assert.deepEqual(resolveTaskSourceConfig({}), {
      source: 'notion',
      origin: 'default',
      syncDirection: 'read',
    });
    assert.equal(
      resolveTaskSourceConfig({ projectConfig: null, clientConfig: null }).source,
      'notion',
    );
  });

  it('uses the client default when there is no project row', () => {
    const resolved = resolveTaskSourceConfig({
      clientConfig: row({
        id: 'cfg_client',
        credentialId: 'cred_1',
        linear: { organizationId: 'org', teamId: 'team', projectId: null },
      }),
    });
    assert.deepEqual(resolved, {
      source: 'linear',
      origin: 'client',
      syncDirection: 'read',
      configId: 'cfg_client',
      credentialId: 'cred_1',
      linear: { organizationId: 'org', teamId: 'team' },
    });
  });

  it('prefers the project override over the client default', () => {
    const resolved = resolveTaskSourceConfig({
      projectConfig: row({ id: 'cfg_project', projectId: 'p1', source: 'notion' }),
      clientConfig: row({ id: 'cfg_client', source: 'linear' }),
    });
    assert.equal(resolved.source, 'notion');
    assert.equal(resolved.origin, 'project');
    assert.equal(resolved.configId, 'cfg_project');
  });

  it('skips a disabled project override and uses the client default', () => {
    const resolved = resolveTaskSourceConfig({
      projectConfig: row({ id: 'cfg_project', projectId: 'p1', enabled: false }),
      clientConfig: row({ id: 'cfg_client', source: 'linear' }),
    });
    assert.equal(resolved.origin, 'client');
    assert.equal(resolved.configId, 'cfg_client');
  });

  it('skips a disabled client default and falls back to notion', () => {
    const resolved = resolveTaskSourceConfig({
      clientConfig: row({ enabled: false }),
    });
    assert.equal(resolved.source, 'notion');
    assert.equal(resolved.origin, 'default');
  });

  it('ignores a project row with no projectId and a client row with one', () => {
    const resolved = resolveTaskSourceConfig({
      projectConfig: row({ id: 'bad_project', projectId: null }),
      clientConfig: row({ id: 'bad_client', projectId: 'p1' }),
    });
    assert.equal(resolved.origin, 'default');
  });

  it('keeps the Linear project scope when set', () => {
    const resolved = resolveTaskSourceConfig({
      projectConfig: row({
        projectId: 'p1',
        syncDirection: 'two-way',
        linear: { organizationId: 'o', teamId: 't', projectId: 'lp' },
      }),
    });
    assert.equal(resolved.syncDirection, 'two-way');
    assert.deepEqual(resolved.linear, { organizationId: 'o', teamId: 't', projectId: 'lp' });
  });
});

describe('SourceError', () => {
  it('carries kind and retryAfterMs', () => {
    const err = new SourceError('rateLimited', 'slow down', 30_000);
    assert.equal(err.kind, 'rateLimited');
    assert.equal(err.retryAfterMs, 30_000);
    assert.equal(err.name, 'SourceError');
    assert.equal(isSourceError(err), true);
    assert.equal(isSourceError(new Error('x')), false);
  });

  it('omits retryAfterMs when not given', () => {
    const err = new SourceError('auth', 'revoked');
    assert.equal('retryAfterMs' in err, false);
  });
});

describe('canceled hide reason', () => {
  it('is treated like trashed by the task-parent gate', () => {
    assert.equal(
      projectCountsForTaskGate({
        visibleToClients: true,
        approvedInternal: true,
        hiddenReason: 'canceled',
      }),
      false,
    );
  });
});
