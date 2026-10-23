// Runtime-friendly admin session tokens using HMAC-SHA256 via Web Crypto
const ADMIN_SESSION_COOKIE = 'admin_session';
const ADMIN_SESSION_MAX_AGE = 7 * 24 * 60 * 60; // 7 days in seconds

function base64UrlEncode(input: string) {
  // Use Buffer in Node, fallback to browser btoa
  const b64 = typeof Buffer !== 'undefined'
    ? Buffer.from(input).toString('base64')
    : (typeof btoa !== 'undefined' ? btoa(unescape(encodeURIComponent(input))) : '');
  return b64.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function base64UrlDecode(input: string) {
  // restore padding
  let b64 = input.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(b64, 'base64').toString();
  }
  if (typeof atob !== 'undefined') {
    return decodeURIComponent(escape(atob(b64)));
  }
  return '';
}

async function hmacHex(secret: string, msg: string): Promise<string> {
  // Prefer Web Crypto Subtle (works in Edge and modern Node)
  if (typeof globalThis.crypto?.subtle !== 'undefined') {
    const enc = new TextEncoder();
    const key = await globalThis.crypto.subtle.importKey(
      'raw',
      enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const sig = await globalThis.crypto.subtle.sign('HMAC', key, enc.encode(msg));
    const bytes = new Uint8Array(sig);
    return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  // Node fallback: if Web Crypto isn't available, throw a clear error.
  // Edge runtime must use Web Crypto; Node servers should run on Node with globalThis.crypto.subtle available.
  throw new Error('Web Crypto Subtle API (crypto.subtle) is required for admin token operations in this runtime.');
}

function timingSafeEqualHex(a: string, b: string) {
  if (a.length !== b.length) return false;
  let res = 0;
  for (let i = 0; i < a.length; i++) {
    res |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return res === 0;
}

export async function createAdminToken() {
  const secret = process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD || '';
  const maxAge = ADMIN_SESSION_MAX_AGE;
  const now = Math.floor(Date.now() / 1000);
  const payload = { iat: now, exp: now + maxAge };
  const payloadJson = JSON.stringify(payload);
  const payloadB64 = base64UrlEncode(payloadJson);
  const sig = await hmacHex(secret, payloadB64);
  return `${payloadB64}.${sig}`;
}

export async function verifyAdminToken(token: string | undefined | null) {
  if (!token) return { valid: false };
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return { valid: false };
    const [payloadB64, sig] = parts;
    const secret = process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD || '';
    const expected = await hmacHex(secret, payloadB64);

    if (!timingSafeEqualHex(sig, expected)) return { valid: false };

    const payloadJson = base64UrlDecode(payloadB64);
    const payload = JSON.parse(payloadJson);
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp > now) {
      return { valid: true, payload };
    }
    return { valid: false };
  } catch (err) {
    return { valid: false };
  }
}

export { ADMIN_SESSION_COOKIE, ADMIN_SESSION_MAX_AGE };
