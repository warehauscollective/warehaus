export declare const RUNNER_PATHS: Readonly<{
  claim: '/agent/claim';
  events: '/agent/events';
  tasks: '/agent/tasks';
  complete: '/agent/complete';
  build: '/agent/build';
  ping: '/agent/ping';
}>;
export declare const RUNNER_APP_RELEASE_PATH: '/agent/app-release';
export declare const RUNNER_PAIR_PATHS: Readonly<{
  start: '/agent/pair/start';
  poll: '/agent/pair/poll';
}>;
export declare const RUNNER_PROTOCOL_VERSION: number;
export declare const RUNNER_PROTOCOL_MIN: number;
export declare const RUNNER_PROTOCOL_HEADER: 'x-runner-protocol';
export declare const PLAN_TASKS_MIN: 3;
export declare const PLAN_TASKS_MAX: 10;
export declare const COMPLETE_STATUSES: readonly ['done', 'blocked', 'failed'];
export type CompleteStatus = (typeof COMPLETE_STATUSES)[number];
export declare const MILESTONE_BRANCH: RegExp;
export declare function isMilestoneBranch(value: unknown): value is string;

export type RunnerClient = {
  post(path: string, body: unknown): Promise<Record<string, unknown>>;
  claim(input: { mode: string; repos: string[]; paused?: boolean }): Promise<Record<string, unknown>>;
  ping(input?: { paused?: boolean }): Promise<Record<string, unknown>>;
  appRelease(): Promise<Record<string, unknown>>;
  event(input: { runId: string; type: string; summary: string }): Promise<Record<string, unknown>>;
  writeTasks(input: { runId: string; tasks: Array<{ title: string; detail?: string }> }): Promise<Record<string, unknown>>;
  completeTask(input: {
    runId: string;
    status: CompleteStatus;
    commitSha?: string;
    reason?: string;
    prUrl?: string;
  }): Promise<Record<string, unknown>>;
  failPlanning(input: { runId: string; reason: string }): Promise<Record<string, unknown>>;
  reportBuild(body: Record<string, unknown>): Promise<Record<string, unknown>>;
};

export declare function runnerClient(input: {
  url: string;
  token: string;
  runnerId: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}): RunnerClient;
