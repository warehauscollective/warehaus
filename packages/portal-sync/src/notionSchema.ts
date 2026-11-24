/**
 * One property schema per Notion database: every property the portal knows,
 * with its tier (who may see it) and, where the portal writes it, its Notion
 * type. Tier maps (`tiers.ts`), the write shaper (`toNotionProperties`) and
 * the title property all read from here, so adding or renaming a property is
 * one edit.
 *
 * Default: any property not named here is NEVER (fail closed).
 * Source: docs/planning/portal-convex/warehaus-portal-field-allowlist.md
 */

export type FieldTier = 'CLIENT' | 'SERVER' | 'NEVER';

export type NotionPropertyType =
  | 'title'
  | 'rich_text'
  | 'select'
  | 'status'
  | 'multi_select'
  | 'relation'
  | 'date'
  | 'checkbox'
  | 'number'
  | 'url'
  | 'email'
  | 'files';

export type PropertySpec = {
  readonly tier: FieldTier;
  /** Set where the portal writes the property. Unset strings write as rich text. */
  readonly type?: NotionPropertyType;
  /** An empty value clears the select instead of being skipped. */
  readonly clearable?: true;
};

export type PropertySchema = Readonly<Record<string, PropertySpec>>;

export const CLIENT_SCHEMA = {
  'Company Name': { tier: 'CLIENT', type: 'title' },
  Slug: { tier: 'CLIENT' },
  Projects: { tier: 'CLIENT', type: 'relation' },
  Contacts: { tier: 'SERVER' },
  /** Present live; portal lists docs via Client Docs table, not this edge. */
  'Client Docs': { tier: 'NEVER' },
  'External ID': { tier: 'SERVER' },
  Status: { tier: 'SERVER', type: 'select' },
  'Portal access': { tier: 'SERVER', type: 'select' },
  'Primary Email': { tier: 'SERVER' },
  Phone: { tier: 'SERVER' },
  Source: { tier: 'SERVER', type: 'select', clearable: true },
  LastBridgedAt: { tier: 'SERVER' },
  BridgeDirection: { tier: 'NEVER' },
  BrainPageId: { tier: 'NEVER' },
  WarehausPageId: { tier: 'NEVER' },
  'Publish to Warehaus': { tier: 'NEVER', type: 'checkbox' },
  'Promote to Brain': { tier: 'NEVER' },
} as const satisfies PropertySchema;

export const PROJECT_SCHEMA = {
  Name: { tier: 'CLIENT', type: 'title' },
  Description: { tier: 'CLIENT', type: 'rich_text' },
  Status: { tier: 'CLIENT', type: 'status' },
  Progress: { tier: 'CLIENT' },
  'Start Date': { tier: 'CLIENT' },
  'End Date': { tier: 'CLIENT' },
  'Live URL': { tier: 'CLIENT' },
  'Figma Link': { tier: 'CLIENT' },
  'Docs URL': { tier: 'CLIENT' },
  Stack: { tier: 'CLIENT' },
  Tasks: { tier: 'CLIENT' },
  Client: { tier: 'SERVER', type: 'relation' },
  /** Present live; docs listed via Client Docs table filtered by org/project. */
  'Client Docs': { tier: 'NEVER' },
  'External ID': { tier: 'SERVER' },
  Type: { tier: 'SERVER', type: 'multi_select' },
  Archive: { tier: 'SERVER', type: 'checkbox' },
  Priority: { tier: 'SERVER', type: 'select', clearable: true },
  Source: { tier: 'SERVER', type: 'select', clearable: true },
  LastBridgedAt: { tier: 'SERVER' },
  /** Second Brain edge — NEVER traverse / sync this relation. */
  'Ops (Internal)': { tier: 'NEVER' },
  'Github Repo': { tier: 'NEVER' },
  'Owner/DRI': { tier: 'NEVER' },
  BridgeDirection: { tier: 'NEVER' },
  BrainPageId: { tier: 'NEVER' },
  WarehausPageId: { tier: 'NEVER' },
  'Publish to Warehaus': { tier: 'NEVER', type: 'checkbox' },
  'Promote to Brain': { tier: 'NEVER' },
} as const satisfies PropertySchema;

