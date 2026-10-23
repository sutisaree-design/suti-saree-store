# avif-media-worker

This Cloudflare Worker is deployed **manually via the Cloudflare dashboard**
("Edit code" → paste → Deploy) — it is NOT connected to this GitHub repo's
CI/CD. This copy is kept here purely for version control / backup, so the
deployed code has a history alongside the rest of the codebase.

Routes handled (see Cloudflare dashboard → Workers & Pages → avif-media-worker → Domains):
- cdn.aruhihandlooms.com/*            (Production custom domain)
- aruhihandlooms.com/media/*          (Route)
- www.aruhihandlooms.com/media/*      (Route)

R2 binding: MEDIA_BUCKET -> ethnic-store-media
Env var:    SUPABASE_URL (Settings > Variables) — used for the Supabase
            fallback when a file isn't found in R2, or R2 itself is
            unavailable.

## v2 change (this version)
Every R2 access (env.MEDIA_BUCKET.get/.head, including the AVIF-sibling
lookup) is now wrapped in try/catch. Previously a missing/misconfigured R2
binding, or an R2 outage, would throw and return a 500. Now any R2 failure
is treated the same as "not found in R2" and falls through to Supabase.

## To deploy a change
1. Edit worker.js here, commit + push (for history).
2. Cloudflare dashboard → Workers & Pages → avif-media-worker → Edit code.
3. Select all, paste the updated worker.js content, Deploy.
   (There is no automated deploy from git for this Worker yet.)
