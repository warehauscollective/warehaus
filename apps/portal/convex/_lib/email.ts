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

/** Keep verification links on our callback page, not a caller-supplied absolute URL. */
export function rewriteVerificationCallback(verifyUrl: string, callbackPath = '/verify-email'): string {
  const safePath =
    callbackPath.startsWith('/') && !callbackPath.startsWith('//') && !callbackPath.includes('\\')
      ? callbackPath
      : '/verify-email';
  try {
    const url = new URL(verifyUrl);
    url.searchParams.set('callbackURL', safePath);
    return url.toString();
  } catch {
    return verifyUrl;
  }
}

/** Inbox subject from the Can't register email frame (246:9978). */
export const BLOCKED_SIGNUP_SUBJECT = 'About your Warehaus sign-up';

/** Mailed when this address cannot start a new self-serve account. No links. */
export const BLOCKED_SIGNUP_BODY =
  "Someone tried to create a Warehaus portal account with this email. This email can't register here. Contact your Warehaus team if you need access.";

export const BLOCKED_SIGNUP_IGNORE = "If this wasn't you, you can ignore this email.";

export const BLOCKED_SIGNUP_FOOTER =
  'Warehaus Studio · Sent by the Warehaus portal because this address was used to sign up.';

export function blockedSignupEmail(): { subject: string; html: string; text: string } {
  const text = [
    'WAREHAUS',
    '',
    BLOCKED_SIGNUP_BODY,
    '',
    BLOCKED_SIGNUP_IGNORE,
    '',
    BLOCKED_SIGNUP_FOOTER,
  ].join('\n');
  const html = `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#0a0a0b;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0b;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
            <tr>
              <td style="background:#262626;border:1px solid #424242;border-radius:18px;padding:48px;font-family:Geist,ui-sans-serif,system-ui,sans-serif;">
                <p style="margin:0 0 24px;font-family:Eurostile,Impact,sans-serif;font-style:italic;font-weight:900;font-size:28px;line-height:1;letter-spacing:-0.56px;color:#fdfdfe;">WAREHAUS</p>
                <div style="height:1px;background:#424242;margin:0 0 24px;font-size:0;line-height:0;">&nbsp;</div>
                <p style="margin:0 0 24px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;line-height:1;letter-spacing:0.88px;color:#a4a4a4;">WAREHAUS PORTAL</p>
                <p style="margin:0 0 24px;font-size:16px;line-height:24px;color:#fdfdfe;">${escapeHtml(BLOCKED_SIGNUP_BODY)}</p>
                <p style="margin:0;font-size:14px;line-height:21px;color:#a4a4a4;">${escapeHtml(BLOCKED_SIGNUP_IGNORE)}</p>
              </td>
            </tr>
            <tr>
              <td style="padding-top:16px;font-family:Geist,ui-sans-serif,system-ui,sans-serif;font-size:12px;line-height:18px;color:#636363;text-align:center;">
                ${escapeHtml(BLOCKED_SIGNUP_FOOTER)}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
  return { subject: BLOCKED_SIGNUP_SUBJECT, html, text };
}

/** Payload scheduled with `ctx.scheduler.runAfter(0, mail.deliver, …)`. */
export function blockedSignupDelivery(to: string): {
  delayMs: 0;
  to: string;
  subject: string;
  html: string;
  text: string;
} {
  const content = blockedSignupEmail();
  return {
    delayMs: 0,
    to,
    subject: content.subject,
    html: content.html,
    text: content.text,
  };
}

export function verificationEmail(args: {
  name?: string | null;
  verifyUrl: string;
}): { subject: string; html: string; text: string } {
  const greeting = args.name?.trim() ? `Hi ${args.name.trim()},` : 'Hi,';
  const subject = 'Verify your Warehaus portal email';
  const text = [
    greeting,
    '',
    'Confirm your email to finish creating your Warehaus portal password.',
    'Open this link (it expires in 30 minutes):',
    args.verifyUrl,
    '',
    'If you did not try to register, you can ignore this email.',
    '',
    '— Warehaus',
  ].join('\n');

  const html = `<!DOCTYPE html>
<html>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.5; color: #111; max-width: 520px; margin: 0 auto; padding: 24px;">
    <p style="font-size: 14px; letter-spacing: 0.08em; text-transform: uppercase; color: #666; margin: 0 0 16px;">Warehaus Portal</p>
    <p>${escapeHtml(greeting)}</p>
    <p>Confirm your email to finish creating your portal password.</p>
    <p style="margin: 28px 0;">
      <a href="${escapeHtml(args.verifyUrl)}"
         style="display: inline-block; background: #111; color: #fff; text-decoration: none; padding: 12px 18px; border-radius: 8px; font-weight: 600;">
        Verify email
      </a>
    </p>
    <p style="font-size: 14px; color: #555;">Or paste this link into your browser:</p>
    <p style="font-size: 13px; word-break: break-all; color: #333;">${escapeHtml(args.verifyUrl)}</p>
    <p style="font-size: 14px; color: #555;">This link expires in 30 minutes. If you did not try to register, you can ignore this email.</p>
  </body>
</html>`;

  return { subject, html, text };
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

export function inviteEmail(args: {
  name: string;
  acceptUrl: string;
}): { subject: string; html: string; text: string } {
  const subject = 'You’re invited to the Warehaus portal';
  const text = [
    `Hi ${args.name},`,
    '',
    'You have a Warehaus portal invite.',
    'Sign in to accept:',
    args.acceptUrl,
    '',
    'If you were not expecting this, you can ignore this email.',
    '',
    '— Warehaus',
  ].join('\n');
  const html = `<!DOCTYPE html>
<html>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.5; color: #111; max-width: 520px; margin: 0 auto; padding: 24px;">
    <p style="font-size: 14px; letter-spacing: 0.08em; text-transform: uppercase; color: #666; margin: 0 0 16px;">Warehaus Portal</p>
    <p>Hi ${escapeHtml(args.name)},</p>
    <p>You have a Warehaus portal invite.</p>
    <p style="margin: 28px 0;">
      <a href="${escapeHtml(args.acceptUrl)}"
         style="display: inline-block; background: #111; color: #fff; text-decoration: none; padding: 12px 18px; border-radius: 8px; font-weight: 600;">
        Accept invite
      </a>
    </p>
    <p style="font-size: 14px; color: #555;">Or paste this link into your browser:</p>
    <p style="font-size: 13px; word-break: break-all; color: #333;">${escapeHtml(args.acceptUrl)}</p>
  </body>
</html>`;
  return { subject, html, text };
}

export function existingLoginEmail(args: {
  name: string;
  acceptUrl: string;
}): { subject: string; html: string; text: string } {
  const subject = 'You already have a Warehaus portal login';
  const text = [
    `Hi ${args.name},`,
    '',
    'You already have a Warehaus portal login. Sign in to accept this invite:',
    args.acceptUrl,
    '',
    '— Warehaus',
  ].join('\n');
  const html = `<!DOCTYPE html>
<html>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.5; color: #111; max-width: 520px; margin: 0 auto; padding: 24px;">
    <p style="font-size: 14px; letter-spacing: 0.08em; text-transform: uppercase; color: #666; margin: 0 0 16px;">Warehaus Portal</p>
    <p>Hi ${escapeHtml(args.name)},</p>
    <p>You already have a Warehaus portal login.</p>
    <p style="margin: 28px 0;">
      <a href="${escapeHtml(args.acceptUrl)}"
         style="display: inline-block; background: #111; color: #fff; text-decoration: none; padding: 12px 18px; border-radius: 8px; font-weight: 600;">
        Sign in to accept
      </a>
    </p>
    <p style="font-size: 14px; color: #555;">Or paste this link into your browser:</p>
    <p style="font-size: 13px; word-break: break-all; color: #333;">${escapeHtml(args.acceptUrl)}</p>
  </body>
</html>`;
  return { subject, html, text };
}

export type InviteMailMessage = { to: string; subject: string; html: string; text: string };

export type InviteMailClient = {
  send: (message: InviteMailMessage) => Promise<void>;
};

/** Exact opt-in. Unset, empty, and any other value stay off. Independent of write-back. */
export function isInviteEmailEnabled(flag: string | undefined): boolean {
  return flag === 'true';
}

export const INVITE_EMAIL_OFF = 'INVITE_EMAIL_ENABLED is off';

/**
 * Sends only when INVITE_EMAIL_ENABLED is exactly "true" and a public origin is set.
 * NOTION_WRITEBACK_ENABLED does not turn this on. Tests pass a mock client.
 */
export async function sendIssuedInviteMail(
  args: { to: string; name: string; rawToken: string; alreadyHasLogin: boolean },
  env: { INVITE_EMAIL_ENABLED?: string; PORTAL_PUBLIC_URL?: string },
  client: InviteMailClient,
): Promise<{ sent: true } | { sent: false; reason: string }> {
  if (!isInviteEmailEnabled(env.INVITE_EMAIL_ENABLED)) {
    return { sent: false, reason: INVITE_EMAIL_OFF };
  }
  const origin = env.PORTAL_PUBLIC_URL?.replace(/\/$/, '') ?? '';
  if (!origin) return { sent: false, reason: 'PORTAL_PUBLIC_URL is not set' };
  const acceptUrl = `${origin}/accept?token=${encodeURIComponent(args.rawToken)}`;
  await deliverInviteEmail(
    {
      to: args.to,
      name: args.name,
      acceptUrl,
      alreadyHasLogin: args.alreadyHasLogin,
    },
    client,
  );
  return { sent: true };
}

/**
 * Hands the built message to the caller. Tests pass a mock client.
 * This function does not call a provider.
 */
export async function deliverInviteEmail(
  args: { to: string; name: string; acceptUrl: string; alreadyHasLogin: boolean },
  client: InviteMailClient,
): Promise<void> {
  const mail = args.alreadyHasLogin
    ? existingLoginEmail({ name: args.name, acceptUrl: args.acceptUrl })
    : inviteEmail({ name: args.name, acceptUrl: args.acceptUrl });
  await client.send({ to: args.to, ...mail });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
