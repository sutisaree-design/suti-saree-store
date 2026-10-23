import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// Facebook/Instagram/Threads access tokens live in `social_publish`.
// These are live credentials for the store's social accounts and must
// never be readable/writable with the public anon key. This route is
// the only place that touches the `social_publish` row now.

export interface SocialPublishSettings {
  facebook_enabled: boolean;
  instagram_enabled: boolean;
  access_token: string;
  facebook_page_id: string;
  instagram_business_account_id: string;
  threads_enabled: boolean;
  threads_access_token: string;
  threads_user_id: string;
  caption_template: string;
}

const DEFAULT_SOCIAL_PUBLISH_SETTINGS: SocialPublishSettings = {
  facebook_enabled: false,
  instagram_enabled: false,
  access_token: '',
  facebook_page_id: '',
  instagram_business_account_id: '',
  threads_enabled: false,
  threads_access_token: '',
  threads_user_id: '',
  caption_template: '✨ New Arrival: {name}\n\n{description}\n\nPrice: ₹{price}\nShop now: {url}',
};

async function requireAdmin() {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  return verified.valid;
}

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'social_publish')
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const settings = { ...DEFAULT_SOCIAL_PUBLISH_SETTINGS, ...((data?.value as Partial<SocialPublishSettings>) ?? {}) };
  return NextResponse.json({ settings });
}

export async function PUT(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as Partial<SocialPublishSettings> | null;
  if (!body) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const settings: SocialPublishSettings = { ...DEFAULT_SOCIAL_PUBLISH_SETTINGS, ...body };
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('settings')
    .upsert({ key: 'social_publish', value: settings }, { onConflict: 'key' });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
