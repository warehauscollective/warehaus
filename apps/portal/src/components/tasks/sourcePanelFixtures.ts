export type TaskSourceLink = {
  id: string;
  kind: string;
  url: string;
  title: string | null;
  addedBy: string;
  createdAt: number;
  state: string | null;
};

export const SOURCE_PANEL_SCREENS = ['empty', 'loading', 'error', 'links'] as const;

export type SourcePanelScreen = (typeof SOURCE_PANEL_SCREENS)[number];

/** Fixture preview only. A missing or unknown value keeps the live empty panel. */
export function readSourceScreen(value: string | null, fixtures: boolean): SourcePanelScreen | null {
  if (!fixtures || !value) return null;
  return (SOURCE_PANEL_SCREENS as readonly string[]).includes(value) ? (value as SourcePanelScreen) : null;
}

const LONG_TITLE =
  'Quarterly seasonal menu photography, packaging, and in-store signage rollout for every Northwind Foods location';

/** Every stored kind, mixed states including no status, and one long title. */
export const SOURCE_PANEL_LINKS: TaskSourceLink[] = [
  {
    id: 'link-chat',
    kind: 'chat request',
    url: 'https://warehaus.studio/requests/homepage-copy',
    title: 'Homepage copy questions',
    addedBy: 'staff',
    createdAt: 1,
    state: 'open',
  },
  {
    id: 'link-pr',
    kind: 'PR',
    url: 'https://github.com/warehauscollective/warehaus/pull/12',
    title: 'Portal API',
    addedBy: 'github',
    createdAt: 2,
    state: 'merged',
  },
  {
    id: 'link-deploy',
    kind: 'deploy',
    url: 'https://warehaus-portal.vercel.app',
    title: null,
    addedBy: 'vercel',
    createdAt: 3,
    state: 'deployed',
  },
  {
    id: 'link-agent',
    kind: 'agent',
    url: 'https://cursor.com/agents/bc-example',
    title: 'Cursor agent',
    addedBy: 'cursor',
    createdAt: 4,
    state: null,
  },
  {
    id: 'link-figma',
    kind: 'Figma frame',
    url: 'https://www.figma.com/design/abc',
    title: 'Task detail',
    addedBy: 'notion',
    createdAt: 5,
    state: null,
  },
  {
    id: 'link-doc',
    kind: 'Notion page or doc',
    url: 'https://www.notion.so/warehaus/spec',
    title: 'Spec',
    addedBy: 'github-webhook',
    createdAt: 6,
    state: 'failed',
  },
  {
    id: 'link-branch',
    kind: 'Repo branch',
    url: 'cursor/sources-panel-punch-list',
    title: null,
    addedBy: 'vercel-webhook',
    createdAt: 7,
    state: 'in_progress',
  },
  {
    id: 'link-long',
    kind: 'PR',
    url: 'https://github.com/warehauscollective/warehaus/pull/104',
    title: LONG_TITLE,
    addedBy: 'claude_bot',
    createdAt: 8,
    state: 'ready',
  },
];
