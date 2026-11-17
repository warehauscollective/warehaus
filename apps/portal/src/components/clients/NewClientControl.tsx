'use client';

import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type Ref } from 'react';
import { Lock } from 'lucide-react';
import { PortalModal } from '@/components/ui/PortalModal';
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

export const CLIENT_NETWORK_TITLE = 'Couldn’t create the client';
export const CLIENT_NETWORK_BODY = 'The connection dropped. Nothing was saved — your entries are kept.';
export const CLIENT_NETWORK_COPY = `${CLIENT_NETWORK_TITLE}. ${CLIENT_NETWORK_BODY}`;

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
    if (fixtures && typeof window !== 'undefined') {
      const previewError = new URLSearchParams(window.location.search).get('clientError');
      if (previewError === 'network') {
        setNote({ tone: 'error', text: CLIENT_NETWORK_COPY });
        return;
      }
      if (previewError === 'saving') {
        setPending(true);
        return;
      }
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
  useEffect(() => {
    const node = nameRef.current;
    if (!node) return;
    node.focus();
    if (selectOnFocus && node.value) node.select();
  }, [selectOnFocus]);

  const network = nested && note?.tone === 'error' && !note.field;
  const createDisabled = pending || (nested && !companyName.trim());
  const useLabel = nested
    ? `Use ‘${reusedName || companyName.trim()}’ instead`
    : 'Use existing';

  const dialog = (
    <PortalModal
      testId={nested ? (narrow ? 'new-client-nested-sheet' : 'new-client-nested') : (narrow ? 'new-client-sheet' : 'new-client-dialog')}
      label="New client"
      onClose={onClose}
      narrow={narrow}
      sheet={narrow ? 'bottom' : 'center'}
      width={nested && !narrow ? 520 : 640}
      zIndex={zIndex}
      locked={pending}
      panelStyle={nested ? { padding: narrow ? 20 : 24, display: 'flex', flexDirection: 'column', gap: 16 } : undefined}
    >
        {nested ? (
          <>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="ds-mono" style={{ fontSize: 12, lineHeight: '18px', color: 'var(--muted)' }}>NEW PROJECT  ›  CLIENT</p>
                <h2 style={{ fontFamily: 'var(--font-body)', fontSize: 20, fontWeight: 600, lineHeight: '30px', marginTop: 2 }}>
                  New client
                </h2>
              </div>
              <button type="button" onClick={onClose} disabled={pending} style={textButtonStyle(pending)}>
                Back
              </button>
            </div>
            <form className="flex flex-col gap-4" onSubmit={onSubmit}>
              {network ? <NetworkNotice /> : null}
              <fieldset disabled={pending} style={{ border: 0, margin: 0, padding: 0, opacity: pending ? 0.45 : 1 }}>
                <ClientField
                  label="Company name *"
                  value={companyName}
                  testId="new-client-name"
                  errorId="new-client-name-error"
                  error={fieldMessage(note, 'companyName')}
                  onChange={onCompanyName}
                  inputRef={nameRef}
                  placeholder="Company name"
                  appearance="framed"
                />
                <div className="mt-4">
                  <ClientField
                    label="Primary email (optional)"
                    value={primaryEmail}
                    testId="new-client-email"
                    errorId="new-client-email-error"
                    error={fieldMessage(note, 'email')}
                    onChange={onPrimaryEmail}
                    type="email"
                    placeholder="name@company.com"
                    appearance="framed"
                  />
                </div>
                <div className="mt-4">
                  <ClientField
                    label="Phone (optional)"
                    value={phone}
                    testId="new-client-phone"
                    errorId="new-client-phone-error"
                    error={fieldMessage(note, 'phone')}
                    onChange={onPhone}
                    placeholder="+1 555 010 0100"
                    appearance="framed"
                  />
                </div>
                <div
                  className="portal-create-draft mt-4 flex items-center gap-3"
                  data-testid="new-client-draft"
                  style={{ borderRadius: 18, padding: 12, background: 'var(--bg-2)', color: 'var(--fg)' }}
                >
                  <Lock size={16} aria-hidden="true" />
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 500, lineHeight: '21px' }}>Created as a draft client</p>
                    <p className="ds-mono" style={{ fontSize: 12, lineHeight: '18px', color: 'var(--muted)' }}>
                      Portal access off · unpublished · no invite email
                    </p>
                  </div>
                </div>
              </fieldset>
              <div
                className="flex flex-wrap items-center justify-between gap-3"
                style={{
                  borderTop: '1px solid var(--border)',
                  margin: narrow ? '0 -20px' : '0 -24px',
                  padding: narrow ? '16px 20px 0' : '16px 24px 0',
                }}
              >
                <p className="ds-mono" style={{ fontSize: 12, color: 'var(--muted)' }}>↵ to create · Esc back to project</p>
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
          </>
        ) : (
          <Surface style={{ padding: 'var(--s-5)' }}>
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
                <p style={{ fontSize: 'var(--t-sm)', color: 'var(--fg)' }} role="alert">
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
    </PortalModal>
  );
  return dialog;
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
  placeholder,
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
  placeholder?: string;
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
        placeholder={placeholder}
        data-testid={testId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={framed ? 'portal-create-field' : undefined}
        style={framed ? framedInput(Boolean(error)) : inputStyle}
      />
      {error ? (
        <span id={errorId} role="alert" style={{ fontSize: 'var(--t-sm)', color: 'var(--fg)' }}>
          {error}
        </span>
      ) : null}
    </label>
  );
}

function framedInput(invalid: boolean): CSSProperties {
  return {
    width: '100%',
    minHeight: 44,
    borderRadius: 18,
    background: 'var(--surface-2)',
    color: 'var(--fg)',
    border: invalid ? '1px solid var(--danger)' : '1px solid var(--border-2)',
    padding: '10px 12px',
    fontSize: 14,
    fontFamily: 'var(--font-body)',
    outline: 'none',
  };
}

function NetworkNotice() {
  return (
    <div
      role="alert"
      data-testid="new-client-network"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        border: '1px solid var(--danger)',
        borderRadius: 18,
        background: 'var(--surface)',
        padding: '16px 24px',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 20,
          height: 20,
          borderRadius: 999,
          border: '1.25px solid var(--danger)',
          color: 'var(--danger)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 11,
          fontWeight: 600,
          lineHeight: 1,
          flex: '0 0 auto',
        }}
      >
        !
      </span>
      <span>
        <span data-testid="new-client-network-title" style={{ display: 'block', fontSize: 14, fontWeight: 600, lineHeight: '20px', color: 'var(--fg)' }}>
          {CLIENT_NETWORK_TITLE}
        </span>
        <span style={{ display: 'block', marginTop: 4, fontSize: 13, lineHeight: '19px', color: 'var(--muted)' }}>
          {CLIENT_NETWORK_BODY}
        </span>
      </span>
    </div>
  );
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
