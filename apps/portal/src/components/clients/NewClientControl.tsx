'use client';

import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type Ref, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useAction } from 'convex/react';
import { userFacingErrorMessage } from '@convex/_lib/userFacingError';
import { api } from '@convex/_generated/api';
import { buildClientCreateProperties, companyNameKey, type ClientCreateField } from '@warehaus/portal-sync';
import { GhostButton, OutlineButton, PrimaryButton, Surface } from '@/components/ui/primitives';
import { useMaxWidth } from '@/lib/design/useMaxWidth';

export type NewClientNote = {
  tone: 'error' | 'info';
  text: string;
  field?: ClientCreateField;
};

export type ExistingClient = {
  id: string;
  name: string;
};

function fieldMessage(note: NewClientNote | null, field: ClientCreateField): string | null {
  if (!note || note.tone !== 'error' || note.field !== field) return null;
  return note.text;
}

function matchKey(name: string): string {
  return companyNameKey(name.replace(/\s+/g, ' '));
}

/** Same sheet. `over-dialog` sits above the project form. */
export const newClientDialogZ = {
  dialog: 80,
  overDialog: 96,
} as const;

export const CLIENT_NETWORK_COPY = 'Couldn’t create the client. The connection dropped. Nothing was saved — your entries are kept.';

/**
 * Staff client create. Company Name is required. Email and phone are optional.
 * The server sets Prospect, Portal access Disabled, and sends no invite.
 * `nested` is the sheet over New project. The accounts dialog stays as it is.
 */
