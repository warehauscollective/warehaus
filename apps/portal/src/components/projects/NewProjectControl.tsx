'use client';

import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent, type ReactElement, type Ref, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useAction } from 'convex/react';
import { AlertCircle, Check, ChevronDown, Lock, Plus, Search } from 'lucide-react';
import { userFacingErrorMessage } from '@convex/_lib/userFacingError';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { createProjectExternalId } from '@warehaus/portal-sync';
import { NewClientControl, newClientDialogZ } from '@/components/clients/NewClientControl';
import { clientInitials } from '@/lib/data/clientList';
import { useMaxWidth } from '@/lib/design/useMaxWidth';
import { OutlineButton, PrimaryButton } from '@/components/ui/primitives';

export type ProjectClientOption = {
  id: string;
  name: string;
  projectCount?: number;
  internal?: boolean;
};

/**
 * One prop for both entry points. The projects list leaves it unlocked.
 * The client page passes `locked` so the field cannot change.
 */
export type ProjectClientPreset = {
  id: string;
  name: string;
  locked?: boolean;
};

export type ProjectDraft = {
  name: string;
  orgId: string;
  externalId: string;
};

export type CreatedProject = {
  id: string;
  name: string;
  orgId: string;
};

export type ProjectFormNote = {
  tone: 'error' | 'info';
  text: string;
  field?: 'name' | 'client';
};

/** Staff create still publishes. Archive stays off. There is no toggle. */
export const PROJECT_PUBLISH_COPY = 'Publish is on and Archive is off.';

export const CLIENT_CREATED_COPY = 'Client created as a draft · selected for this project';

/** Sentinel. It is never stored as the selected client. */
export const NEW_CLIENT_VALUE = '__new_client__';

/** Trim, collapse spaces, lowercase. Matches the name stored for dedupe. */
export function clientMatchKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Keep the project name and external id. Only the selected client changes. */
export function projectDraftAfterClient(draft: ProjectDraft, clientId: string): ProjectDraft {
  return { name: draft.name, externalId: draft.externalId, orgId: clientId };
}

/** Extras win on the same id so a just-created client shows before the directory refreshes. */
export function projectClientOptions(
  clients: readonly ProjectClientOption[],
  extras: readonly ProjectClientOption[],
): ProjectClientOption[] {
  const seen = new Set<string>();
  const rows: ProjectClientOption[] = [];
  for (const client of [...extras, ...clients]) {
    if (!client.id || seen.has(client.id)) continue;
    seen.add(client.id);
    rows.push(client);
  }
  return rows;
}

export function visibleProjectClients(
  clients: readonly ProjectClientOption[],
  query: string,
): ProjectClientOption[] {
  const key = clientMatchKey(query);
  if (!key) return [...clients];
  return clients.filter((client) => clientMatchKey(client.name).includes(key));
}

export function projectClientMeta(client: ProjectClientOption): string {
  if (client.internal) return 'admin-only';
  const count = client.projectCount ?? 0;
  return count === 1 ? '1 project' : `${count} projects`;
}

export function pinnedClientAction(query: string, matchCount: number): {
  create: boolean;
  label: string;
  meta: string;
  name: string;
} {
  const name = query.trim().replace(/\s+/g, ' ');
  if (name && matchCount === 0) {
    return { create: true, label: `Create client “${name}”`, meta: 'draft · no invite', name };
  }
  return { create: false, label: 'New client', meta: 'draft · no invite', name: '' };
}

/** A locked preset is not something the person typed. A name or a chosen client is. */
export function shouldConfirmProjectDiscard(input: {
  name: string;
  orgId: string;
  initialOrgId: string;
  locked: boolean;
}): boolean {
  if (input.name.trim()) return true;
  if (input.locked) return false;
  return input.orgId !== input.initialOrgId;
}

/**
 * New project dialog. Publish and Archive are not asked. The server action
 * passes publish true, so this form still publishes the project.
 */
