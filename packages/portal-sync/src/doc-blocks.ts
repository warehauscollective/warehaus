/**
 * Client Docs page-body rules — the only database whose body is read.
 * Source: docs/planning/portal-convex/warehaus-portal-field-allowlist.md
 */

export const ALLOWED_DOC_BLOCK_TYPES = [
  'heading_1',
  'heading_2',
  'heading_3',
  'paragraph',
  'bulleted_list_item',
  'numbered_list_item',
  'to_do',
  'table',
  'table_row',
  'image',
  'code',
  'quote',
  'callout',
  'divider',
] as const;

export type AllowedDocBlockType = (typeof ALLOWED_DOC_BLOCK_TYPES)[number];

const ALLOWED = new Set<string>(ALLOWED_DOC_BLOCK_TYPES);

/** Blocks that must always be dropped (even if Notion adds aliases). */
export const FORBIDDEN_DOC_BLOCK_TYPES = [
  'child_page',
  'child_database',
  'synced_block',
  'link_to_page',
  'bookmark',
  'embed',
  'file',
  'pdf',
  'video',
  'audio',
  'equation',
  'breadcrumb',
  'table_of_contents',
  'column_list',
  'column',
  'template',
  'unsupported',
] as const;

export type DocBlockDisposition = 'keep' | 'drop';

export type DocBlockDecision = {
  disposition: DocBlockDisposition;
  reason?:
    | 'not-allowlisted'
    | 'child-page'
    | 'synced-block'
    | 'forbidden-type';
};

export function classifyDocBlock(blockType: string): DocBlockDecision {
  if (blockType === 'child_page' || blockType === 'child_database') {
    return { disposition: 'drop', reason: 'child-page' };
  }
  if (blockType === 'synced_block') {
    return { disposition: 'drop', reason: 'synced-block' };
  }
  if ((FORBIDDEN_DOC_BLOCK_TYPES as readonly string[]).includes(blockType)) {
    return { disposition: 'drop', reason: 'forbidden-type' };
  }
  if (ALLOWED.has(blockType)) {
    return { disposition: 'keep' };
  }
  return { disposition: 'drop', reason: 'not-allowlisted' };
}

/** Strip @-mentions / notion.so links to plain text for CLIENT rendering. */
export function sanitizeInlineText(text: string): string {
  return text
    .replace(/https?:\/\/(?:www\.)?notion\.(?:so|com)\/\S+/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}
