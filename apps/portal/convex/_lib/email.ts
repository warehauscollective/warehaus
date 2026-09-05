/**
 * Thin Resend sender for portal transactional mail (password reset, etc.).
 * Runs inside Better Auth handlers on the Convex deployment — set
 * RESEND_API_KEY (+ optional EMAIL_FROM / EMAIL_REPLY_TO) via `npx convex env set`.
 */

export type SendPortalEmailArgs = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not set on the Convex deployment`);
  }
  return value;
}

export async function sendPortalEmail(args: SendPortalEmailArgs): Promise<void> {
  const apiKey = requireEnv('RESEND_API_KEY');
  const from =
    process.env.EMAIL_FROM?.trim() ||
    'Warehaus Portal <noreply@warehaus.co>';
  const replyTo = process.env.EMAIL_REPLY_TO?.trim();

  const payload: Record<string, unknown> = {
    from,
    to: [args.to],
    subject: args.subject,
    html: args.html,
    text: args.text,
  };
  if (replyTo) payload.reply_to = replyTo;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Resend send failed (${res.status}): ${body.slice(0, 300)}`);
  }
}

export function passwordResetEmail(args: {
  name?: string | null;
  resetUrl: string;
}): { subject: string; html: string; text: string } {
  const greeting = args.name?.trim() ? `Hi ${args.name.trim()},` : 'Hi,';
  const subject = 'Reset your Warehaus portal password';
  const text = [
    greeting,
    '',
    'We received a request to reset your Warehaus portal password.',
    'Open this link to choose a new password (expires in about an hour):',
    args.resetUrl,
    '',
    'If you did not request this, you can ignore this email.',
    '',
    '— Warehaus',
  ].join('\n');

  const html = `<!DOCTYPE html>
<html>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.5; color: #111; max-width: 520px; margin: 0 auto; padding: 24px;">
    <p style="font-size: 14px; letter-spacing: 0.08em; text-transform: uppercase; color: #666; margin: 0 0 16px;">Warehaus Portal</p>
    <p>${escapeHtml(greeting)}</p>
    <p>We received a request to reset your portal password.</p>
    <p style="margin: 28px 0;">
      <a href="${escapeHtml(args.resetUrl)}"
         style="display: inline-block; background: #111; color: #fff; text-decoration: none; padding: 12px 18px; border-radius: 8px; font-weight: 600;">
        Reset password
      </a>
    </p>
    <p style="font-size: 14px; color: #555;">Or paste this link into your browser:</p>
    <p style="font-size: 13px; word-break: break-all; color: #333;">${escapeHtml(args.resetUrl)}</p>
    <p style="font-size: 14px; color: #555;">This link expires in about an hour. If you did not request a reset, you can ignore this email.</p>
  </body>
</html>`;

  return { subject, html, text };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
