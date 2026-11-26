// Pure helpers for the runner. No network, no child processes, no file writes.
// RUNNER_ID_PATTERN and the deployment names must match apps/portal/convex/_lib/agentRun.ts.
import { COMPLETE_STATUSES, PLAN_TASKS_MAX, PLAN_TASKS_MIN, isMilestoneBranch } from '../../../packages/runner-protocol/index.mjs';

export const RUNNER_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,39}$/;
export const PRODUCTION_DEPLOYMENT = 'unique-turtle-383';
export const REPO_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/;

export const DEV_DEPLOYMENT = 'graceful-mastiff-960';
/** Where `setup` pairs and `start` claims, per deployment. */
export const DEPLOYMENTS = Object.freeze({
  dev: Object.freeze({
    name: DEV_DEPLOYMENT,
    agentUrl: `https://${DEV_DEPLOYMENT}.convex.site`,
    portalUrl: 'http://localhost:3100/projects',
    configFile: 'runner.env',
  }),
  production: Object.freeze({
    name: PRODUCTION_DEPLOYMENT,
    agentUrl: `https://${PRODUCTION_DEPLOYMENT}.convex.site`,
    portalUrl: 'https://warehaus-portal.vercel.app/projects',
    configFile: 'runner.prod.env',
  }),
});
/** The macOS Keychain service the runner secret is stored under. */
export const KEYCHAIN_SERVICE = 'warehaus-runner';

export const USAGE = `Usage:
  npm run runner -- setup [--production] [--id <runner-id>]
  npm run runner -- install [--production]
  npm run runner -- uninstall [--production]
  npm run runner -- start [--production] [--repo <owner/name>] [--id <runner-id>] [--mode interactive|headless] [--once]

setup       Pairs this Mac with the Portal. It prints an 8-character code and
            opens the Portal: staff enter the code in the Runner status modal
            on any project page. The secret goes to this Mac's Keychain only.
  --id      Runner id to propose. Defaults to this Mac's name, with -prod on
            production. Staff can change it when they confirm.

install     Writes a launchd agent that starts the runner at login and
            restarts it if it stops, one per deployment, then loads it. It
            runs headless. Run setup first. uninstall removes it.

start       Takes work from the Portal.
            A registered runner serves every project that names a repository,
            in its own clone under ~/warehaus-runner/repos/<owner>/<name>.
  --repo    Only take work for this repository, as owner/name. Repeat it or
            separate with commas for more than one.
  --id      Runner id. Defaults to the id saved by setup.
  --mode    interactive (default) opens Claude Code for you to drive.
            headless runs "claude -p" and draws on Agent SDK credit.
  --once    Do one piece of work, then exit.

--production  Talks to the production Portal. Never the default: a runner
              paired to production refuses to start without it.

Saved by setup in ~/.config/warehaus/runner.env (runner.prod.env for
production): PORTAL_AGENT_URL and RUNNER_ID. The secret is in the Keychain.
PORTAL_AGENT_URL and RUNNER_TOKEN in the environment still override them.`;

