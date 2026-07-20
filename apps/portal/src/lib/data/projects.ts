/**
 * Project workspace model — everything Warehaus needs on a single engagement:
 * client, context, tasks, design, build/repo, and shared resources.
 * Mock data scaffolds the portal UI until a real store is wired.
 */

export type ProjectPhase = 'Discovery' | 'Design' | 'Build' | 'Launch' | 'Care';

export type TaskStatus = 'todo' | 'doing' | 'blocked' | 'done';

export interface ProjectClient {
  name: string;
  industry: string;
  primaryContact: string;
  role: string;
  email: string;
  slack?: string;
}

export interface ProjectTask {
  id: string;
  title: string;
  status: TaskStatus;
  owner: string;
  due: string;
}

export interface ProjectLink {
  label: string;
  href: string;
  kind: 'figma' | 'repo' | 'doc' | 'drive' | 'notion' | 'url' | 'loom' | 'vercel';
}

export interface ProjectResource {
  id: string;
  title: string;
  type: string;
  updated: string;
  href?: string;
}

export interface Project {
  id: string;
  /** URL segment under `/projects/[slug]`. */
  slug: string;
  name: string;
  phase: ProjectPhase;
  owner: string;
  due: string;
  summary: string;
  /** Engagement brief / working context. */
  context: {
    problem: string;
    outcome: string;
    audience: string;
    constraints: string[];
    notes: string;
  };
  client: ProjectClient;
  tasks: ProjectTask[];
  design: {
    files: ProjectLink[];
    systems: string[];
    latest: string;
  };
  build: {
    repos: ProjectLink[];
    environments: ProjectLink[];
    stack: string[];
  };
  resources: ProjectResource[];
}

export const PROJECT_PIPELINE = [
  { n: '01', h: 'Brief', p: 'Scope lands from Dream. One owner, one outcome.' },
  { n: '02', h: 'Design', p: 'Surfaces and flows — empty/error first.' },
  { n: '03', h: 'Build', p: 'Ship into the product. End inside real work.' },
  { n: '04', h: 'Launch', p: 'Handoff, train, and watch the first weeks.' },
] as const;