export const TASK_SCHEMA = {
  Name: { tier: 'CLIENT', type: 'title' },
  Status: { tier: 'CLIENT', type: 'status' },
  /** Notion Tasks select. Missing is tolerated. Unknown names fail closed. */
  Stage: { tier: 'CLIENT', type: 'select' },
  'Is Done': { tier: 'CLIENT' },
  Date: { tier: 'CLIENT', type: 'date' },
  Projects: { tier: 'SERVER', type: 'relation' },
  /** Self-relation, one level deep. On the Notion Tasks database. */
  'Parent item': { tier: 'SERVER', type: 'relation' },
  /**
   * One-way relation to the Notion database titled Resources
   * (collection 7215c759-…). No reverse field. Join by page id.
   */
  Resources: { tier: 'SERVER', type: 'relation' },
  'External ID': { tier: 'SERVER' },
  Estimate: { tier: 'SERVER', type: 'select', clearable: true },
  Priority: { tier: 'SERVER', type: 'select', clearable: true },
  Source: { tier: 'SERVER', type: 'select', clearable: true },
  LastBridgedAt: { tier: 'SERVER' },
  /**
   * B4. Was NEVER. SERVER stores the page body (or this property when the
   * body is empty) for staff. Client queries omit it. A CLIENT tier would
   * show it only on published tasks.
   */
  Description: { tier: 'SERVER', type: 'rich_text' },
  'Next Action': { tier: 'NEVER' },
  'Owner / DRI': { tier: 'NEVER' },
  'Blocked by': { tier: 'NEVER' },
  Blocking: { tier: 'NEVER' },
  'GitHub Issue/PR': { tier: 'NEVER', type: 'url' },
  'Repo Branch': { tier: 'NEVER' },
  'Figma Frame': { tier: 'NEVER' },
  URL: { tier: 'NEVER', type: 'url' },
  'Legacy Complete': { tier: 'NEVER' },
  BridgeDirection: { tier: 'NEVER' },
  BrainPageId: { tier: 'NEVER' },
  WarehausPageId: { tier: 'NEVER' },
  'Publish to Warehaus': { tier: 'NEVER', type: 'checkbox' },
  'Promote to Brain': { tier: 'NEVER' },
} as const satisfies PropertySchema;

export const CONTACT_SCHEMA = {
  Name: { tier: 'CLIENT', type: 'title' },
  Email: { tier: 'CLIENT', type: 'email' },
  'Auth User ID': { tier: 'SERVER' },
  'External ID': { tier: 'SERVER' },
  'Client Company': { tier: 'SERVER', type: 'relation' },
  Role: { tier: 'SERVER', type: 'select' },
  'Portal Access': { tier: 'SERVER', type: 'select' },
  /** Absent on live Contacts until it is added. Empty means not an invite. */
  'Invite Status': { tier: 'SERVER', type: 'select', clearable: true },
  Phone: { tier: 'SERVER' },
  Source: { tier: 'SERVER', type: 'select', clearable: true },
  LastBridgedAt: { tier: 'SERVER' },
  'Internal Notes': { tier: 'NEVER' },
  'Internal Description': { tier: 'NEVER' },
  Website: { tier: 'NEVER' },
  LinkedIn: { tier: 'NEVER' },
  Instagram: { tier: 'NEVER' },
  'X / Twitter': { tier: 'NEVER' },
  'Publish to Warehaus': { tier: 'NEVER', type: 'checkbox' },
} as const satisfies PropertySchema;

export const SHARED_RESOURCE_SCHEMA = {
  Name: { tier: 'CLIENT', type: 'title' },
  Description: { tier: 'CLIENT', type: 'rich_text' },
  Type: { tier: 'CLIENT', type: 'select' },
  URL: { tier: 'CLIENT', type: 'url' },
  File: { tier: 'CLIENT', type: 'files' },
  Client: { tier: 'SERVER', type: 'relation' },
  Project: { tier: 'SERVER', type: 'relation' },
  'External ID': { tier: 'SERVER' },
  Source: { tier: 'SERVER', type: 'select', clearable: true },
  LastBridgedAt: { tier: 'SERVER' },
  BridgeDirection: { tier: 'NEVER' },
  BrainPageId: { tier: 'NEVER' },
  WarehausPageId: { tier: 'NEVER' },
  'Publish to Warehaus': { tier: 'NEVER', type: 'checkbox' },
  'Promote to Brain': { tier: 'NEVER' },
} as const satisfies PropertySchema;

export const CLIENT_DOC_SCHEMA = {
  Title: { tier: 'CLIENT', type: 'title' },
  Summary: { tier: 'CLIENT' },
  'Doc Type': { tier: 'CLIENT', type: 'select' },
  Order: { tier: 'CLIENT', type: 'number' },
  /** Page body is CLIENT with separate block allowlist rules. */
  'Page body content': { tier: 'CLIENT' },
  Client: { tier: 'SERVER', type: 'relation' },
  Project: { tier: 'SERVER', type: 'relation' },
  'External ID': { tier: 'SERVER' },
  Status: { tier: 'SERVER', type: 'select' },
  Source: { tier: 'SERVER', type: 'select', clearable: true },
  LastBridgedAt: { tier: 'SERVER' },
  'Publish to Warehaus': { tier: 'NEVER', type: 'checkbox' },
} as const satisfies PropertySchema;