/** Parses `setup …` or `start …`. Returns an error string for anything else. */
export function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (!['start', 'setup', 'install', 'uninstall'].includes(command)) return { ok: false, error: USAGE };
  const options = { command, production: false, id: '', mode: 'interactive', once: false, repos: [] };
  const valued = command === 'start' ? ['--id', '--mode', '--repo'] : command === 'setup' ? ['--id'] : [];
  for (let index = 0; index < rest.length; index += 1) {
    const flag = rest[index];
    if (flag === '--production') {
      options.production = true;
      continue;
    }
    if (flag === '--once' && command === 'start') {
      options.once = true;
      continue;
    }
    if (valued.includes(flag)) {
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
  if (options.id && !RUNNER_ID_PATTERN.test(options.id)) {
    return { ok: false, error: `--id must be 2 to 40 lowercase letters, digits or hyphens.\n\n${USAGE}` };
  }
  if (command !== 'start') return { ok: true, options };
  if (options.mode !== 'interactive' && options.mode !== 'headless') {
    return { ok: false, error: `--mode must be interactive or headless.\n\n${USAGE}` };
  }
  return { ok: true, options };
}

/** The id `setup` proposes: the Mac's name, cleaned to the id rule, with -prod on production. */
export function proposedRunnerId(hostname, production) {
  const base = String(hostname ?? '')
    .toLowerCase()
    .replace(/\.local$/, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, production ? 35 : 40)
    .replace(/-+$/, '');
  const id = `${base || 'runner'}${production ? '-prod' : ''}`;
  return RUNNER_ID_PATTERN.test(id) ? id : production ? 'runner-prod' : 'runner';
}

/** `KEY=value` lines, as setup writes them. Comments and blank lines are skipped. */
export function parseConfigFile(text) {
  const values = {};
  for (const line of String(text ?? '').split('\n')) {
    const match = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (match && !line.trim().startsWith('#')) values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return values;
}

/** What setup saves. Never the secret. */
export function configFileText({ url, id, production }) {
  return [
    `# Warehaus runner, ${production ? 'production' : 'shared dev'}. Written by npm run runner -- setup.`,
    '# The secret is in the macOS Keychain, not here.',
    `PORTAL_AGENT_URL=${url}`,
    `RUNNER_ID=${id}`,
    ...(production ? ['RUNNER_PRODUCTION=1'] : []),
    '',
  ].join('\n');
}

/** The Keychain account for one runner on one deployment. */
export function keychainAccount(deploymentName, id) {
  return `${deploymentName}:${id}`;
}

/**
 * Checks the deployment URL and token. The URL has to be an https Convex site
 * URL. Production is refused unless the runner was started with
 * `--production`, and a production runner refuses any other deployment.
 */
export function readEnv(env, { production = false, token: secret } = {}) {
  const raw = (env.PORTAL_AGENT_URL ?? '').trim().replace(/\/+$/, '');
  const token = (secret ?? env.RUNNER_TOKEN ?? '').trim();
  if (!raw) return { ok: false, error: 'Set PORTAL_AGENT_URL to the deployment site URL, or run npm run runner -- setup.' };
  if (!token) return { ok: false, error: 'No runner secret. Run npm run runner -- setup to pair this Mac.' };
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
  const isProduction = url.hostname.includes(PRODUCTION_DEPLOYMENT);
  if (isProduction && !production) {
    return { ok: false, error: 'That is the production deployment. Start the runner with --production to use it.' };
  }
  if (production && !isProduction) {
    return { ok: false, error: '--production needs the production deployment URL. This runner is set up for another one.' };
  }
  if (env.RUNNER_PRODUCTION === '1' && !production) {
    return { ok: false, error: 'This runner is paired to production. Start it with --production.' };
  }
  return { ok: true, url: url.origin, token, production: isProduction };
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

const SECRET_ENV = /TOKEN|SECRET|KEY|PASSWORD|CREDENTIAL/i;

export function childEnv(parent, extra) {
  const env = {};
  for (const [key, value] of Object.entries(parent ?? {})) {
    if (typeof value !== 'string' || value === '') continue;
    if (CHILD_ENV_EXACT.has(key) || key.startsWith('LC_') || key.startsWith('XDG_')) env[key] = value;
  }
  for (const [key, value] of Object.entries(extra ?? {})) {
    if (SECRET_ENV.test(key) || typeof value !== 'string' || value === '') continue;
    env[key] = value;
  }
  return env;
}

/** Milestone text is data. Fence markers inside it are stripped so it cannot close the fence. */
export function fenceUntrusted(label, value) {
  const text = String(value ?? '').replaceAll('<<<', '').replaceAll('>>>', '');
  return `<<<${label}>>>\n${text}\n<<<END ${label}>>>`;
}

/** Folder name for a milestone worktree: the branch with slashes turned into hyphens. */
export function worktreeName(branch) {
  return branch.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
}

/** The runner's own folder: its clones and worktrees live here, never in a person's checkout. */
export const RUNNER_HOME_DIR = 'warehaus-runner';

/** `owner/name` checked and lowercased, or null. */
export function cloneRepoName(repo) {
  const value = String(repo ?? '').trim();
  if (!REPO_PATTERN.test(value) || value.includes('..')) return null;
  return value.toLowerCase();
}

/** The runner's clone of a repository: <home>/repos/<owner>/<name>. */
export function clonePath(home, repo) {
  const name = cloneRepoName(repo);
  if (!name) throw new Error(`Not a repository: ${repo}`);
  const [owner, project] = name.split('/');
  return `${home}/repos/${owner}/${project}`;
}

/** The worktree for a milestone branch: <home>/worktrees/<owner>/<name>/<branch>. */
export function cloneWorktreePath(home, repo, branch) {
  const name = cloneRepoName(repo);
  if (!name) throw new Error(`Not a repository: ${repo}`);
  const [owner, project] = name.split('/');
  return `${home}/worktrees/${owner}/${project}/${worktreeName(branch)}`;
}

/** The reason a run is blocked when the runner cannot get a clone. Peter sees it in the needs Peter note. */
export function cloneFailedReason(repo) {
  const name = cloneRepoName(repo);
  return name ? `The runner could not clone ${name}` : 'The project has no repository the runner can clone';
}

/** Only `milestone/<slug>` branches are ever created or pushed. The rule lives in the protocol. */
export { isMilestoneBranch };

function fill(template, values) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => (key in values ? String(values[key]) : ''));
}

function goalLines(goals) {
  return goals && goals.length > 0 ? goals.map((goal) => `- ${goal}`).join('\n') : '- (none written)';
}

/**
 * Set by the Portal once Peter presses Approve designs. Empty until then, so a
 * milestone with no design work reads as before. Mirrors designApprovalLine in
 * apps/portal/convex/_lib/designApproval.ts.
 */
export function designApprovalLine(designApprovedAt) {
  if (typeof designApprovedAt !== 'number' || !Number.isFinite(designApprovedAt) || designApprovedAt <= 0) return '';
  const day = new Date(designApprovedAt).toISOString().slice(0, 10);
  return `Design: approved by Peter in the Portal on ${day}. Build tasks can go ahead.`;
}

export function taskPrompt(template, work) {
  return fill(template, {
    designApproval: designApprovalLine(work.milestone.designApprovedAt),
    milestoneName: fenceUntrusted('NAME', work.milestone.name),
    objective: fenceUntrusted('OBJECTIVE', work.milestone.objective),
    goals: fenceUntrusted('GOALS', goalLines(work.milestone.goals)),
    branch: work.milestone.branch,
    taskOrder: String(work.task.order).padStart(2, '0'),
    taskTitle: fenceUntrusted('TITLE', work.task.title),
    taskDetail: fenceUntrusted('DETAIL', work.task.detail || '(no extra detail)'),
  });
}

export function planPrompt(template, work) {
  return fill(template, {
    milestoneName: fenceUntrusted('NAME', work.milestone.name),
    objective: fenceUntrusted('OBJECTIVE', work.milestone.objective),
    goals: fenceUntrusted('GOALS', goalLines(work.milestone.goals)),
  });
}

/**
 * Reads a planner task list: `{ "tasks": [{ "title": "...", "detail": "..." }] }`,
 * 3 to 10 tasks. The planner prints this. It does not write a file.
 */
export function parsePlan(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'The planner did not return JSON.' };
  }
  const tasks = Array.isArray(parsed) ? parsed : parsed?.tasks;
  if (!Array.isArray(tasks)) return { ok: false, error: 'The planner needs a "tasks" list.' };
  if (tasks.length < PLAN_TASKS_MIN || tasks.length > PLAN_TASKS_MAX) {
    return { ok: false, error: `A plan has ${PLAN_TASKS_MIN} to ${PLAN_TASKS_MAX} tasks.` };
  }
  const out = [];
  for (const task of tasks) {
    const title = typeof task === 'string' ? task : task?.title;
    if (typeof title !== 'string' || !title.trim()) return { ok: false, error: 'Every task needs a title.' };
    const detail = typeof task?.detail === 'string' ? task.detail.trim() : '';
    out.push(detail ? { title: title.trim(), detail } : { title: title.trim() });
  }
  return { ok: true, tasks: out };
}