export const PROJECTS: Project[] = [
  {
    id: 'PRJ-108',
    slug: 'portal-chatroom',
    name: 'Portal chatroom v1',
    phase: 'Design',
    owner: 'A. Okonkwo',
    due: 'Apr 18',
    summary: 'Threaded ops chat inside the Warehaus portal — replace Slack sprawl for live project rooms.',
    context: {
      problem: 'Project conversation is scattered across Slack, email, and Figma comments.',
      outcome: 'A first-class chatroom tab with threads tied to each engagement.',
      audience: 'Warehaus PMs, designers, and engineers on active builds.',
      constraints: ['Ship inside existing portal shell', 'Mobile-usable', 'No new auth provider'],
      notes: 'Pair with activity feed for @mentions. Empty state should invite the first thread.',
    },
    client: {
      name: 'Warehaus Collective',
      industry: 'Digital product agency (internal)',
      primaryContact: 'Peter Roquemore',
      role: 'Partner',
      email: 'peter@warehaus.co',
      slack: '#portal-chatroom',
    },
    tasks: [
      { id: 'T-41', title: 'Thread list + inspector layout', status: 'done', owner: 'A. Okonkwo', due: 'Apr 04' },
      { id: 'T-42', title: 'Compose surface + mentions', status: 'doing', owner: 'A. Okonkwo', due: 'Apr 12' },
      { id: 'T-43', title: 'Link threads to project workspace', status: 'todo', owner: 'M. Chen', due: 'Apr 16' },
      { id: 'T-44', title: 'Presence + unread badges', status: 'todo', owner: 'J. Park', due: 'Apr 18' },
    ],
    design: {
      latest: 'v0.4 — compose + thread inspector',
      systems: ['Portal tokens', 'Bevel surfaces', 'Dock + sidebar shell'],
      files: [
        { label: 'Chatroom flows', href: '#', kind: 'figma' },
        { label: 'Empty / error states', href: '#', kind: 'figma' },
        { label: 'Component inventory', href: '#', kind: 'notion' },
      ],
    },
    build: {
      stack: ['Next.js', 'Turborepo', '@warehaus/ui'],
      repos: [{ label: 'warehaus / apps/portal', href: '#', kind: 'repo' }],
      environments: [
        { label: 'Preview', href: 'https://warehaus-portal.vercel.app', kind: 'vercel' },
        { label: 'Local :3100', href: 'http://localhost:3100/chatroom', kind: 'url' },
      ],
    },
    resources: [
      { id: 'R-1', title: 'Kickoff notes', type: 'Doc', updated: 'Mar 28' },
      { id: 'R-2', title: 'Competitor scan (Linear / Slack)', type: 'Doc', updated: 'Mar 30' },
      { id: 'R-3', title: 'Voice & tone for ops chat', type: 'Guide', updated: 'Apr 02' },
    ],
  },
  {
    id: 'PRJ-104',
    slug: 'meridian-patient-portal',
    name: 'Meridian patient portal',
    phase: 'Build',
    owner: 'M. Chen',
    due: 'Apr 12',
    summary: 'Patient-facing portal for scheduling, results, and secure messaging — replacing a legacy portal.',
    context: {
      problem: 'Patients abandon the old portal; staff field the same questions by phone.',
      outcome: 'A calm, accessible portal that cuts call volume and raises portal logins.',
      audience: 'Patients 35–70 and Meridian care coordinators.',
      constraints: ['HIPAA-aware patterns', 'WCAG 2.2 AA', 'SSO with existing IdP'],
      notes: 'Design system must survive handoff to Meridian eng. Prefer progressive disclosure on results.',
    },
    client: {
      name: 'Meridian Health',
      industry: 'Healthcare',
      primaryContact: 'Dana Ortiz',
      role: 'VP Digital Experience',
      email: 'dortiz@meridian.example',
      slack: '#client-meridian',
    },
    tasks: [
      { id: 'T-12', title: 'Results list + detail', status: 'done', owner: 'M. Chen', due: 'Mar 20' },
      { id: 'T-18', title: 'Secure messaging MVP', status: 'doing', owner: 'S. Rivera', due: 'Apr 08' },
      { id: 'T-21', title: 'Scheduling reschedule flow', status: 'blocked', owner: 'J. Park', due: 'Apr 10' },
      { id: 'T-22', title: 'Accessibility pass', status: 'todo', owner: 'A. Okonkwo', due: 'Apr 12' },
    ],
    design: {
      latest: 'v1.2 — messaging + scheduling polish',
      systems: ['Meridian DS (Figma)', 'Warehaus tokens (bridge)'],
      files: [
        { label: 'Patient portal — master', href: '#', kind: 'figma' },
        { label: 'Prototype (messaging)', href: '#', kind: 'figma' },
        { label: 'Handoff checklist', href: '#', kind: 'notion' },
      ],
    },
    build: {
      stack: ['Next.js', 'Clerk', 'Postgres'],
      repos: [
        { label: 'meridian-portal', href: '#', kind: 'repo' },
        { label: 'meridian-api', href: '#', kind: 'repo' },
      ],
      environments: [
        { label: 'Staging', href: '#', kind: 'vercel' },
        { label: 'Design QA', href: '#', kind: 'url' },
      ],
    },
    resources: [
      { id: 'R-10', title: 'Discovery synthesis', type: 'Doc', updated: 'Feb 12' },
      { id: 'R-11', title: 'HIPAA pattern notes', type: 'Guide', updated: 'Feb 18' },
      { id: 'R-12', title: 'Stakeholder map', type: 'Doc', updated: 'Feb 04' },
      { id: 'R-13', title: 'Usability round 2 reel', type: 'Loom', updated: 'Mar 22', href: '#' },
    ],
  },
  {
    id: 'PRJ-111',
    slug: 'atlas-ops-console',
    name: 'Atlas ops console',
    phase: 'Discovery',
    owner: 'J. Park',
    due: 'May 02',
    summary: 'Operator console for dock capacity, exceptions, and live board — discovery through clickable prototype.',
    context: {
      problem: 'Yard managers run the day from whiteboards and three spreadsheets.',
      outcome: 'A single console that surfaces capacity, exceptions, and handoffs.',
      audience: 'Dock leads and regional ops managers.',
      constraints: ['Must work on warehouse tablets', 'Offline-tolerant read views'],
      notes: 'Heavy research week — shadow two shifts before locking IA.',
    },
    client: {
      name: 'Atlas Freight',
      industry: 'Logistics',
      primaryContact: 'Chris Nguyen',
      role: 'Director of Operations',
      email: 'cnguyen@atlas.example',
      slack: '#client-atlas',
    },
    tasks: [
      { id: 'T-01', title: 'Site visits + interview notes', status: 'doing', owner: 'J. Park', due: 'Apr 22' },
      { id: 'T-02', title: 'Current-state journey map', status: 'todo', owner: 'A. Okonkwo', due: 'Apr 26' },
      { id: 'T-03', title: 'Opportunity brief', status: 'todo', owner: 'J. Park', due: 'May 02' },
    ],
    design: {
      latest: 'Research board — no UI yet',
      systems: ['Pending — will extend portal patterns'],
      files: [
        { label: 'Research FigJam', href: '#', kind: 'figma' },
        { label: 'Interview tracker', href: '#', kind: 'notion' },
      ],
    },
    build: {
      stack: ['TBD'],
      repos: [],
      environments: [],
    },
    resources: [
      { id: 'R-20', title: 'SOW / discovery charter', type: 'Doc', updated: 'Apr 01' },
      { id: 'R-21', title: 'Competitor landscape', type: 'Doc', updated: 'Apr 08' },
    ],
  },
  {
    id: 'PRJ-115',
    slug: 'loom-brand-site',
    name: 'Loom brand site',
    phase: 'Build',
    owner: 'S. Rivera',
    due: 'May 09',
    summary: 'Marketing site rebuild for Loom Studio — expressive type, case studies, and a tight contact path.',
    context: {
      problem: 'Current site undersells craft; leads bounce before the work.',
      outcome: 'A brand-first site that books discovery calls.',
      audience: 'Founders hiring a design partner.',
      constraints: ['CMS for case studies', 'Ship before brand film launch'],
      notes: 'Hero must pass the brand test — Loom name is the signal, not a thin eyebrow.',
    },
    client: {
      name: 'Loom Studio',
      industry: 'Creative / brand',
      primaryContact: 'Ivy Chen',
      role: 'Creative Director',
      email: 'ivy@loom.example',
      slack: '#client-loom',
    },
    tasks: [
      { id: 'T-30', title: 'Case study template', status: 'doing', owner: 'S. Rivera', due: 'Apr 28' },
      { id: 'T-31', title: 'CMS content model', status: 'doing', owner: 'M. Chen', due: 'Apr 30' },
      { id: 'T-32', title: 'Motion pass (hero + work)', status: 'todo', owner: 'A. Okonkwo', due: 'May 06' },
      { id: 'T-33', title: 'Launch checklist', status: 'todo', owner: 'S. Rivera', due: 'May 09' },
    ],
    design: {
      latest: 'v0.9 — approved art direction',
      systems: ['Loom brand kit', 'Custom type pairing'],
      files: [
        { label: 'Site — production file', href: '#', kind: 'figma' },
        { label: 'Motion board', href: '#', kind: 'figma' },
        { label: 'Brand PDF', href: '#', kind: 'drive' },
      ],
    },
    build: {
      stack: ['Next.js', 'Payload CMS', 'Vercel'],
      repos: [{ label: 'loom-site', href: '#', kind: 'repo' }],
      environments: [
        { label: 'Preview', href: '#', kind: 'vercel' },
        { label: 'Staging CMS', href: '#', kind: 'url' },
      ],
    },
    resources: [
      { id: 'R-40', title: 'Brand guidelines', type: 'PDF', updated: 'Mar 14' },
      { id: 'R-41', title: 'Photo / film assets', type: 'Drive', updated: 'Apr 02', href: '#' },
      { id: 'R-42', title: 'Kickoff recording', type: 'Loom', updated: 'Mar 10', href: '#' },
    ],
  },
];

export function getProjectBySlug(slug: string): Project | undefined {
  return PROJECTS.find((p) => p.slug === slug || p.id === slug);
}

export function projectHref(project: Pick<Project, 'slug'>): string {
  return `/projects/${project.slug}`;
}

export function countByPhase(phase: ProjectPhase): number {
  return PROJECTS.filter((p) => p.phase === phase).length;
}
