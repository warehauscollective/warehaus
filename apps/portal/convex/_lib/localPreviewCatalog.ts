/**
 * Fake local-preview records. Names are sample companies, not Warehaus clients.
 * Notion page ids stay on the `seed-local-` prefix so auth write-back skips them.
 * This stack has no separate task Stage field — board columns are Status.
 */

export type PreviewRole = 'Client Admin' | 'Client Member' | 'Warehaus Staff';

export type PreviewOrg = {
  slug: string;
  companyName: string;
  externalId: string;
  notionPageId: string;
  primaryEmail: string;
  status: string;
};

export type PreviewContact = {
  email: string;
  name: string;
  role: PreviewRole;
  orgSlug: string;
  externalId: string;
  notionPageId: string;
};

export type PreviewProject = {
  externalId: string;
  notionPageId: string;
  orgSlug: string;
  name: string;
  description: string;
  status: string;
  progress: number;
  type: string[];
  stack: string[];
};

export type PreviewTask = {
  externalId: string;
  notionPageId: string;
  projectExternalId: string;
  name: string;
  status: string;
  isDone: boolean;
};

export type PreviewResource = {
  externalId: string;
  notionPageId: string;
  orgSlug: string;
  projectExternalId: string;
  title: string;
  description: string;
  url: string;
};

export type PreviewActivity = {
  orgSlug: string;
  projectExternalId?: string;
  name: string;
  summary: string;
  type: 'project' | 'team';
  tone: string;
  ageMs: number;
};

export const PREVIEW_ORGS: PreviewOrg[] = [
  {
    slug: 'northwind',
    companyName: 'Northwind Traders',
    externalId: 'wh_cli_preview_northwind',
    notionPageId: 'seed-local-client-northwind',
    primaryEmail: 'ops@northwind.test',
    status: 'Active',
  },
  {
    slug: 'contoso',
    companyName: 'Contoso Studio',
    externalId: 'wh_cli_preview_contoso',
    notionPageId: 'seed-local-client-contoso',
    primaryEmail: 'ops@contoso.test',
    status: 'Active',
  },
  {
    slug: 'fabrikam',
    companyName: 'Fabrikam Goods',
    externalId: 'wh_cli_preview_fabrikam',
    notionPageId: 'seed-local-client-fabrikam',
    primaryEmail: 'ops@fabrikam.test',
    status: 'Paused',
  },
  {
    slug: 'warehaus-internal',
    companyName: 'Warehaus Internal',
    externalId: 'wh_cli_preview_warehaus_internal',
    notionPageId: 'seed-local-client-warehaus-internal',
    primaryEmail: 'studio@warehaus.test',
    status: 'Active',
  },
];

export const PREVIEW_CONTACTS: PreviewContact[] = [
  {
    email: 'ada.admin@warehaus.test',
    name: 'Ada Admin',
    role: 'Warehaus Staff',
    orgSlug: 'warehaus-internal',
    externalId: 'wh_con_preview_ada',
    notionPageId: 'seed-local-contact-ada',
  },
  {
    email: 'olivia.owner@northwind.test',
    name: 'Olivia North',
    role: 'Client Admin',
    orgSlug: 'northwind',
    externalId: 'wh_con_preview_olivia',
    notionPageId: 'seed-local-contact-olivia',
  },
  {
    email: 'jordan.owner@contoso.test',
    name: 'Jordan Hale',
    role: 'Client Admin',
    orgSlug: 'contoso',
    externalId: 'wh_con_preview_jordan',
    notionPageId: 'seed-local-contact-jordan',
  },
  {
    email: 'sam.owner@fabrikam.test',
    name: 'Sam Okonkwo',
    role: 'Client Member',
    orgSlug: 'fabrikam',
    externalId: 'wh_con_preview_sam',
    notionPageId: 'seed-local-contact-sam',
  },
];

export const PREVIEW_PROJECTS: PreviewProject[] = [
  {
    externalId: 'wh_prj_preview_northwind_storefront',
    notionPageId: 'seed-local-project-northwind-storefront',
    orgSlug: 'northwind',
    name: 'Storefront refresh',
    description: 'Sample storefront for the fake Northwind Traders account.',
    status: 'In progress',
    progress: 0.45,
    type: ['Website'],
    stack: ['Next.js'],
  },
  {
    externalId: 'wh_prj_preview_northwind_packaging',
    notionPageId: 'seed-local-project-northwind-packaging',
    orgSlug: 'northwind',
    name: 'Packaging system',
    description: 'Sample packaging exploration. Not a real engagement.',
    status: 'Planned',
    progress: 0.1,
    type: ['Brand'],
    stack: ['Figma'],
  },
  {
    externalId: 'wh_prj_preview_contoso_launch',
    notionPageId: 'seed-local-project-contoso-launch',
    orgSlug: 'contoso',
    name: 'Launch site',
    description: 'Sample launch site for the fake Contoso Studio account.',
    status: 'Inbox',
    progress: 0,
    type: ['Website'],
    stack: ['Next.js'],
  },
  {
    externalId: 'wh_prj_preview_fabrikam_catalog',
    notionPageId: 'seed-local-project-fabrikam-catalog',
    orgSlug: 'fabrikam',
    name: 'Catalog cleanup',
    description: 'Sample catalog pass for the fake Fabrikam Goods account.',
    status: 'Done',
    progress: 1,
    type: ['Website'],
    stack: ['Notion'],
  },
  {
    externalId: 'wh_prj_preview_internal_warehaus',
    notionPageId: 'seed-local-project-internal-warehaus',
    orgSlug: 'warehaus-internal',
    name: 'Internal Warehaus',
    description: 'Sample internal Warehaus project. Type is Studio so the staff list can show it.',
    status: 'In progress',
    progress: 0.2,
    type: ['Studio'],
    stack: ['Convex'],
  },
];

