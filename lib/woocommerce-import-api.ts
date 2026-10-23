// ---------------------------------------------------------------------
// WooCommerce customer import.
//
// Lets the admin connect to an *external* WooCommerce store's REST API
// and pull customer name / email / phone into this store's admin, so
// they can be targeted with email marketing campaigns from here.
//
// Client-side wrappers only -- the actual WooCommerce fetch + Supabase
// writes happen server-side in app/api/admin/woocommerce-import/route.ts
// (never expose the WooCommerce Consumer Secret to the browser bundle).
// ---------------------------------------------------------------------

export interface WooCommerceCredentials {
  storeUrl: string; // e.g. https://mystore.com (no trailing slash needed)
  consumerKey: string;
  consumerSecret: string;
}

export interface ImportedCustomer {
  id: string;
  wc_customer_id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  source: string;
  source_store_url: string | null;
  imported_at: string;
  opted_out: boolean;
  opted_out_at: string | null;
  last_sent_at: string | null;
  last_opened_at: string | null;
  last_clicked_at: string | null;
}

export interface ImportResult {
  done: boolean;
  imported: number;
  ordersScanned: number;
  nextPage: number | null;
  totalScannedAllTime?: number;
  expectedTotal?: number | null;
  warning?: string | null;
}

export async function importWooCommerceCustomersChunk(
  creds: WooCommerceCredentials & { reset?: boolean }
): Promise<ImportResult> {
  const res = await fetch('/api/admin/woocommerce-import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(creds),
  });
  let parseFailed = false;
  const json = await res.json().catch(() => {
    parseFailed = true;
    return {};
  });
  if (!res.ok) {
    // A non-JSON body on failure means the platform (not our route) cut the
    // request off -- almost always a function timeout -- rather than our
    // own try/catch, which always returns real JSON with an `error` field.
    if (parseFailed) {
      throw new Error(
        `Server ne time se pehle jawab nahi diya (status ${res.status}) — is se ye lagta hai ki request timeout ho gayi, ` +
          `galat credentials ka issue nahi hai. Kam pages-per-call try karo ya thodi der baad phir se try karo.`
      );
    }
    throw new Error(json.error || 'Import failed');
  }
  return json as ImportResult;
}

export async function fetchImportedCustomers(): Promise<ImportedCustomer[]> {
  const res = await fetch('/api/admin/woocommerce-import');
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Failed to load imported customers');
  return json.customers as ImportedCustomer[];
}

export async function deleteImportedCustomer(id: string): Promise<void> {
  const res = await fetch(`/api/admin/woocommerce-import/${id}`, { method: 'DELETE' });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Failed to delete');
}

export interface SendCampaignArgs {
  customerIds: string[];
  subject: string;
  html: string;
  // If set (> 0), nothing is sent immediately — the selected customers are
  // queued and picked up by the daily drip cron once this many hours have
  // passed (subject to the same daily send cap as the automation).
  scheduleAfterHours?: number;
}

export interface SendCampaignResult {
  sent: number;
  failed: number;
  skipped: number;
  queued?: number;
  scheduledAt?: string;
}

export async function sendWooCommerceCampaign(args: SendCampaignArgs): Promise<SendCampaignResult> {
  const res = await fetch('/api/admin/woocommerce-import/send-campaign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Failed to send campaign');
  return json as SendCampaignResult;
}

export interface CampaignHistoryEntry {
  subject: string;
  sent: number;
  failed: number;
  skipped: number;
  opened: number;
  clicked: number;
  lastSentAt: string;
}

export async function fetchCampaignHistory(): Promise<CampaignHistoryEntry[]> {
  const res = await fetch('/api/admin/woocommerce-import/send-campaign');
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Failed to load campaign history');
  return json.campaigns as CampaignHistoryEntry[];
}

export type CampaignRecipientStatus = 'sent' | 'opened' | 'clicked' | 'failed';

export interface CampaignRecipient {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  subject: string;
  status: string;
  sentAt: string;
  openedAt: string | null;
  clickedAt: string | null;
}

// Powers the clickable Sent/Opened/Clicked/Failed cards -- name/email list
// behind each of those aggregate numbers, across every campaign ever sent.
export async function fetchCampaignRecipients(
  status: CampaignRecipientStatus
): Promise<CampaignRecipient[]> {
  const res = await fetch(`/api/admin/woocommerce-import/send-campaign/recipients?status=${status}`);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Failed to load recipients');
  return json.recipients as CampaignRecipient[];
}

