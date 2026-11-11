/**
 * One invite letter for the sent HTML and the in-app preview.
 * Light card, ink wordmark, divider, no clock. E02 is the source.
 */

export type InviteEmailContent = {
  acceptUrl: string;
  who: string;
  action: string;
  button: string;
  expiryDetail: string;
  because: string;
  wordmarkSrc: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const EMAIL_MEDIA = `@media (max-width: 480px) {
  .invite-card { padding: 22px !important; }
  .invite-button { display: block !important; width: 100% !important; box-sizing: border-box !important; text-align: center !important; }
}`;

/** Card markup shared by InviteEmailPreview and the message Resend sends. */
export function inviteEmailMarkup(args: InviteEmailContent): string {
  const acceptUrl = escapeHtml(args.acceptUrl);
  const who = escapeHtml(args.who);
  const action = escapeHtml(args.action);
  const button = escapeHtml(args.button);
  const expiryDetail = escapeHtml(args.expiryDetail);
  const because = escapeHtml(args.because);
  const wordmark = escapeHtml(args.wordmarkSrc);
  return `<style>${EMAIL_MEDIA}</style>
<div style="font-family:Geist,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1.5;color:#0a0a0b;background:#fdfdfe;max-width:640px;margin:0 auto;padding:48px 24px 24px;">
  <div class="invite-card" style="background:#ffffff;border:1px solid #d7d7d7;border-radius:12px;padding:48px;">
    <img src="${wordmark}" alt="warehaus" width="180" height="24" style="display:block;width:180px;height:24px;border:0;" />
    <p style="margin:24px 0 0;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#525252;">Staff invite</p>
    <h1 style="font-size:30px;line-height:40px;margin:8px 0 0;font-weight:600;color:#0a0a0b;">Join Warehaus on the Portal</h1>
    <p style="font-size:16px;line-height:26px;color:#525252;">${who} invited you to join Warehaus as staff. ${action}</p>
    <p style="margin:40px 0 24px;">
      <a class="invite-button" href="${acceptUrl}" style="display:inline-block;background:#0a0a0b;color:#fdfdfe;text-decoration:none;padding:10px 18px;border-radius:9px;font-weight:600;">${button}</a>
    </p>
    <div style="background:#f7f7f7;border:1px solid #d7d7d7;border-radius:10px;padding:16px;">
      <p style="margin:0;font-size:14px;line-height:21px;font-weight:600;color:#0a0a0b;">This link expires in 7 days</p>
      <p style="margin:4px 0 0;font-size:13px;line-height:20px;color:#525252;">${expiryDetail}</p>
    </div>
    <p style="margin:24px 0 0;font-size:13px;line-height:20px;color:#525252;">Button not working? Paste this link into your browser:</p>
    <p style="margin:6px 0 0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;line-height:18px;color:#0a0a0b;word-break:break-all;">${acceptUrl}</p>
    <hr style="border:0;border-top:1px solid #d7d7d7;margin:24px 0;" />
    <p style="margin:0;font-size:13px;line-height:20px;color:#525252;">Weren’t expecting this? You can ignore this email. Nothing is created until you accept, and we never ask for your password by email.</p>
  </div>
  <p style="margin:24px 0 0;font-size:12px;line-height:18px;color:#929292;text-align:center;">Warehaus · warehaus.studio</p>
  <p style="margin:4px 0 0;font-size:12px;line-height:18px;color:#929292;text-align:center;">${because}</p>
</div>`;
}

export function inviteEmailDocument(args: InviteEmailContent): string {
  return `<!DOCTYPE html>
<html>
  <head>
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <style>${EMAIL_MEDIA}</style>
  </head>
  <body style="margin:0;padding:0;background:#fdfdfe;color:#0a0a0b;color-scheme:light only;">
    ${inviteEmailMarkup(args)}
  </body>
</html>`;
}

export function wordmarkSrcForAcceptUrl(acceptUrl: string): string {
  try {
    return `${new URL(acceptUrl).origin}/icons/wordmark-ink.png`;
  } catch {
    return '/icons/wordmark-ink.png';
  }
}