export function NewProjectControl({
  open,
  onClose,
  onCreated,
  clients,
  clientPreset = null,
  fixtures,
  hostSlug,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (project: CreatedProject) => void;
  clients: ProjectClientOption[];
  clientPreset?: ProjectClientPreset | null;
  fixtures: boolean;
  hostSlug?: string;
}) {
  const createInNotion = useAction(api.projectCreate.createInNotion);
  const narrow = useMaxWidth(720);
  const [name, setName] = useState('');
  const [orgId, setOrgId] = useState('');
  const [externalId, setExternalId] = useState('');
  const [added, setAdded] = useState<ProjectClientOption[]>([]);
  const [note, setNote] = useState<ProjectFormNote | null>(null);
  const [pending, setPending] = useState(false);
  const [clientSheet, setClientSheet] = useState(false);
  const [clientSeed, setClientSeed] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  const [fresh, setFresh] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const clientRef = useRef<HTMLButtonElement>(null);
  const restoreClientFocus = useRef(false);
  const initialOrgId = useRef('');
  const presetId = clientPreset?.id ?? null;
  const locked = clientPreset?.locked === true;
  const wasOpen = useRef(false);

  useEffect(() => {
    if (!open) {
      wasOpen.current = false;
      return;
    }
    if (wasOpen.current) return;
    wasOpen.current = true;
    const nextOrg = presetId ?? '';
    initialOrgId.current = nextOrg;
    setName('');
    setOrgId(nextOrg);
    setAdded([]);
    setNote(null);
    setClientSheet(false);
    setClientSeed('');
    setPickerOpen(false);
    setPickerQuery('');
    setFresh(false);
    setConfirming(false);
    setExternalId(
      createProjectExternalId(`${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`),
    );
  }, [open, presetId]);

  useEffect(() => {
    if (!fresh) return;
    const timer = window.setTimeout(() => setFresh(false), 4000);
    return () => window.clearTimeout(timer);
  }, [fresh]);

  useEffect(() => {
    if (!open || clientSheet || pickerOpen || confirming || restoreClientFocus.current) return;
    const frame = requestAnimationFrame(() => nameRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open, clientSheet, pickerOpen, confirming]);

  useEffect(() => {
    if (!open || clientSheet || !restoreClientFocus.current) return;
    restoreClientFocus.current = false;
    const frame = requestAnimationFrame(() => clientRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open, clientSheet]);

  const options = projectClientOptions(clients, [
    ...(clientPreset ? [{ id: clientPreset.id, name: clientPreset.name }] : []),
    ...added,
  ]);

  const selectCreatedClient = (client: { clientId: string; name: string }, created: boolean) => {
    const label = client.name.trim() || 'New client';
    setAdded((rows) => (rows.some((row) => row.id === client.clientId) ? rows : [...rows, { id: client.clientId, name: label, projectCount: 0 }]));
    setOrgId((current) => projectDraftAfterClient(
      { name, orgId: current, externalId },
      client.clientId,
    ).orgId);
    setFresh(created);
    setNote(null);
    setPickerOpen(false);
    setPickerQuery('');
  };

  const openNewClient = (seed: string) => {
    if (locked || pending) return;
    restoreClientFocus.current = true;
    setClientSeed(seed);
    setPickerOpen(false);
    setClientSheet(true);
  };

  const requestClose = () => {
    if (pending || clientSheet) return;
    if (pickerOpen) {
      setPickerOpen(false);
      return;
    }
    if (confirming) {
      setConfirming(false);
      return;
    }
    if (shouldConfirmProjectDiscard({ name, orgId, initialOrgId: initialOrgId.current, locked })) {
      setConfirming(true);
      return;
    }
    onClose();
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (pending || pickerOpen || clientSheet || confirming) return;
    if (!name.trim()) {
      setNote({ tone: 'error', text: 'Name is required. Nothing was sent.', field: 'name' });
      return;
    }
    if (!orgId) {
      setNote({ tone: 'error', text: 'Choose the client this project belongs to. Nothing was sent.', field: 'client' });
      return;
    }
    if (fixtures) {
      onCreated?.({ id: `preview-${externalId}`, name: name.trim(), orgId });
      onClose();
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
        setNote({ tone: 'error', text: result.error });
        return;
      }
      onCreated?.({ id: result.projectId, name: name.trim(), orgId });
      onClose();
    } catch (err) {
      setNote({ tone: 'error', text: userFacingErrorMessage(err, 'Could not create the project') });
    } finally {
      setPending(false);
    }
  };

  if (!open) return null;

  return (
    <>
      <NewProjectForm
        name={name}
        orgId={orgId}
        clients={options}
        locked={locked}
        lockedName={clientPreset?.name ?? ''}
        note={note}
        pending={pending}
        sheetOpen={clientSheet}
        narrow={narrow}
        fresh={fresh}
        pickerOpen={pickerOpen}
        pickerQuery={pickerQuery}
        confirming={confirming}
        nameRef={nameRef}
        clientRef={clientRef}
        onName={setName}
        onOrgId={(id) => {
          setOrgId(id);
          setFresh(false);
          setPickerOpen(false);
          setPickerQuery('');
          setNote(null);
        }}
        onPickerOpen={() => {
          if (locked || pending) return;
          setPickerQuery('');
          setPickerOpen(true);
        }}
        onPickerClose={() => setPickerOpen(false)}
        onPickerQuery={setPickerQuery}
        onNewClient={openNewClient}
        onSubmit={onSubmit}
        onRequestClose={requestClose}
        onKeepEditing={() => setConfirming(false)}
        onDiscard={onClose}
      />
      {clientSheet && !locked ? (
        <NewClientControl
          open
          fixtures={fixtures}
          hostSlug={hostSlug}
          stack="overDialog"
          layout="nested"
          initialCompanyName={clientSeed}
          selectOnFocus={clientSeed.length > 0}
          existingClients={options}
          onPreviewClient={fixtures ? (client) => selectCreatedClient(client, true) : undefined}
          onClose={() => {
            if (!pending) setClientSheet(false);
          }}
          onOpen={(clientId, client) => {
            selectCreatedClient(
              { clientId, name: client?.name ?? 'New client' },
              client?.created !== false,
            );
            setClientSheet(false);
          }}
        />
      ) : null}
    </>
  );
}

export function NewProjectForm({
  name,
  orgId,
  clients,
  locked,
  lockedName = '',
  note,
  pending,
  sheetOpen,
  narrow = false,
  fresh = false,
  pickerOpen = false,
  pickerQuery = '',
  confirming = false,
  nameRef,
  clientRef,
  onName,
  onOrgId,
  onPickerOpen,
  onPickerClose,
  onPickerQuery,
  onNewClient,
  onSubmit,
  onRequestClose,
  onKeepEditing,
  onDiscard,
}: {
  name: string;
  orgId: string;
  clients: ProjectClientOption[];
  locked: boolean;
  lockedName?: string;
  note: ProjectFormNote | null;
  pending: boolean;
  sheetOpen: boolean;
  narrow?: boolean;
  fresh?: boolean;
  pickerOpen?: boolean;
  pickerQuery?: string;
  confirming?: boolean;
  nameRef?: Ref<HTMLInputElement>;
  clientRef?: Ref<HTMLButtonElement>;
  onName: (value: string) => void;
  onOrgId: (value: string) => void;
  onPickerOpen: () => void;
  onPickerClose: () => void;
  onPickerQuery: (value: string) => void;
  onNewClient: (seed: string) => void;
  onSubmit: (event: FormEvent) => void;
  onRequestClose: () => void;
  onKeepEditing: () => void;
  onDiscard: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [active, setActive] = useState(0);
  const visible = visibleProjectClients(clients, pickerQuery);
  const pinned = pinnedClientAction(pickerQuery, visible.length);
  const rowCount = locked ? 0 : visible.length + 1;
  const selected = clients.find((client) => client.id === orgId) ?? null;
  const listId = 'new-project-client-list';

  useEffect(() => {
    setActive(pinned.create ? rowCount - 1 : 0);
  }, [pickerQuery, pinned.create, rowCount]);

  useEffect(() => {
    if (!pickerOpen) return;
    const frame = requestAnimationFrame(() => searchRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [pickerOpen]);

  useEffect(() => {
    if (sheetOpen) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || pending) return;
      event.preventDefault();
      event.stopPropagation();
      onRequestClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [sheetOpen, pending, onRequestClose]);

  useFocusTrap(!sheetOpen && !pending, panelRef);

  const pickActive = () => {
    if (locked) return;
    if (active >= visible.length) {
      onNewClient(pinned.name);
      return;
    }
    const client = visible[active];
    if (client) onOrgId(client.id);
  };

  const onSearchKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (rowCount === 0) return;
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      setActive((index) => (index + delta + rowCount) % rowCount);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      pickActive();
    }
  };

  const dialog = (
    <div
      className="ds-scope"
      role="dialog"
      aria-modal={sheetOpen ? undefined : true}
      aria-hidden={sheetOpen || undefined}
      aria-label="New project"
      data-testid="new-project-dialog"
      inert={sheetOpen ? true : undefined}
      onClick={() => {
        if (!pending && !sheetOpen) onRequestClose();
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || sheetOpen) return;
        event.stopPropagation();
        if (pending) return;
        onRequestClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: newClientDialogZ.dialog,
        background: 'rgb(0 0 0 / 55%)',
        display: 'flex',
        alignItems: narrow ? 'flex-start' : 'center',
        justifyContent: 'center',
        padding: narrow ? '12px 0 0' : 24,
      }}
    >
      <div
        ref={panelRef}
        onClick={(event) => event.stopPropagation()}
        style={{
          width: narrow ? '100%' : 640,
          maxWidth: '100%',
          height: narrow ? 'calc(100dvh - 12px)' : undefined,
          maxHeight: narrow ? '100%' : 'calc(100dvh - 48px)',
          overflow: 'auto',
          background: 'var(--surface)',
          color: 'var(--fg)',
          border: '1px solid var(--border-2)',
          borderRadius: narrow ? '20px 20px 0 0' : 28,
          boxShadow: '0 24px 80px rgb(0 0 0 / 45%)',
          padding: narrow ? 20 : 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="ds-mono" style={{ fontSize: 12, color: 'var(--muted)' }}>Project</p>
            <h2 style={{ fontFamily: 'var(--font-body)', fontSize: 20, fontWeight: 600, lineHeight: '28px', marginTop: 4 }}>
              New project
            </h2>
          </div>
          <button
            type="button"
            onClick={onRequestClose}
            disabled={pending}
            style={textButtonStyle(pending)}
          >
            Close
          </button>
        </div>
        <form className="flex flex-col gap-4" onSubmit={onSubmit}>
          <fieldset
            disabled={pending}
            style={{ border: 0, margin: 0, padding: 0, opacity: pending ? 0.45 : 1 }}
          >
            <label className="flex flex-col gap-2">
              <FieldLabel>Project name</FieldLabel>
              <input
                ref={nameRef}
                value={name}
                onChange={(event) => onName(event.target.value)}
                aria-invalid={note?.tone === 'error' && note.field === 'name' ? true : undefined}
                data-testid="new-project-name"
                className="project-create-field"
                style={fieldStyle(note?.tone === 'error' && note.field === 'name')}
              />
            </label>
            {locked ? (
              <div className="mt-4 flex flex-col gap-2" data-testid="new-project-client" data-locked="true" aria-disabled="true">
                <FieldLabel>Client · preset</FieldLabel>
                <div
                  style={{
                    ...fieldStyle(false),
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                  }}
                >
                  <ClientMark name={lockedName} />
                  <span className="min-w-0 flex-1 truncate" style={{ fontWeight: 600 }}>{lockedName}</span>
                  <Tag>Preset</Tag>
                  <Lock size={16} aria-hidden="true" />
                </div>
                <p style={{ fontSize: 13, color: 'var(--muted)' }}>
                  Set from {lockedName}. Start from Projects to pick another client.
                </p>
              </div>
            ) : (
              <div className="relative mt-4 flex flex-col gap-2">
                <FieldLabel>Client</FieldLabel>
                <button
                  ref={clientRef}
                  type="button"
                  aria-haspopup="listbox"
                  aria-expanded={pickerOpen}
                  aria-controls={listId}
                  data-testid="new-project-client"
                  data-locked="false"
                  data-fresh={fresh ? 'true' : 'false'}
                  onClick={() => (pickerOpen ? onPickerClose() : onPickerOpen())}
                  style={{
                    ...fieldStyle(note?.tone === 'error' && note.field === 'client'),
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  {selected ? <ClientMark name={selected.name} /> : null}
                  <span className="min-w-0 flex-1 truncate" style={{ color: selected ? 'var(--fg)' : 'var(--muted)' }}>
                    {selected?.name ?? 'Choose a client'}
                  </span>
                  {fresh && selected ? <Tag>New</Tag> : null}
                  <ChevronDown size={16} aria-hidden="true" />
                </button>
                {pickerOpen ? (
                  <div
                    id={listId}
                    role="listbox"
                    aria-label="Clients"
                    data-testid="client-picker"
                    style={{
                      border: '1px solid var(--border-2)',
                      borderRadius: 18,
                      background: 'var(--surface)',
                      boxShadow: '0 16px 40px rgb(0 0 0 / 35%)',
                      overflow: 'hidden',
                    }}
                  >
                    <label className="flex items-center gap-2" style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
                      <Search size={16} aria-hidden="true" style={{ color: 'var(--muted)' }} />
                      <input
                        ref={searchRef}
                        value={pickerQuery}
                        aria-label="Search clients"
                        data-testid="client-search"
                        placeholder="Search clients"
                        onChange={(event) => onPickerQuery(event.target.value)}
                        onKeyDown={onSearchKey}
                        style={{
                          flex: 1,
                          border: 0,
                          background: 'transparent',
                          color: 'var(--fg)',
                          fontFamily: 'var(--font-body)',
                          fontSize: 15,
                          outline: 'none',
                        }}
                      />
                    </label>
                    <div style={{ maxHeight: narrow ? 180 : 236, overflow: 'auto' }}>
                      {visible.length === 0 ? (
                        <p style={{ padding: '12px 14px', color: 'var(--muted)', fontSize: 14 }} data-testid="client-no-match">
                          {pickerQuery.trim() ? `No clients match “${pickerQuery.trim().replace(/\s+/g, ' ')}”` : 'No clients yet'}
                        </p>
                      ) : (
                        visible.map((client, index) => (
                          <button
                            key={client.id}
                            type="button"
                            role="option"
                            aria-selected={active === index}
                            data-testid="client-option"
                            onMouseEnter={() => setActive(index)}
                            onClick={() => onOrgId(client.id)}
                            style={optionStyle(active === index)}
                          >
                            <ClientMark name={client.name} />
                            <span className="min-w-0 flex-1 truncate">{client.name}</span>
                            <span style={{ color: 'var(--muted)', fontSize: 13 }}>{projectClientMeta(client)}</span>
                          </button>
                        ))
                      )}
                    </div>
                    <button
                      type="button"
                      role="option"
                      aria-selected={active === visible.length}
                      data-testid="new-client-row"
                      data-create={pinned.create ? 'true' : 'false'}
                      onMouseEnter={() => setActive(visible.length)}
                      onClick={() => onNewClient(pinned.name)}
                      style={{
                        ...optionStyle(active === visible.length),
                        borderTop: '1px solid var(--border)',
                        width: '100%',
                      }}
                    >
                      <Plus size={16} aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate" style={{ fontWeight: 600 }}>{pinned.label}</span>
                      <span style={{ color: 'var(--muted)', fontSize: 13 }}>{pinned.meta}</span>
                    </button>
                  </div>
                ) : null}
                {fresh && selected ? (
                  <p role="status" data-testid="client-created-line" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                    <Check size={14} aria-hidden="true" />
                    {CLIENT_CREATED_COPY}
                  </p>
                ) : null}
              </div>
            )}
          </fieldset>
          <p data-testid="project-publish-copy" style={{ fontSize: 13, color: 'var(--muted)' }}>
            {PROJECT_PUBLISH_COPY}
          </p>
          {note ? (
            <p
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: note.tone === 'error' ? 'var(--danger)' : 'var(--fg)' }}
              role={note.tone === 'error' ? 'alert' : 'status'}
              data-testid={note.tone === 'error' ? 'new-project-error' : 'new-project-info'}
            >
              {note.tone === 'error' ? <AlertCircle size={14} aria-hidden="true" /> : null}
              {note.text}
            </p>
          ) : null}
          {confirming ? (
            <div data-testid="discard-project" className="flex flex-col gap-3">
              <p style={{ fontSize: 14 }}>Discard this project?</p>
              <div className="flex justify-end gap-2">
                <OutlineButton onClick={onKeepEditing}>Keep editing</OutlineButton>
                <PrimaryButton type="button" onClick={onDiscard}>Discard</PrimaryButton>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p style={{ fontSize: 12, color: 'var(--muted)' }}>↵ to create · Esc to close</p>
              <div className="flex gap-2">
                <OutlineButton onClick={onRequestClose} disabled={pending}>Cancel</OutlineButton>
                <PrimaryButton type="submit" disabled={pending || !name.trim() || !orgId} testId="create-project">
                  {pending ? 'Creating…' : note?.tone === 'error' ? 'Try again' : 'Create project'}
                </PrimaryButton>
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
  return mountLayer(dialog);
}

function FieldLabel({ children }: { children: string }) {
  return (
    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--muted)' }}>{children}</span>
  );
}

function Tag({ children }: { children: string }) {
  return (
    <span
      style={{
        borderRadius: 999,
        border: '1px solid var(--border-2)',
        padding: '2px 8px',
        fontSize: 12,
        lineHeight: '16px',
      }}
    >
      {children}
    </span>
  );
}

function ClientMark({ name }: { name: string }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 28,
        height: 28,
        borderRadius: 8,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--surface-2)',
        color: 'var(--fg)',
        fontSize: 11,
        fontWeight: 600,
        flex: '0 0 auto',
      }}
    >
      {clientInitials(name || '•')}
    </span>
  );
}

function optionStyle(active: boolean): CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    minHeight: 44,
    padding: '8px 12px',
    border: 0,
    background: active ? 'var(--surface-2)' : 'transparent',
    color: 'var(--fg)',
    fontFamily: 'var(--font-body)',
    fontSize: 15,
    textAlign: 'left',
    cursor: 'pointer',
  };
}

