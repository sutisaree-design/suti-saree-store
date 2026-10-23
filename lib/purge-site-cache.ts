/**
 * Browser-side helper: tells the server to refresh the cached storefront
 * layout after an admin saves a setting the layout reads (site banner, SEO,
 * analytics, growth/sale bar, payment discount). Best-effort -- a failure
 * must never make the settings save itself look like it failed, so errors
 * are swallowed (the page still self-heals via `revalidate` within 30 min).
 * See app/api/admin/revalidate-site/route.ts.
 */
export async function purgeSiteLayoutCache(): Promise<void> {
  try {
    await fetch('/api/admin/revalidate-site', { method: 'POST' });
  } catch {
    /* best-effort */
  }
}
