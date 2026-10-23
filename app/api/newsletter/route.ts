import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase-server';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const email = (body?.email as string | undefined)?.trim().toLowerCase();

  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'A valid email is required' }, { status: 400 });
  }

  const supabase = getServerSupabase();
  const { error } = await supabase
    .from('newsletter_subscribers')
    .insert({ email, source: 'footer' });

  // 23505 = unique_violation — already subscribed, treat as success.
  if (error && (error as { code?: string }).code !== '23505') {
    return NextResponse.json({ error: 'Could not subscribe right now' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
