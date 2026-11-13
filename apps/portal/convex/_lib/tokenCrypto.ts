/** SHA-256 hex and a one-time portal token. The raw token is never stored. */

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function newPortalToken(): { token: string; prefix: string } {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const body = btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
  const token = `whp_${body}`;
  return { token, prefix: token.slice(0, 12) };
}
