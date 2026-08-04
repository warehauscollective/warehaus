/**
 * Notion file → Vercel Blob copy (server-side only).
 * Skips cleanly when BLOB_READ_WRITE_TOKEN is unset (local/dev).
 */

import { blobPathname } from '@warehaus/portal-sync';

export type BlobCopyResult =
  | {
      ok: true;
      skipped?: boolean;
      blobUrl?: string;
      blobPathname?: string;
      mimeType?: string;
      byteSize?: number;
      checksum?: string;
    }
  | { ok: false; reason: string };

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Fetch Notion-hosted bytes and put them in Vercel Blob.
 * Never returns the Notion URL — only Blob metadata.
 */
export async function copyNotionFileToBlob(input: {
  notionUrl: string;
  orgId: string;
  kind: 'shared' | 'doc-image';
  notionPageId: string;
  safeName: string;
  existingChecksum?: string | null;
}): Promise<BlobCopyResult> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    return { ok: true, skipped: true };
  }

  // Refuse non-http Notion/file hosts later at serializer; fetch still needs a URL.
  if (!/^https:\/\//i.test(input.notionUrl)) {
    return { ok: false, reason: 'invalid notion file url' };
  }

  let res: Response;
  try {
    res = await fetch(input.notionUrl);
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : 'fetch failed',
    };
  }
  if (!res.ok) {
    return { ok: false, reason: `notion file fetch ${res.status}` };
  }

  const bytes = await res.arrayBuffer();
  const checksum = await sha256Hex(bytes);
  if (input.existingChecksum && input.existingChecksum === checksum) {
    return { ok: true, skipped: true, checksum };
  }

  const pathname = blobPathname({
    orgId: input.orgId,
    kind: input.kind,
    notionPageId: input.notionPageId,
    checksum: checksum.slice(0, 16),
    safeName: input.safeName || 'file',
  });

  const mimeType =
    res.headers.get('content-type')?.split(';')[0]?.trim() || 'application/octet-stream';

  // Dynamic import so local Convex can boot without the package until installed.
  const { put } = await import('@vercel/blob');
  const uploaded = await put(pathname, bytes, {
    access: 'public',
    token,
    contentType: mimeType,
    addRandomSuffix: false,
  });

  return {
    ok: true,
    blobUrl: uploaded.url,
    blobPathname: pathname,
    mimeType,
    byteSize: bytes.byteLength,
    checksum,
  };
}