export const PREVIEW_TASKS: PreviewTask[] = [
  {
    externalId: 'wh_tsk_preview_logo',
    notionPageId: 'seed-local-task-logo',
    projectExternalId: 'wh_prj_preview_northwind_storefront',
    name: 'Collect logo files',
    status: 'Inbox',
    isDone: false,
  },
  {
    externalId: 'wh_tsk_preview_homepage',
    notionPageId: 'seed-local-task-homepage',
    projectExternalId: 'wh_prj_preview_northwind_storefront',
    name: 'Draft homepage',
    status: 'To Do',
    isDone: false,
  },
  {
    externalId: 'wh_tsk_preview_grid',
    notionPageId: 'seed-local-task-grid',
    projectExternalId: 'wh_prj_preview_northwind_storefront',
    name: 'Build product grid',
    status: 'In Progress',
    isDone: false,
  },
  {
    externalId: 'wh_tsk_preview_copy',
    notionPageId: 'seed-local-task-copy',
    projectExternalId: 'wh_prj_preview_northwind_storefront',
    name: 'Waiting on copy',
    status: 'Blocked',
    isDone: false,
  },
  {
    externalId: 'wh_tsk_preview_palette',
    notionPageId: 'seed-local-task-palette',
    projectExternalId: 'wh_prj_preview_northwind_packaging',
    name: 'Approve color palette',
    status: 'Done',
    isDone: true,
  },
  {
    externalId: 'wh_tsk_preview_checklist',
    notionPageId: 'seed-local-task-checklist',
    projectExternalId: 'wh_prj_preview_contoso_launch',
    name: 'Write launch checklist',
    status: 'To Do',
    isDone: false,
  },
  {
    externalId: 'wh_tsk_preview_skus',
    notionPageId: 'seed-local-task-skus',
    projectExternalId: 'wh_prj_preview_fabrikam_catalog',
    name: 'Archive old SKUs',
    status: 'Done',
    isDone: true,
  },
  {
    externalId: 'wh_tsk_preview_sample_portal',
    notionPageId: 'seed-local-task-sample-portal',
    projectExternalId: 'wh_prj_preview_internal_warehaus',
    name: 'Set up sample portal',
    status: 'In Progress',
    isDone: false,
  },
];

export const PREVIEW_RESOURCES: PreviewResource[] = [
  {
    externalId: 'wh_res_preview_northwind_brand',
    notionPageId: 'seed-local-resource-northwind-brand',
    orgSlug: 'northwind',
    projectExternalId: 'wh_prj_preview_northwind_storefront',
    title: 'Northwind brand one-pager',
    description: 'Fake shared resource. The link is example.com, not a client file.',
    url: 'https://example.com/northwind-brand-one-pager',
  },
  {
    externalId: 'wh_res_preview_contoso_moodboard',
    notionPageId: 'seed-local-resource-contoso-moodboard',
    orgSlug: 'contoso',
    projectExternalId: 'wh_prj_preview_contoso_launch',
    title: 'Contoso moodboard',
    description: 'Fake shared resource for the Contoso sample.',
    url: 'https://example.com/contoso-moodboard',
  },
];

export const PREVIEW_ACTIVITY: PreviewActivity[] = [
  {
    orgSlug: 'northwind',
    projectExternalId: 'wh_prj_preview_northwind_storefront',
    name: 'Northwind shared the fall brief',
    summary: 'Sample activity. Olivia North sent a fake brief.',
    type: 'project',
    tone: 'accent',
    ageMs: 1000 * 60 * 60 * 5,
  },
  {
    orgSlug: 'contoso',
    projectExternalId: 'wh_prj_preview_contoso_launch',
    name: 'Contoso asked for a homepage pass',
    summary: 'Sample activity on the Contoso launch project.',
    type: 'project',
    tone: 'muted',
    ageMs: 1000 * 60 * 60 * 26,
  },
  {
    orgSlug: 'warehaus-internal',
    projectExternalId: 'wh_prj_preview_internal_warehaus',
    name: 'Ada Admin opened the sample workspace',
    summary: 'Staff-only sample activity on Internal Warehaus.',
    type: 'team',
    tone: 'info',
    ageMs: 1000 * 60 * 30,
  },
];

export function previewTaskStatuses(): string[] {
  return [...new Set(PREVIEW_TASKS.map((task) => task.status))];
}
