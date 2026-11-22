// Pure helpers for the runner. No network, no child processes, no file writes.

export const RUNNER_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,39}$/;
export const PRODUCTION_DEPLOYMENT = 'unique-turtle-383';
export const REPO_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/;

export const USAGE = `Usage: npm run runner -- start --id <runner-id> --repo <owner/name> [--mode interactive|headless] [--once] [--dir <path>]

  --id      Runner id, as listed in RUNNER_TOKENS on the Convex deployment.
  --repo    GitHub repository this runner serves, as owner/name. Repeat it or
            separate with commas for more than one. The runner is only handed
            work for projects set to one of these.
  --mode    interactive (default) opens Claude Code for you to drive.
            headless runs "claude -p" and draws on Agent SDK credit.
  --once    Do one piece of work, then exit.
  --dir     Checkout of the repository. Defaults to the current directory.

Environment:
  PORTAL_AGENT_URL  The deployment's site URL, like https://<name>.convex.site
  RUNNER_TOKEN      This runner's token.`;

/** Parses `start --id x --mode y --once --repo z`. Returns an error string for anything else. */
export function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (command !== 'start') return { ok: false, error: USAGE };
  const options = { id: '', mode: 'interactive', once: false, dir: '', repos: [] };
  for (let index = 0; index < rest.length; index += 1) {
    const flag = rest[index];
    if (flag === '--once') {
      options.once = true;
      continue;
    }
    if (flag === '--id' || flag === '--mode' || flag === '--repo' || flag === '--dir') {
      const value = rest[index + 1];
      if (!value || value.startsWith('--')) return { ok: false, error: `${flag} needs a value.\n\n${USAGE}` };
      if (flag === '--repo') {
        for (const repo of value.split(',').map((item) => item.trim()).filter(Boolean)) {
          if (!REPO_PATTERN.test(repo)) return { ok: false, error: `--repo must be owner/name, got ${repo}.\n\n${USAGE}` };
          if (!options.repos.includes(repo.toLowerCase())) options.repos.push(repo.toLowerCase());
        }
      } else {
        options[flag.slice(2)] = value;
      }
      index += 1;
      continue;
    }
    return { ok: false, error: `Unknown option ${flag}.\n\n${USAGE}` };
  }
  if (!RUNNER_ID_PATTERN.test(options.id)) {
    return { ok: false, error: `--id must be 2 to 40 lowercase letters, digits or hyphens.\n\n${USAGE}` };
  }
  // Fail safe: with no repository named, the Portal hands this runner nothing.
  if (options.repos.length === 0) {
    return { ok: false, error: `--repo is required: the GitHub repository this runner serves, as owner/name.\n\n${USAGE}` };
  }
  if (options.mode !== 'interactive' && options.mode !== 'headless') {
    return { ok: false, error: `--mode must be interactive or headless.\n\n${USAGE}` };
  }
  return { ok: true, options };
}

/**
 * Checks the two environment values. The URL has to be an https Convex site
 * URL. Production is always refused.
 */
export function readEnv(env) {
  const raw = (env.PORTAL_AGENT_URL ?? '').trim().replace(/\/+$/, '');
  const token = (env.RUNNER_TOKEN ?? '').trim();
  if (!raw) return { ok: false, error: 'Set PORTAL_AGENT_URL to the deployment site URL.' };
  if (!token) return { ok: false, error: 'Set RUNNER_TOKEN to this runner’s token.' };
  let url;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, error: 'PORTAL_AGENT_URL is not a URL.' };
  }
  if (url.protocol !== 'https:') return { ok: false, error: 'PORTAL_AGENT_URL has to be https.' };
  if (!url.hostname.endsWith('.convex.site')) {
    return { ok: false, error: 'PORTAL_AGENT_URL has to be a .convex.site URL.' };
  }
  if (url.hostname.includes(PRODUCTION_DEPLOYMENT)) {
    return { ok: false, error: 'That is the production deployment. The runner does not talk to it.' };
  }
  return { ok: true, url: url.origin, token };
}

