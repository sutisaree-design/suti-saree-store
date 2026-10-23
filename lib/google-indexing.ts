// Best-effort integration with Google's Indexing API: after a blog post is
// published, this pings Google to (re)crawl that specific URL immediately,
// instead of waiting for the next scheduled crawl of sitemap.xml (which can
// take days/weeks for a low-authority page). This is a nice-to-have speed
// boost, not a requirement — sitemap.xml (see app/sitemap.xml/route.ts)
// already lists every published blog post and is the reliable long-term
// discovery path regardless of whether this is configured.
//
// SETUP (optional — everything here fails open/silent if not configured):
//   1. In Google Cloud Console, create a service account and enable the
//      "Web Search Indexing API" for the project.
//   2. Add that service account's email as an Owner of the property in
//      Google Search Console (Settings > Users and permissions).
//   3. Download the service account's JSON key and set two env vars:
//        GOOGLE_INDEXING_CLIENT_EMAIL = the "client_email" field
//        GOOGLE_INDEXING_PRIVATE_KEY  = the "private_key" field, with
//          literal newlines replaced by \n (most hosts store env vars as
//          single-line strings) — this code un-escapes them back at runtime.
//   4. That's it — no other code changes needed, no redeploy-time build
//      step. If these two env vars are absent, indexing requests are
//      silently skipped and nothing else in the app is affected.
//
// Quota note: Google's Indexing API is officially scoped to job-posting /
// livestream pages, but in practice widely used for any page type and
// capped at 200 requests/day per project — comfortably enough for a blog
// publishing cadence of a few posts a day.

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const INDEXING_URL = 'https://indexing.googleapis.com/v3/urlNotifications:publish';
const SCOPE = 'https://www.googleapis.com/auth/indexing';

function base64url(input: ArrayBuffer | string): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function getAccessToken(clientEmail: string, privateKeyPem: string): Promise<string | null> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: clientEmail,
    scope: SCOPE,
    aud: TOKEN_URL,
    exp: now + 3600,
    iat: now,
  };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claim))}`;

  const key = await globalThis.crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(privateKeyPem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await globalThis.crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(unsigned)
  );
  const jwt = `${unsigned}.${base64url(signature)}`;

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data?.access_token ?? null;
}

/**
 * Best-effort "please (re)crawl this URL now" ping to Google. Never throws
 * — every failure mode (not configured, bad key, Google API error, network
 * error) is caught and logged, since this must never block or fail a blog
 * post save/publish.
 */
export async function requestGoogleIndexing(url: string): Promise<boolean> {
  const clientEmail = process.env.GOOGLE_INDEXING_CLIENT_EMAIL;
  const privateKeyRaw = process.env.GOOGLE_INDEXING_PRIVATE_KEY;
  if (!clientEmail || !privateKeyRaw) return false; // not configured — silent no-op

  try {
    const privateKey = privateKeyRaw.replace(/\\n/g, '\n');
    const accessToken = await getAccessToken(clientEmail, privateKey);
    if (!accessToken) {
      console.error('[google-indexing] could not obtain access token');
      return false;
    }

    const res = await fetch(INDEXING_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url, type: 'URL_UPDATED' }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error('[google-indexing] publish failed', res.status, errText.slice(0, 300));
      return false;
    }
    return true;
  } catch (err) {
    console.error('[google-indexing] unexpected error (non-fatal):', err);
    return false;
  }
}
