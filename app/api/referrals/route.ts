import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/supabase-server-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { DEFAULT_REFERRAL_SETTINGS, type ReferralSettings } from '@/lib/referrals-api';

// Generates a short, human-shareable code, e.g. "AMISHA4F2K".
function generateCode(seed: string) {
  const namePart = seed.replace(/[^A-Za-z]/g, '').slice(0, 6).toUpperCase() || 'FRIEND';
  const randomPart = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${namePart}${randomPart}`;
}

// GET — the logged-in customer's referral code (created on first visit)
// plus their referral history (people who signed up with their code).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Please log in to view your referral code' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();

  try {
    const { data: settingsRow } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'referral_program')
      .maybeSingle();
    const settings: ReferralSettings = {
      ...DEFAULT_REFERRAL_SETTINGS,
      ...((settingsRow?.value as Partial<ReferralSettings>) ?? {}),
    };

    let { data: codeRow } = await supabase
      .from('referral_codes')
      .select('code')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!codeRow) {
      const seed =
        (user.user_metadata?.full_name as string | undefined) || user.email?.split('@')[0] || 'FRIEND';

      // Try a few times in case of a rare code collision (unique constraint).
      for (let attempt = 0; attempt < 5 && !codeRow; attempt++) {
        const code = generateCode(seed);
        const { data: inserted, error: insertErr } = await supabase
          .from('referral_codes')
          .insert({ user_id: user.id, code })
          .select('code')
          .maybeSingle();
        if (!insertErr && inserted) {
          codeRow = inserted;
        } else if (insertErr && !/duplicate|unique/i.test(insertErr.message)) {
          throw insertErr;
        }
      }

      // Someone else's request may have created it concurrently — re-fetch.
      if (!codeRow) {
        const { data: retry } = await supabase
          .from('referral_codes')
          .select('code')
          .eq('user_id', user.id)
          .maybeSingle();
        codeRow = retry ?? null;
      }
    }

    if (!codeRow) {
      return NextResponse.json({ error: 'Could not generate a referral code' }, { status: 500 });
    }

    const { data: referrals, error: referralsErr } = await supabase
      .from('referrals')
      .select('id, referred_user_id, code, status, referrer_reward_points, referred_reward_points, created_at, completed_at')
      .eq('referrer_user_id', user.id)
      .order('created_at', { ascending: false });
    if (referralsErr) throw referralsErr;

    return NextResponse.json({ code: codeRow.code, settings, referrals: referrals ?? [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load referral data';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
