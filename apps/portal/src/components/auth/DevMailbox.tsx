'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery } from 'convex/react';
import { api } from '@convex/_generated/api';
import { Surface } from '@/components/ui/primitives';

function MailText({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return (
    <p style={{ whiteSpace: 'pre-wrap', fontSize: 'var(--t-sm)', wordBreak: 'break-word' }}>
      {parts.map((part, index) =>
        /^https?:\/\//.test(part) ? (
          <a key={index} href={part} style={{ color: 'inherit' }}>
            {part}
          </a>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </p>
  );
}

function DevMailboxList() {
  const messages = useQuery(api.devMailbox.latest);

  if (messages === undefined) {
    return <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>Loading local inbox…</p>;
  }

  if (messages.length === 0) {
    return (
      <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>
        No reset messages yet. Request one from forgot password, then come back here.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {messages.map((message) => (
        <article key={`${message.createdAt}-${message.to}`} className="flex flex-col gap-2">
          <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>
            {message.to}
          </p>
          <h3 style={{ fontSize: 'var(--t-sm)', fontWeight: 600 }}>{message.subject}</h3>
          <MailText text={message.text} />
        </article>
      ))}
    </div>
  );
}

export function DevMailbox() {
  const [local, setLocal] = useState<boolean | null>(null);

  useEffect(() => {
    const host = window.location.hostname;
    setLocal(host === '127.0.0.1' || host === 'localhost');
  }, []);

  return (
    <Surface style={{ padding: 'var(--s-5)', maxWidth: 560, width: '100%' }}>
      <p className="ds-mono" style={{ fontSize: 'var(--t-xs)', color: 'var(--muted)' }}>
        Local only
      </p>
      <h3 style={{ fontSize: 'var(--t-md)', fontWeight: 600, marginTop: 8 }}>Dev inbox</h3>
      <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', marginTop: 4 }}>
        Password reset links for this shared-dev portal land here when email cannot be sent.
      </p>
      <div className="mt-5">
        {local === false ? (
          <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)' }}>
            This inbox is only on the local portal.
          </p>
        ) : local ? (
          <DevMailboxList />
        ) : null}
      </div>
      <Link
        href="/forgot-password"
        className="mt-5 inline-block"
        style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', textDecoration: 'underline' }}
      >
        Request a reset link
      </Link>
    </Surface>
  );
}
