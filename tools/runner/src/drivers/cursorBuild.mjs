// One step of a Cursor build: publish the milestone branch, launch or follow
// the cloud agent, and report to the Portal. The Cursor API key is passed in
// and used only for the Cursor request. It is never sent to the Portal,
// written into a prompt, or printed.
//
// Everything outside this function is passed in, so the whole branch flow
// runs in a test against a throwaway repository with the Cursor API mocked.

import { mapCursorCommits, parseGitLog } from '../lib.mjs';
import { cursorBuildPrompt, cursorCreateBody, cursorRequest } from './cursor.mjs';

/**
 * @param {object} input
 * @param {{ repo: string }} input.config  `repo` is the checkout directory.
 * @param {string} [input.checkout]  The runner's clone of that repository. Defaults to config.repo.
 * @param {string} input.repoName  GitHub `owner/name` the agent works in.
 * @param {object} input.work  The build job from `POST /agent/claim`.
 * @param {string} input.key  The Cursor API key, read by the caller. Empty blocks the build.
 * @param {ReturnType<import('../repo.mjs').repoTools>} input.tools
 * @param {(path: string, body: object) => Promise<object>} input.call  Posts to the Portal.
 * @param {typeof fetch} [input.fetchImpl]  The Cursor HTTP client. Tests pass a mock.
 * @param {(message: string) => void} [input.say]
 * @returns {Promise<'running' | 'settled'>}
 */
export async function cursorBuild({ config, checkout = config.repo, repoName, work, key, tools, call, fetchImpl, say = () => {} }) {
  const branch = work.milestone.branch;
  const fail = async (reason, extra = {}) => {
    await call('/agent/build', { runId: work.runId, status: 'failed', reason, ...extra });
    return 'settled';
  };
  if (!key) return fail('The Cursor API key is not set on this runner');
  let agentId = work.externalId || '';
  let agentUrl = work.externalUrl || '';
  if (!agentId) {
    // The branch has to exist on origin before the agent starts: see cursorCreateBody.
    const published = tools.publishMilestoneBranch(checkout, branch);
    if (!published.ok) return fail(published.error);
    const prompt = cursorBuildPrompt('', { ...work, repo: repoName });
    const created = await cursorRequest({
      key,
      path: '',
      method: 'POST',
      body: cursorCreateBody({ repo: repoName, branch, prompt }),
      fetchImpl,
    });
    if (!created.ok) return fail(created.error);
    agentId = created.agent.id;
    agentUrl = created.agent.url;
    await call('/agent/build', {
      runId: work.runId,
      status: 'running',
      ...(agentId ? { agentId } : {}),
      ...(agentUrl ? { agentUrl } : {}),
    });
    if (created.agent.state !== 'finished') {
      say('Cursor agent is running.');
      return 'running';
    }
  }
  const looked = await cursorRequest({ key, path: `/${encodeURIComponent(agentId)}`, method: 'GET', fetchImpl });
  if (!looked.ok) return fail(looked.error);
  if (looked.agent.state === 'running') {
    say('Cursor agent is still running.');
    return 'running';
  }
  const link = agentUrl || looked.agent.url;
  if (looked.agent.state === 'failed') return fail(looked.agent.reason, link ? { agentUrl: link } : {});
  tools.git(checkout, ['fetch', 'origin', branch, '--quiet']);
  const log = tools.git(checkout, ['log', `origin/${branch}`, '--format=%H%x1f%B%x1e']);
  const done = mapCursorCommits(parseGitLog(log.out), work.tasks ?? []);
  if (done.length === 0) {
    return fail('The Cursor agent finished without a Portal-Task trailer', link ? { agentUrl: link } : {});
  }
  const dir = tools.ensureWorktree(checkout, branch);
  const prUrl = looked.agent.prUrl || tools.ensurePullRequest(dir, work);
  const result = await call('/agent/build', {
    runId: work.runId,
    status: 'finished',
    ...(agentId ? { agentId } : {}),
    ...(link ? { agentUrl: link } : {}),
    tasks: done,
    ...(prUrl ? { prUrl } : {}),
  });
  if (result.milestoneStatus === 'Ready to Ship') tools.markReadyForReview(dir, branch);
  say(`Cursor finished ${done.length} tasks${result.milestoneStatus ? ` · milestone is ${result.milestoneStatus}` : ''}`);
  return 'settled';
}
