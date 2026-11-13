'use client';

import { useState, type CSSProperties, type FormEvent } from 'react';
import { useAction } from 'convex/react';
import { userFacingErrorMessage } from '@convex/_lib/userFacingError';
import { api } from '@convex/_generated/api';
import { buildClientCreateProperties, type ClientCreateField } from '@warehaus/portal-sync';
import { GhostButton, PrimaryButton, Surface } from '@/components/ui/primitives';
import { useMaxWidth } from '@/lib/design/useMaxWidth';

export type NewClientNote = {
  tone: 'error' | 'info';
  text: string;
  field?: ClientCreateField;
};

function fieldMessage(note: NewClientNote | null, field: ClientCreateField): string | null {
  if (!note || note.tone !== 'error' || note.field !== field) return null;
  return note.text;
}

/**
 * Staff client create. Company Name is required. Email and phone are optional.
 * The server sets Prospect, Portal access Disabled, and sends no invite.
 */
export function NewClientControl({
  open,
  onClose,
  onOpen,
  hostSlug,
  fixtures,
}: {
  open: boolean;
  onClose: () => void;
  onOpen: (clientId: string) => void;
  hostSlug?: string;
  fixtures: boolean;
}) {
  const createInNotion = useAction(api.clientCreate.createInNotion);
  const narrow = useMaxWidth(390);
  const [companyName, setCompanyName] = useState('');
  const [primaryEmail, setPrimaryEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState<NewClientNote | null>(null);
  const [reusedId, setReusedId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (!open) return null;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    const built = buildClientCreateProperties({ companyName, primaryEmail, phone });
    if (!built.ok) {
      setReusedId(null);
      setNote({ tone: 'error', text: built.error, field: built.field });
      return;
    }
    if (fixtures) {
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
        setReusedId(result.clientId);
        setNote({ tone: 'info', text: 'A client with this name or slug already exists.' });
        return;
      }
      setCompanyName('');
      setPrimaryEmail('');
      setPhone('');
      onOpen(result.clientId);
      onClose();
    } catch (err) {
      setNote({ tone: 'error', text: userFacingErrorMessage(err, 'Could not create the client') });
    } finally {
      setPending(false);
    }
  };

  return (
    <NewClientForm
      narrow={narrow}
      companyName={companyName}
      primaryEmail={primaryEmail}
      phone={phone}
      note={note}
      pending={pending}
      reused={reusedId != null}
      onCompanyName={setCompanyName}
      onPrimaryEmail={setPrimaryEmail}
      onPhone={setPhone}
      onSubmit={onSubmit}
      onClose={() => {
        if (!pending) onClose();
      }}
      onUseExisting={() => {
        if (!reusedId) return;
        onOpen(reusedId);
        onClose();
      }}
    />
  );
}

export function NewClientForm({
  narrow,
  companyName,
  primaryEmail,
  phone,
  note,
  pending,
  reused,
  onCompanyName,
  onPrimaryEmail,
  onPhone,
  onSubmit,
  onClose,
  onUseExisting,
}: {
  narrow: boolean;
  companyName: string;
  primaryEmail: string;
  phone: string;
  note: NewClientNote | null;
  pending: boolean;
  reused: boolean;
  onCompanyName: (value: string) => void;
  onPrimaryEmail: (value: string) => void;
  onPhone: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  onClose: () => void;
  onUseExisting: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="New client"
      data-testid={narrow ? 'new-client-sheet' : 'new-client-dialog'}
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 80,
        background: 'color-mix(in oklab, var(--bg) 55%, transparent)',
        display: 'flex',
        alignItems: narrow ? 'flex-end' : 'center',
        justifyContent: 'center',
        padding: narrow ? 0 : 16,
      }}
    >
      <div onClick={(event) => event.stopPropagation()} style={{ width: narrow ? '100%' : 'min(100%, 440px)' }}>
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
      </div>
    </div>
  );
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
}: {
  label: string;
  value: string;
  testId: string;
  errorId: string;
  error: string | null;
  onChange: (value: string) => void;
  type?: 'text' | 'email';
  required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        type={type}
        data-testid={testId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        style={inputStyle}
      />
      {error ? (
        <span id={errorId} role="alert" style={{ fontSize: 'var(--t-sm)', color: 'var(--danger)' }}>
          {error}
        </span>
      ) : null}
    </label>
  );
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