/** Pulls the JSON object out of a planner transcript. Prose around it is ignored. */
export function parsePlanOutput(text) {
  const raw = String(text ?? '');
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return { ok: false, error: 'The planner did not return a task list.' };
  return parsePlan(raw.slice(start, end + 1));
}

/**
 * The build agent for a claim. Planning is always Claude Code. A Cursor
 * project builds with one cloud agent. Anything else stays on Claude Code.
 */
export function selectDriver(work) {
  if (work?.kind === 'planning') return 'claude_code';
  if (work?.kind === 'build' || work?.driver === 'cursor') return 'cursor';
  return 'claude_code';
}

/** Commits matched to tasks by a `Portal-Task:` trailer. The first match wins. */
export function mapCursorCommits(commits, tasks) {
  const wanted = new Set((tasks ?? []).map((task) => task.id));
  const done = [];
  for (const commit of commits ?? []) {
    const sha = String(commit?.sha ?? '').trim().toLowerCase();
    const message = String(commit?.message ?? '');
    const match = /Portal-Task:\s*([A-Za-z0-9:_-]{4,120})/.exec(message);
    if (!match || !wanted.has(match[1]) || !/^[0-9a-f]{7,40}$/.test(sha)) continue;
    if (done.some((row) => row.taskId === match[1])) continue;
    done.push({ taskId: match[1], commitSha: sha });
  }
  return done;
}

