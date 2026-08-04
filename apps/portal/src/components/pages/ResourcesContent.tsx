'use client';

import { useRef, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { GhostButton, Pill, PrimaryButton, Surface } from '@/components/ui/primitives';
import {
  PortalTilePane,
  PortalWorkspace,
} from '@/components/layout/PortalWorkspace';
import { usePortalView } from '@/components/providers/PortalViewProvider';
import { tenantEyebrow, usePortalData } from '@/hooks/usePortalData';
import { usePortalAuth } from '@/hooks/usePortalAuth';
import { getHostSlugFromLocation } from '@/lib/auth/host-slug';
import { isConvexConfigured } from '@/lib/convex/client';

const SECTION_TITLE: Record<string, string> = {
  overview: 'Resources',
  uploads: 'Your uploads',
  review: 'Review queue',
};

function formatBytes(n: number | null | undefined): string {
  if (n == null || n <= 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function scanTone(status: string): string {
  switch (status) {
    case 'clean':
      return 'var(--success)';
    case 'infected':
      return 'var(--danger)';
    case 'error':
      return 'var(--warn)';
    default:
      return 'var(--muted)';
  }
}

/**
 * Unified Resources tab — Notion Shared Resources as a table (Library),
 * plus Convex-native client uploads / staff review under the same tab.
 */
export function ResourcesContent() {
  const configured = isConvexConfigured();
  const { sectionFor, setSectionFor } = usePortalView();
  const { data } = usePortalData();
  const { portalSession } = usePortalAuth();
  const hostSlug =
    typeof window !== 'undefined' ? getHostSlugFromLocation() ?? undefined : undefined;
  const activeSection = sectionFor('resources');
  const title = SECTION_TITLE[activeSection] ?? 'Resources';
  const isStaff = Boolean(portalSession?.isStaff);

  const resources = useQuery(
    api.sharedResources.listForClient,
    configured && data.tenant.ok ? { hostSlug } : 'skip',
  );
  const uploads = useQuery(
    api.clientUploads.listMine,
    configured && data.tenant.ok ? { hostSlug } : 'skip',
  );
  const review = useQuery(
    api.clientUploads.listNeedsReview,
    configured && isStaff && activeSection === 'review' ? { hostSlug } : 'skip',
  );

  const generateUploadUrl = useMutation(api.clientUploads.generateUploadUrl);
  const finalizeUpload = useMutation(api.clientUploads.finalizeUpload);
  const approveUpload = useMutation(api.clientUploads.approveUpload);
  const rejectUpload = useMutation(api.clientUploads.rejectUpload);

  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const onPickFile = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const { uploadUrl } = await generateUploadUrl({ hostSlug });
      const res = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      });
      if (!res.ok) throw new Error(`Upload failed (${res.status})`);
      const { storageId } = (await res.json()) as { storageId: Id<'_storage'> };
      await finalizeUpload({
        storageId,
        filename: file.name,
        mimeType: file.type || undefined,
        byteSize: file.size,
        hostSlug,
      });
      setSectionFor('resources', 'uploads');
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <PortalWorkspace
      eyebrow={tenantEyebrow(data.tenant, 'Resources')}
      title={title}
      actions={
        activeSection !== 'overview' ? (
          <>
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              onChange={(e) => void onPickFile(e.target.files?.[0] ?? null)}
            />
            <PrimaryButton
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
            >
              {uploading ? 'Uploading…' : 'Upload file'}
            </PrimaryButton>
          </>
        ) : undefined
      }
    >
      <PortalTilePane>
        <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto">
          {uploadError && (
            <p style={{ fontSize: 'var(--t-sm)', color: 'var(--danger)' }}>{uploadError}</p>
          )}

          {activeSection === 'overview' && (
            <ResourcesTable rows={resources} loading={resources === undefined} />
          )}

          {activeSection === 'uploads' && (
            <>
              {uploads === undefined && (
                <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>Loading…</p>
              )}
              {uploads?.length === 0 && (
                <Surface style={{ padding: 'var(--s-5)' }}>
                  <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>
                    No uploads yet. Files you send stay in Convex storage and wait for team
                    review.
                  </p>
                </Surface>
              )}
              {uploads?.map((file) => (
                <Surface key={file.id} style={{ padding: 'var(--s-4)' }}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill color={scanTone(file.scanStatus)}>{file.scanStatus}</Pill>
                    <Pill color={file.needsReview ? 'var(--warn)' : 'var(--success)'}>
                      {file.needsReview ? 'In review' : 'Approved'}
                    </Pill>
                  </div>
                  <h3 style={{ fontSize: 'var(--t-md)', fontWeight: 600, marginTop: 8 }}>
                    {file.filename}
                  </h3>
                  <p
                    className="ds-mono"
                    style={{ fontSize: 'var(--t-xs)', color: 'var(--faint)', marginTop: 6 }}
                  >
                    {formatBytes(file.byteSize)} ·{' '}
                    {new Date(file.createdAt).toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                  {file.downloadUrl && (
                    <div className="mt-3">
                      <GhostButton
                        onClick={() =>
                          window.open(file.downloadUrl!, '_blank', 'noopener,noreferrer')
                        }
                      >
                        Open
                      </GhostButton>
                    </div>
                  )}
                </Surface>
              ))}
            </>
          )}

          {activeSection === 'review' && isStaff && (
            <>
              {review === undefined && (
                <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>Loading…</p>
              )}
              {review?.length === 0 && (
                <Surface style={{ padding: 'var(--s-5)' }}>
                  <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>
                    Review queue is empty.
                  </p>
                </Surface>
              )}
              {review?.map((file) => (
                <Surface key={file.id} style={{ padding: 'var(--s-4)' }}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill color={scanTone(file.scanStatus)}>{file.scanStatus}</Pill>
                    <Pill color="var(--warn)">Needs review</Pill>
                  </div>
                  <h3 style={{ fontSize: 'var(--t-md)', fontWeight: 600, marginTop: 8 }}>
                    {file.filename}
                  </h3>
                  <p
                    className="ds-mono"
                    style={{ fontSize: 'var(--t-xs)', color: 'var(--faint)', marginTop: 6 }}
                  >
                    {formatBytes(file.byteSize)}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {file.downloadUrl && (
                      <GhostButton
                        onClick={() =>
                          window.open(file.downloadUrl!, '_blank', 'noopener,noreferrer')
                        }
                      >
                        Open
                      </GhostButton>
                    )}
                    <PrimaryButton
                      onClick={() =>
                        void approveUpload({
                          uploadId: file.id as Id<'clientUploads'>,
                          hostSlug,
                        })
                      }
                    >
                      Approve
                    </PrimaryButton>
                    <GhostButton
                      onClick={() =>
                        void rejectUpload({
                          uploadId: file.id as Id<'clientUploads'>,
                          hostSlug,
                        })
                      }
                    >
                      Reject
                    </GhostButton>
                  </div>
                </Surface>
              ))}
            </>
          )}
        </div>
      </PortalTilePane>
    </PortalWorkspace>
  );
}

type ResourceRow = {
  id: string;
  name: string;
  description: string | null;
  type: string | null;
  url: string | null;
  projectName: string | null;
  mimeType: string | null;
  byteSize: number | null;
  hasFile: boolean;
};

function ResourcesTable({
  rows,
  loading,
}: {
  rows: ResourceRow[] | undefined;
  loading: boolean;
}) {
  if (loading) {
    return <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>Loading resources…</p>;
  }

  if (!rows?.length) {
    return (
      <Surface style={{ padding: 'var(--s-5)' }}>
        <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>
          No published resources yet. Shared Resources with Publish to Warehaus appear here.
        </p>
      </Surface>
    );
  }

  return (
    <Surface style={{ padding: 0, overflow: 'hidden' }}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left" style={{ minWidth: 640 }}>
          <thead>
            <tr
              className="ds-mono"
              style={{
                fontSize: 'var(--t-xs)',
                color: 'var(--faint)',
                borderBottom: '1px solid var(--border)',
              }}
            >
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="hidden px-4 py-3 font-medium md:table-cell">Description</th>
              <th className="hidden px-4 py-3 font-medium lg:table-cell">Project</th>
              <th className="px-4 py-3 font-medium">Link</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                style={{
                  borderBottom: '1px solid var(--border)',
                  fontSize: 'var(--t-sm)',
                }}
              >
                <td className="px-4 py-3 align-top">
                  <div style={{ fontWeight: 600 }}>{row.name}</div>
                  {row.hasFile && (
                    <div
                      className="ds-mono mt-1"
                      style={{ fontSize: 'var(--t-xs)', color: 'var(--faint)' }}
                    >
                      {row.mimeType ?? 'file'} · {formatBytes(row.byteSize)}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 align-top">
                  {row.type ? <Pill>{row.type}</Pill> : <span style={{ color: 'var(--faint)' }}>—</span>}
                </td>
                <td
                  className="hidden px-4 py-3 align-top md:table-cell"
                  style={{ color: 'var(--muted)', maxWidth: 280 }}
                >
                  {row.description ?? '—'}
                </td>
                <td
                  className="hidden px-4 py-3 align-top lg:table-cell"
                  style={{ color: 'var(--muted)' }}
                >
                  {row.projectName ?? '—'}
                </td>
                <td className="px-4 py-3 align-top">
                  {row.url ? (
                    <a
                      href={row.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ds-mono"
                      style={{
                        fontSize: 'var(--t-xs)',
                        color: 'var(--accent)',
                        textDecoration: 'underline',
                        textUnderlineOffset: 3,
                      }}
                    >
                      Open
                    </a>
                  ) : (
                    <span className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--faint)' }}>
                      —
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Surface>
  );
}