export function NewClientControl({
  open,
  onClose,
  onOpen,
  hostSlug,
  fixtures,
  onPreviewClient,
  stack = 'dialog',
  layout = 'standalone',
  initialCompanyName = '',
  selectOnFocus = false,
  existingClients = [],
}: {
  open: boolean;
  onClose: () => void;
  onOpen: (clientId: string, client?: { name: string; created?: boolean }) => void;
  hostSlug?: string;
  fixtures: boolean;
  /** Fixture preview only. Selects the client locally and sends nothing. */
  onPreviewClient?: (client: { clientId: string; name: string }) => void;
  stack?: keyof typeof newClientDialogZ;
  layout?: 'standalone' | 'nested';
  initialCompanyName?: string;
  selectOnFocus?: boolean;
  existingClients?: readonly ExistingClient[];
}) {
  const createInNotion = useAction(api.clientCreate.createInNotion);
  const narrow = useMaxWidth(layout === 'nested' ? 720 : 390);
  const [companyName, setCompanyName] = useState(initialCompanyName);
  const [primaryEmail, setPrimaryEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState<NewClientNote | null>(null);
  const [reusedId, setReusedId] = useState<string | null>(null);
  const [reusedName, setReusedName] = useState('');
  const [pending, setPending] = useState(false);

  if (!open) return null;

  const markReused = (id: string, name: string) => {
    setReusedId(id);
    setReusedName(name);
    if (layout === 'nested') {
      setNote({
        tone: 'error',
        field: 'companyName',
        text: `A client named “${name}” already exists.`,
      });
      return;
    }
    setNote({ tone: 'info', text: 'A client with this name or slug already exists.' });
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    const built = buildClientCreateProperties({ companyName, primaryEmail, phone });
    if (!built.ok) {
      setReusedId(null);
      setNote({ tone: 'error', text: built.error, field: built.field });
      return;
    }
    const known = existingClients.find((client) => matchKey(client.name) === matchKey(built.properties['Company Name']));
    if (known) {
      markReused(known.id, known.name);
      return;
    }
    if (fixtures) {
      if (onPreviewClient) {
        onPreviewClient({
          clientId: `preview-${built.properties.Slug}`,
          name: built.properties['Company Name'],
        });
        onClose();
        return;
      }
      setNote({ tone: 'info', text: 'Fixture preview does not create clients.' });
      return;
    }

    setPending(true);
    setNote(null);
    setReusedId(null);
    try {
      const result = await createInNotion({
        hostSlug,
        companyName: built.properties['Company Name'],
        ...(built.properties['Primary Email'] ? { primaryEmail: built.properties['Primary Email'] } : {}),
        ...(built.properties.Phone ? { phone: built.properties.Phone } : {}),
      });
      if (!result.ok) {
        setNote({ tone: 'error', text: result.error, field: result.field });
        return;
      }
      if (result.reused) {
        markReused(result.clientId, built.properties['Company Name']);
        return;
      }
      const createdName = built.properties['Company Name'];
      setCompanyName('');
      setPrimaryEmail('');
      setPhone('');
      onOpen(result.clientId, { name: createdName, created: true });
      onClose();
    } catch (err) {
      setNote({
        tone: 'error',
        text: layout === 'nested'
          ? CLIENT_NETWORK_COPY
          : userFacingErrorMessage(err, 'Could not create the client'),
      });
    } finally {
      setPending(false);
    }
  };

  return (
    <NewClientForm
      narrow={narrow}
      layout={layout}
      companyName={companyName}
      primaryEmail={primaryEmail}
      phone={phone}
      note={note}
      pending={pending}
      reused={reusedId != null}
      reusedName={reusedName}
      selectOnFocus={selectOnFocus}
      onCompanyName={(value) => {
        setCompanyName(value);
        if (reusedId) {
          setReusedId(null);
          setNote(null);
        }
      }}
      onPrimaryEmail={setPrimaryEmail}
      onPhone={setPhone}
      onSubmit={onSubmit}
      onClose={() => {
        if (!pending) onClose();
      }}
      onUseExisting={() => {
        if (!reusedId) return;
        onOpen(reusedId, { name: reusedName || companyName.trim(), created: false });
        onClose();
      }}
      zIndex={newClientDialogZ[stack]}
    />
  );
}

export function NewClientForm({
  narrow,
  layout = 'standalone',
  companyName,
  primaryEmail,
  phone,
  note,
  pending,
  reused,
  reusedName = '',
  selectOnFocus = false,
  onCompanyName,
  onPrimaryEmail,
  onPhone,
  onSubmit,
  onClose,
  onUseExisting,
  zIndex = newClientDialogZ.dialog,
}: {
  narrow: boolean;
  layout?: 'standalone' | 'nested';
  companyName: string;
  primaryEmail: string;
  phone: string;
  note: NewClientNote | null;
  pending: boolean;
  reused: boolean;
  reusedName?: string;
  selectOnFocus?: boolean;
  onCompanyName: (value: string) => void;
  onPrimaryEmail: (value: string) => void;
  onPhone: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  onClose: () => void;
  onUseExisting: () => void;
  zIndex?: number;
}) {
  const nested = layout === 'nested';
  const nameRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = nameRef.current;
    if (!node) return;
    node.focus();
    if (selectOnFocus && node.value) node.select();
  }, [selectOnFocus]);
  useFocusTrap(true, panelRef);
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || pending) return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [pending, onClose]);

  const network = nested && note?.tone === 'error' && !note.field;
  const createDisabled = pending || (nested && !companyName.trim());
  const useLabel = nested
    ? `Use ‘${reusedName || companyName.trim()}’ instead`
    : 'Use existing';

  const dialog = (
    <div
      className="ds-scope"
      role="dialog"
      aria-modal="true"
      aria-label="New client"
      data-testid={nested ? (narrow ? 'new-client-nested-sheet' : 'new-client-nested') : (narrow ? 'new-client-sheet' : 'new-client-dialog')}
      onClick={() => {
        if (!pending) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || pending) return;
        event.stopPropagation();
        onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex,
        background: nested ? 'rgb(0 0 0 / 40%)' : 'color-mix(in oklab, var(--bg) 55%, transparent)',
        display: 'flex',
        alignItems: nested && narrow ? 'flex-start' : narrow ? 'flex-end' : 'center',
        justifyContent: 'center',
        padding: nested && narrow ? '56px 0 0' : narrow ? 0 : 16,
      }}
    >
      <div
        ref={panelRef}
        onClick={(event) => event.stopPropagation()}
        style={{
          width: narrow ? '100%' : nested ? 520 : 'min(100%, 440px)',
          height: nested && narrow ? 'calc(100dvh - 56px)' : undefined,
          maxHeight: nested && !narrow ? 'calc(100dvh - 96px)' : undefined,
          transform: nested && !narrow ? 'translate(60px, 72px)' : undefined,
        }}
      >
        {nested ? (
          <div
            style={{
              height: narrow ? '100%' : undefined,
              overflow: 'auto',
              background: 'var(--surface)',
              color: 'var(--fg)',
              border: '1px solid var(--border-2)',
              borderRadius: narrow ? '20px 20px 0 0' : 28,
              boxShadow: '0 24px 80px rgb(0 0 0 / 45%)',
              padding: narrow ? 20 : 24,
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="ds-mono" style={{ fontSize: 12, color: 'var(--muted)' }}>Client</p>
                <h2 style={{ fontFamily: 'var(--font-body)', fontSize: 20, fontWeight: 600, lineHeight: '28px', marginTop: 4 }}>
                  New client
                </h2>
                <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 6 }}>
                  Starts as a draft. Portal access stays off. No invite is sent.
                </p>
              </div>
              <button type="button" onClick={onClose} disabled={pending} style={textButtonStyle(pending)}>
                Close
              </button>
            </div>
            <form className="flex flex-col gap-4" onSubmit={onSubmit}>
              <fieldset disabled={pending} style={{ border: 0, margin: 0, padding: 0, opacity: pending ? 0.45 : 1 }}>
                <ClientField
                  label="Company name"
                  value={companyName}
                  testId="new-client-name"
                  errorId="new-client-name-error"
                  error={fieldMessage(note, 'companyName')}
                  onChange={onCompanyName}
                  inputRef={nameRef}
                  appearance="framed"
                />
                <div className="mt-4">
                  <ClientField
                    label="Email"
                    value={primaryEmail}
                    testId="new-client-email"
                    errorId="new-client-email-error"
                    error={fieldMessage(note, 'email')}
                    onChange={onPrimaryEmail}
                    type="email"
                    appearance="framed"
                  />
                </div>
                <div className="mt-4">
                  <ClientField
                    label="Phone"
                    value={phone}
                    testId="new-client-phone"
                    errorId="new-client-phone-error"
                    error={fieldMessage(note, 'phone')}
                    onChange={onPhone}
                    appearance="framed"
                  />
                </div>
              </fieldset>
              {network ? (
                <p role="alert" data-testid="new-client-network" style={{ fontSize: 13, color: 'var(--danger)' }}>
                  {note?.text}
                </p>
              ) : null}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p style={{ fontSize: 12, color: 'var(--muted)' }}>↵ to create · Esc to close</p>
                <div className="flex gap-2">
                  <OutlineButton onClick={onClose} disabled={pending}>Cancel</OutlineButton>
                  {reused ? (
                    <PrimaryButton type="button" onClick={onUseExisting} testId="use-existing-client">
                      {useLabel}
                    </PrimaryButton>
                  ) : (
                    <PrimaryButton type="submit" disabled={createDisabled} testId="create-client">
                      {pending ? 'Creating…' : network ? 'Try again' : 'Create client'}
                    </PrimaryButton>
                  )}
                </div>
              </div>
            </form>
          </div>
        ) : (
          <Surface style={{ padding: 'var(--s-5)', borderRadius: narrow ? '16px 16px 0 0' : undefined }}>
            <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>
              New client
            </p>
            <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', marginTop: 8 }}>
              Starts as a prospect. Portal access stays off. No invite is sent.
            </p>
            <form className="mt-4 flex flex-col gap-3" onSubmit={onSubmit}>
              <ClientField
                label="Company Name"
                value={companyName}
                testId="new-client-name"
                errorId="new-client-name-error"
                error={fieldMessage(note, 'companyName')}
                onChange={onCompanyName}
                inputRef={nameRef}
                required
              />
              <ClientField
                label="Primary Email"
                value={primaryEmail}
                testId="new-client-email"
                errorId="new-client-email-error"
                error={fieldMessage(note, 'email')}
                onChange={onPrimaryEmail}
                type="email"
              />
              <ClientField
                label="Phone"
                value={phone}
                testId="new-client-phone"
                errorId="new-client-phone-error"
                error={fieldMessage(note, 'phone')}
                onChange={onPhone}
              />
              {note?.tone === 'info' ? (
                <p style={{ fontSize: 'var(--t-sm)', color: 'var(--fg)' }} role="status" data-testid="new-client-info">
                  {note.text}
                </p>
              ) : null}
              {note?.tone === 'error' && !note.field ? (
                <p style={{ fontSize: 'var(--t-sm)', color: 'var(--danger)' }} role="alert">
                  {note.text}
                </p>
              ) : null}
              <div className="mt-2 flex justify-end gap-2">
                <GhostButton onClick={onClose}>Close</GhostButton>
                {reused ? (
                  <PrimaryButton type="button" onClick={onUseExisting} testId="use-existing-client">
                    Use existing
                  </PrimaryButton>
                ) : (
                  <PrimaryButton type="submit" disabled={pending} testId="create-client">
                    {pending ? 'Creating…' : 'Create client'}
                  </PrimaryButton>
                )}
              </div>
            </form>
          </Surface>
        )}
      </div>
    </div>
  );
  if (typeof document === 'undefined') return dialog;
  return createPortal(dialog, document.body);
}