/** Names the Claude child may inherit. Everything else, including RUNNER_TOKEN, stays with the runner. */
const CHILD_ENV_EXACT = new Set([
  'PATH',
  'HOME',
  'USER',
  'LOGNAME',
  'SHELL',
  'TMPDIR',
  'TMP',
  'TEMP',
  'LANG',
  'TERM',
  'COLORTERM',
  'SSH_AUTH_SOCK',
  'SSH_AGENT_PID',
  'GIT_AUTHOR_NAME',
  'GIT_AUTHOR_EMAIL',
  'GIT_COMMITTER_NAME',
  'GIT_COMMITTER_EMAIL',
  'CLAUDE_CONFIG_DIR',
]);

export function childEnv(parent, extra) {
  const env = {};
  for (const [key, value] of Object.entries(parent ?? {})) {
    if (typeof value !== 'string' || value === '') continue;
    if (CHILD_ENV_EXACT.has(key) || key.startsWith('LC_') || key.startsWith('XDG_')) env[key] = value;
  }
  for (const [key, value] of Object.entries(extra ?? {})) {
    if (key === 'RUNNER_TOKEN' || typeof value !== 'string' || value === '') continue;
    env[key] = value;
  }
  return env;
}

/** Folder name for a milestone worktree: the branch with slashes turned into hyphens. */
export function worktreeName(branch) {
  return branch.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
}

/** Only `milestone/<slug>` branches are ever created or pushed. */
export function isMilestoneBranch(branch) {
  return /^milestone\/[a-z0-9][a-z0-9-]{0,47}$/.test(branch);
}

function fill(template, values) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => (key in values ? String(values[key]) : ''));
}

function goalLines(goals) {
  return goals && goals.length > 0 ? goals.map((goal) => `- ${goal}`).join('\n') : '- (none written)';
}

export function taskPrompt(template, work) {
  return fill(template, {
    milestoneName: work.milestone.name,
    objective: work.milestone.objective,
    goals: goalLines(work.milestone.goals),
    branch: work.milestone.branch,
    taskOrder: String(work.task.order).padStart(2, '0'),
    taskTitle: work.task.title,
    taskDetail: work.task.detail || '(no extra detail)',
  });
}

export function planPrompt(template, work) {
  return fill(template, {
    milestoneName: work.milestone.name,
    objective: work.milestone.objective,
    goals: goalLines(work.milestone.goals),
  });
}

/**
 * Reads the task list a planning run wrote to `.runner/plan.json`:
 * `{ "tasks": [{ "title": "...", "detail": "..." }] }`, 3 to 10 tasks.
 */
export function parsePlan(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'plan.json is not JSON.' };
  }
  const tasks = Array.isArray(parsed) ? parsed : parsed?.tasks;
  if (!Array.isArray(tasks)) return { ok: false, error: 'plan.json needs a "tasks" list.' };
  if (tasks.length < 3 || tasks.length > 10) return { ok: false, error: 'A plan has 3 to 10 tasks.' };
  const out = [];
  for (const task of tasks) {
    const title = typeof task === 'string' ? task : task?.title;
    if (typeof title !== 'string' || !title.trim()) return { ok: false, error: 'Every task needs a title.' };
    const detail = typeof task?.detail === 'string' ? task.detail.trim() : '';
    out.push(detail ? { title: title.trim(), detail } : { title: title.trim() });
  }
  return { ok: true, tasks: out };
}

/** How a finished task run is reported. A blocked file wins. No new commit means the task goes back. */
export function taskOutcome({ before, after, blockedReason }) {
  const reason = (blockedReason ?? '').replace(/\s+/g, ' ').trim();
  if (reason) return { status: 'blocked', reason: reason.slice(0, 240), ...(after && after !== before ? { commitSha: after } : {}) };
  if (!after || after === before) return { status: 'failed', reason: 'The run ended with no new commit' };
  return { status: 'done', commitSha: after };
}