/** `git log --format=%H%x1f%B%x1e` into commit records. */
export function parseGitLog(text) {
  return String(text ?? '')
    .split('\x1e')
    .map((row) => row.trim())
    .filter(Boolean)
    .map((row) => {
      const split = row.indexOf('\x1f');
      if (split < 0) return null;
      return { sha: row.slice(0, split).trim(), message: row.slice(split + 1) };
    })
    .filter(Boolean);
}

/** How a finished task run is reported. A blocked file wins. No new commit means the task goes back. */
export function taskOutcome({ before, after, blockedReason }) {
  const reason = (blockedReason ?? '').replace(/\s+/g, ' ').trim();
  const [done, blocked, failed] = COMPLETE_STATUSES;
  if (reason) return { status: blocked, reason: reason.slice(0, 240), ...(after && after !== before ? { commitSha: after } : {}) };
  if (!after || after === before) return { status: failed, reason: 'The run ended with no new commit' };
  return { status: done, commitSha: after };
}

/** Idle wait before the next claim: one minute, doubling to five while nothing is waiting. */
export function idleDelayMs(emptyPolls) {
  return Math.min(5 * 60_000, 60_000 * 2 ** Math.min(Math.max(emptyPolls - 1, 0), 3));
}

/** How often an idle runner pings, so the Portal chip keeps reading Ready (seen within the last 10 minutes). */
export const HEARTBEAT_MS = 75_000;

/**
 * An idle wait cut into heartbeat-sized pieces. The runner pings between
 * pieces. A wait no longer than one heartbeat is a single piece and no ping.
 */
export function heartbeatSlices(waitMs, beatMs = HEARTBEAT_MS) {
  const slices = [];
  let left = Math.max(0, waitMs);
  while (left > beatMs) {
    slices.push(beatMs);
    left -= beatMs;
  }
  if (left > 0 || slices.length === 0) slices.push(left);
  return slices;
}

/**
 * Waits between empty polls, pinging the Portal every heartbeat so the runner
 * health chip keeps reading Ready. A ping claims nothing. A failed one is skipped.
 * `ping` and `sleep` are injected so a test can run the real loop.
 */
export async function idleWait({ ping, ms, sleep = (wait) => new Promise((done) => setTimeout(done, wait)) }) {
  const slices = heartbeatSlices(ms);
  for (let index = 0; index < slices.length; index += 1) {
    await sleep(slices[index]);
    if (index < slices.length - 1) await Promise.resolve().then(ping).catch(() => {});
  }
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
    `Milestone-Id: ${work.milestone.id}`,
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

/** The launchd label, one per deployment, so a dev and a production runner can both be installed. */
export function launchAgentLabel(production) {
  return production ? 'co.warehaus.runner.prod' : 'co.warehaus.runner';
}

function plistText(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * The launchd agent `install` writes. It starts the runner headless at login
 * and restarts it if it stops. --production is written in when asked, so a
 * production runner never starts without it. No secret goes in the file: the
 * runner reads its own from the Keychain.
 */
export function launchAgentPlist({ production, node, cli, workingDirectory, logPath, path }) {
  const label = launchAgentLabel(production);
  const args = [node, cli, 'start', ...(production ? ['--production'] : []), '--mode', 'headless'];
  const strings = (items) => items.map((item) => `    <string>${plistText(item)}</string>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${label}</string>
  <key>ProgramArguments</key>
  <array>
${strings(args)}
  </array>
  <key>WorkingDirectory</key>
  <string>${plistText(workingDirectory)}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${plistText(path)}</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>30</integer>
  <key>StandardOutPath</key>
  <string>${plistText(logPath)}</string>
  <key>StandardErrorPath</key>
  <string>${plistText(logPath)}</string>
</dict>
</plist>
`;
}