function ClientField({
  label,
  value,
  testId,
  errorId,
  error,
  onChange,
  type = 'text',
  required = false,
  inputRef,
  appearance = 'plain',
}: {
  label: string;
  value: string;
  testId: string;
  errorId: string;
  error: string | null;
  onChange: (value: string) => void;
  type?: 'text' | 'email';
  required?: boolean;
  inputRef?: Ref<HTMLInputElement>;
  appearance?: 'plain' | 'framed';
}) {
  const framed = appearance === 'framed';
  return (
    <label className="flex flex-col gap-2">
      <span style={framed
        ? { fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--muted)' }
        : { fontSize: 'var(--t-sm)', color: 'var(--muted)' }}
      >
        {label}
      </span>
      <input
        ref={inputRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        type={type}
        data-testid={testId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        style={framed ? framedInput(Boolean(error)) : inputStyle}
      />
      {error ? (
        <span id={errorId} role="alert" style={{ fontSize: 'var(--t-sm)', color: 'var(--danger-text)' }}>
          {error}
        </span>
      ) : null}
    </label>
  );
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

function framedInput(invalid: boolean): CSSProperties {
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

const inputStyle: CSSProperties = {
  width: '100%',
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: 'var(--bg)',
  color: 'var(--fg)',
  padding: '0.55rem 0.7rem',
  fontSize: 'var(--t-sm)',
  fontFamily: 'var(--font-body)',
};