export interface FeaturedProduct {
  id: string;
  name: string;
  slug: string;
  price: number;
  mrp: number | null;
  image: string | null;
  category_name: string | null;
  url: string;
}

export interface CampaignCategoryOption {
  name: string;
  slug: string;
  image: string | null;
  url: string;
}

export async function fetchFeaturedProducts(
  limit = 6,
  category?: string
): Promise<{ products: FeaturedProduct[]; categories: CampaignCategoryOption[] }> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (category) params.set('category', category);
  const res = await fetch(`/api/admin/woocommerce-import/featured-products?${params.toString()}`);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Failed to load products');
  return { products: json.products ?? [], categories: json.categories ?? [] };
}

// ---------------------------------------------------------------------
// Audience segmentation (cold / warm / hot)
// ---------------------------------------------------------------------

export type AudienceSegment = 'cold' | 'warm' | 'hot';

export interface SegmentCounts {
  cold: number;
  warm: number;
  hot: number;
  total: number;
}

export interface BehaviorFlags {
  purchased: boolean;
  addedToCart: boolean;
  wishlisted: boolean;
  cartAbandoner: boolean; // began checkout (from a tracked campaign click) but never purchased
  notOpenedWelcome: boolean; // welcome sent >= followupDelayDays ago, still not opened
  emailSent: boolean; // received at least one campaign email, ever
  emailOpened: boolean; // opened at least one campaign email, ever
  emailClicked: boolean; // clicked a link in at least one campaign email, ever
  emailFailed: boolean; // at least one campaign send failed for this customer
}

export interface BehaviorCounts {
  purchased: number;
  addedToCart: number;
  wishlisted: number;
  cartAbandoner: number;
  notOpenedWelcome: number;
  emailSent: number;
  emailOpened: number;
  emailClicked: number;
  emailFailed: number;
}

export interface SegmentsResult {
  segments: Record<string, AudienceSegment>;
  counts: SegmentCounts;
  behaviorFlags: Record<string, BehaviorFlags>;
  behaviorCounts: BehaviorCounts;
}

// GET /api/admin/woocommerce-import/segments
// cold = kabhi email open nahi kiya (ya open kiya par link click nahi kiya)
// warm = email ka link click kiya, site pe aaya, par kharida nahi (sirf 1 page dekha)
// hot  = kharida, YA email click karke 2+ pages dekhe
// behaviorFlags = extra, non-exclusive tags (purchased/addedToCart/wishlisted/
// cartAbandoner/notOpenedWelcome) — a customer can match more than one.
export async function fetchAudienceSegments(): Promise<SegmentsResult> {
  const res = await fetch('/api/admin/woocommerce-import/segments');
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Failed to load segments');
  return json as SegmentsResult;
}

// ---------------------------------------------------------------------
// Welcome -> Follow-up drip automation
// ---------------------------------------------------------------------

export interface DripStepSettings {
  templateId: CampaignTemplateIdLike;
  subject: string;
  headline: string;
  subheadline: string;
}

// Kept as a loose string type here (instead of importing CampaignTemplateId)
// so this file doesn't have to depend on campaign-templates.ts — the admin
// panel already imports the real type from there and passes it through.
export type CampaignTemplateIdLike = string;

export interface WooCommerceDripSettings {
  enabled: boolean;
  dailySendCap: number;
  followupDelayDays: number;
  followupRequiresOpen: boolean;
  sendHourIST: number; // 0-23
  sourceStoreName: string;
  welcome: DripStepSettings;
  followup: DripStepSettings;
}

export interface DripProgress {
  sentToday: number;
  dailyCap: number;
  queuedWelcome: number;
  queuedFollowup: number;
  sentWelcomeTotal: number;
  sentFollowupTotal: number;
  notOpenedWelcome: number;
}

export async function fetchDripAutomationSettings(): Promise<{
  settings: WooCommerceDripSettings;
  progress: DripProgress;
}> {
  const res = await fetch('/api/admin/woocommerce-import/automation');
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Failed to load automation settings');
  return json as { settings: WooCommerceDripSettings; progress: DripProgress };
}

export async function saveDripAutomationSettings(
  settings: WooCommerceDripSettings,
  runNow = false
): Promise<{ settings: WooCommerceDripSettings; runResult: any }> {
  const res = await fetch('/api/admin/woocommerce-import/automation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ settings, runNow }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Failed to save automation settings');
  return json as { settings: WooCommerceDripSettings; runResult: any };
}
