'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useAction } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { createProjectExternalId } from '@warehaus/portal-sync';
import { GhostButton, PrimaryButton, Surface } from '@/components/ui/primitives';

export type ProjectClientOption = {
  id: string;
  name: string;
};

/**
 * New project control on the projects list header.
 * Same button and dialog pattern as New task. Staff pick the client.
 * Publish and Archive are not asked; the server sets them.
 */
export function NewProjectControl({
  clients,
  fixtures,
  hostSlug,
}: {
  clients: ProjectClientOption[];
  fixtures: boolean;
  hostSlug?: string;
}) {
  const createInNotion = useAction(api.projectCreate.createInNotion);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [orgId, setOrgId] = useState('');
  const [externalId, setExternalId] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const openDialog = () => {
    setNote(null);
    setExternalId(
      createProjectExternalId(`${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`),
    );
    setOpen(true);
  };

  const openDialogRef = useRef(openDialog);
  openDialogRef.current = openDialog;
  useEffect(() => {
    const open = () => openDialogRef.current();
    window.addEventListener('wh-open-new-project', open);
    return () => window.removeEventListener('wh-open-new-project', open);
  }, []);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setNote('Name is required. Nothing was sent.');
      return;
    }
    if (!orgId) {
      setNote('Choose the client this project belongs to. Nothing was sent.');
      return;
    }
    if (fixtures) {
      setNote('Fixture preview does not send projects to Notion.');
      return;
    }

    setPending(true);
    setNote(null);
    try {
      const result = await createInNotion({
        hostSlug,
        orgId: orgId as Id<'clients'>,
        name: name.trim(),
        externalId,
      });
      if (!result.ok) {
        setNote(result.error);
        return;
      }
      setName('');
      setOrgId('');
      setOpen(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not create the project';
      setNote(message);
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <PrimaryButton onClick={openDialog}>New project</PrimaryButton>
      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="New project"
          onClick={() => {
            if (!pending) setOpen(false);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 80,
            background: 'color-mix(in oklab, var(--bg) 55%, transparent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div onClick={(event) => event.stopPropagation()} style={{ width: 'min(100%, 440px)' }}>
            <Surface style={{ padding: 'var(--s-5)' }}>
              <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>
                New project
              </p>
              <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', marginTop: 8 }}>
                Choose the client this project belongs to. Publish is on and Archive is off.
              </p>
              <form className="mt-4 flex flex-col gap-3" onSubmit={onSubmit}>
                <label className="flex flex-col gap-1">
                  <span style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>Name</span>
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    required
                    style={inputStyle}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>Client</span>
                  <select
                    value={orgId}
                    onChange={(event) => setOrgId(event.target.value)}
                    required
                    style={inputStyle}
                  >
                    <option value="">Choose a client</option>
                    {clients.map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.name}
                      </option>
                    ))}
                  </select>
                </label>
                {note ? (
                  <p style={{ fontSize: 'var(--t-sm)', color: 'var(--danger)' }} role="status">
                    {note}
                  </p>
                ) : null}
                <div className="mt-2 flex justify-end gap-2">
                  <GhostButton onClick={() => setOpen(false)}>Close</GhostButton>
                  <PrimaryButton type="submit" disabled={pending}>
                    {pending ? 'Creating…' : 'Create project'}
                  </PrimaryButton>
                </div>
              </form>
            </Surface>
          </div>
        </div>
      ) : null}
    </>
  );
}

const inputStyle = {
  width: '100%',
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: 'var(--bg)',
  color: 'var(--fg)',
  padding: '0.55rem 0.7rem',
  fontSize: 'var(--t-sm)',
  fontFamily: 'var(--font-body)',
} as const;
