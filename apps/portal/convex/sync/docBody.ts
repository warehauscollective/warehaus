/**
 * Notion page blocks → allowlisted SafeDocBlock JSON for Client Docs.
 * Notion-hosted images are copied to Vercel Blob before storage.
 */

import { classifyDocBlock, sanitizeInlineText } from '@warehaus/portal-sync';
import { copyNotionFileToBlob } from './blob';
import { notionToken } from './notionApi';

type SafeBlock = Record<string, unknown>;

export type DocBodyResult = {
  body?: string;
  blobCopied: number;
  images: Array<{
    blobPathname: string;
    blobUrl: string;
    alt?: string;
    checksum?: string;
  }>;
};

function richTextToPlain(rich: unknown): string {
  if (!Array.isArray(rich)) return '';
  return sanitizeInlineText(
    rich
      .map((t) =>
        t && typeof t === 'object' && 'plain_text' in t
          ? String((t as { plain_text?: string }).plain_text ?? '')
          : '',
      )
      .join(''),
  );
}

function isNotionHostedUrl(url: string): boolean {
  return /notion\.(so|com)|amazonaws\.com|secured\.notion-static\.com/i.test(url);
}

async function imageBlockToSafe(
  payload: Record<string, unknown> | undefined,
  orgId: string,
  notionPageId: string,
  result: DocBodyResult,
): Promise<SafeBlock | null> {
  const file = payload?.file as { url?: string } | undefined;
  const external = payload?.external as { url?: string } | undefined;
  const src = external?.url || file?.url || '';
  if (!src) return null;

  const alt = richTextToPlain(payload?.caption) || undefined;
  let durableSrc = src;

  if (isNotionHostedUrl(src)) {
    const blob = await copyNotionFileToBlob({
      notionUrl: src,
      orgId,
      kind: 'doc-image',
      notionPageId,
      safeName: alt || 'doc-image',
    });
    if (!blob.ok || !blob.blobUrl) {
      // Fail closed: never persist a Notion/S3 URL to clients.
      return null;
    }
    if (!blob.skipped) result.blobCopied += 1;
    durableSrc = blob.blobUrl;
    if (blob.blobPathname && blob.blobUrl) {
      result.images.push({
        blobPathname: blob.blobPathname,
        blobUrl: blob.blobUrl,
        alt,
        checksum: blob.checksum,
      });
    }
  }

  return { type: 'image', src: durableSrc, alt };
}

async function blockToSafe(
  block: { type: string; [key: string]: unknown },
  orgId: string,
  notionPageId: string,
  result: DocBodyResult,
): Promise<SafeBlock | null> {
  const decision = classifyDocBlock(block.type);
  if (decision.disposition !== 'keep') return null;

  const payload = block[block.type] as Record<string, unknown> | undefined;
  if (!payload && block.type !== 'divider') return null;

  switch (block.type) {
    case 'heading_1':
    case 'heading_2':
    case 'heading_3':
    case 'paragraph':
    case 'quote':
    case 'callout':
    case 'bulleted_list_item':
    case 'numbered_list_item': {
      const text = richTextToPlain(payload?.rich_text);
      return text ? { type: block.type, text } : null;
    }
    case 'to_do': {
      const text = richTextToPlain(payload?.rich_text);
      return { type: 'to_do', text, checked: Boolean(payload?.checked) };
    }
    case 'code': {
      const text = richTextToPlain(payload?.rich_text);
      return {
        type: 'code',
        text,
        language: typeof payload?.language === 'string' ? payload.language : undefined,
      };
    }
    case 'divider':
      return { type: 'divider' };
    case 'image':
      return imageBlockToSafe(payload, orgId, notionPageId, result);
    default:
      return null;
  }
}

/** Fetch and sanitize page body blocks into JSON for Convex storage. */
export async function fetchSafeDocBody(
  pageId: string,
  orgId: string,
): Promise<DocBodyResult> {
  const result: DocBodyResult = { blobCopied: 0, images: [] };
  const blocks: SafeBlock[] = [];
  let cursor: string | undefined;
  do {
    const url = new URL(`https://api.notion.com/v1/blocks/${pageId}/children`);
    url.searchParams.set('page_size', '100');
    if (cursor) url.searchParams.set('start_cursor', cursor);
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${notionToken()}`,
        'Notion-Version': '2025-09-03',
      },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Notion blocks ${pageId} → ${res.status}: ${text.slice(0, 200)}`);
    }
    const json = (await res.json()) as {
      results?: Array<{ type: string; [key: string]: unknown }>;
      has_more?: boolean;
      next_cursor?: string | null;
    };
    for (const block of json.results ?? []) {
      const safe = await blockToSafe(block, orgId, pageId, result);
      if (safe) blocks.push(safe);
    }
    cursor = json.has_more ? (json.next_cursor ?? undefined) : undefined;
  } while (cursor);

  if (blocks.length) result.body = JSON.stringify(blocks);
  return result;
}