function fieldStyle(invalid: boolean): CSSProperties {
  return {
    width: '100%',
    minHeight: 44,
    border: invalid ? '1px solid var(--danger)' : '1px solid var(--border-2)',
    borderRadius: 18,
    background: 'var(--surface-2)',
    color: 'var(--fg)',
    padding: '10px 12px',
    fontSize: 15,
    fontFamily: 'var(--font-body)',
    outline: 'none',
  };
}

function textButtonStyle(pending: boolean): CSSProperties {
  return {
    border: 0,
    background: 'transparent',
    color: 'var(--muted)',
    fontFamily: 'var(--font-body)',
    fontSize: 14,
    cursor: pending ? 'not-allowed' : 'pointer',
    opacity: pending ? 0.45 : 1,
  };
}

function mountLayer(node: ReactElement) {
  if (typeof document === 'undefined') return node;
  return createPortal(node, document.body);
}

function useFocusTrap(active: boolean, rootRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!active) return;
    const root = rootRef.current;
    if (!root) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const nodes = [...root.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
        .filter((el) => !el.hasAttribute('disabled'));
      if (nodes.length === 0) return;
      const first = nodes[0]!;
      const last = nodes[nodes.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    root.addEventListener('keydown', onKey);
    return () => root.removeEventListener('keydown', onKey);
  }, [active, rootRef]);
}