/** Idle wait before the next claim: one minute, doubling to five while nothing is waiting. */
export function idleDelayMs(emptyPolls) {
  return Math.min(5 * 60_000, 60_000 * 2 ** Math.min(Math.max(emptyPolls - 1, 0), 3));
}

const SECRET_VALUE =
  /(sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|whp_[A-Za-z0-9_-]{12,}|Bearer\s+[A-Za-z0-9._~+/=-]{12,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{6,})/g;

function clip(text, limit) {
  const clean = String(text ?? '').replace(SECRET_VALUE, '[redacted]').replace(/\s+/g, ' ').trim();
  return clean.length > limit ? `${clean.slice(0, limit - 1)}…` : clean;
}

function baseName(path) {
  return String(path ?? '').split('/').filter(Boolean).pop() ?? '';
}

/**
 * Turns a Claude Code hook payload into one short feed line. Only the tool
 * name, a file name or the first words of a command are kept. File contents,
 * command output and the environment are never sent.
 */
export function hookEvent(kind, payload) {
  const data = payload && typeof payload === 'object' ? payload : {};
  if (kind === 'Stop') return { type: 'stop', summary: 'Claude Code stopped' };
  if (kind === 'Notification') {
    const message = clip(data.message, 160);
    return message ? { type: 'note', summary: `Claude Code: ${message}` } : null;
  }
  if (kind !== 'PostToolUse') return null;
  const tool = clip(data.tool_name, 40);
  if (!tool) return null;
  const input = data.tool_input && typeof data.tool_input === 'object' ? data.tool_input : {};
  if (tool === 'Edit' || tool === 'Write' || tool === 'MultiEdit' || tool === 'NotebookEdit') {
    const file = baseName(input.file_path ?? input.notebook_path);
    return file ? { type: 'tool', summary: `Edited ${clip(file, 80)}` } : null;
  }
  if (tool === 'Bash') {
    const command = clip(input.command, 80);
    return command ? { type: 'tool', summary: `Ran ${command}` } : null;
  }
  // Reads and searches are too frequent to be worth a line.
  return null;
}

/** Body of the milestone's one pull request. It names the Portal milestone, as the build protocol asks. */
export function pullRequestBody(work) {
  const goals = work.milestone.goals && work.milestone.goals.length > 0
    ? work.milestone.goals.map((goal) => `- ${goal}`).join('\n')
    : '- (none written)';
  return [
    `Portal milestone: **${work.milestone.name}**`,
    '',
    work.milestone.objective,
    '',
    'Done when:',
    goals,
    '',
    `Branch \`${work.milestone.branch}\`. One pull request for the whole milestone. The runner adds a commit per task.`,
    '',
    'Nothing merges until Peter approves in Grok Bot or the Portal. Merging does not deploy.',
  ].join('\n');
}

/** owner/name from a git remote URL, or null. Used to check the checkout is one the runner serves. */
export function repoFromRemote(url) {
  const match = /github\.com[:/]([A-Za-z0-9-]+\/[A-Za-z0-9._-]+?)(?:\.git)?\/?$/.exec(String(url ?? '').trim());
  return match ? match[1].toLowerCase() : null;
}

/**
 * The default branch name from `git symbolic-ref --short refs/remotes/origin/HEAD`
 * (`origin/main`), or from `gh repo view`. Falls back to main when neither says.
 */
export function defaultBranchName(symbolicRef, ghName) {
  const fromGit = /^origin\/([A-Za-z0-9._/-]+)$/.exec(String(symbolicRef ?? '').trim());
  if (fromGit && !fromGit[1].includes('..')) return fromGit[1];
  const fromGh = String(ghName ?? '').trim();
  if (/^[A-Za-z0-9._/-]+$/.test(fromGh) && !fromGh.includes('..')) return fromGh;
  return 'main';
}
