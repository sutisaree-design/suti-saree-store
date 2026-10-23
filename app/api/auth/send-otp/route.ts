import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { sendEmail } from '@/lib/email';
import { otpLoginEmail } from '@/lib/email-templates';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Generates a login OTP ourselves (via the admin API) and emails it with our
// own sender (ZeptoMail/Resend, configured in Admin -> Settings -> Email
// Notifications), instead of relying on supabase.auth.signInWithOtp(), which
// sends through Supabase's own built-in mailer and hits its very low rate
// limit (a few emails/hour) unless Custom SMTP is set up in the dashboard.
//
// The code emailed here is verified the normal way on the client with
// supabase.auth.verifyOtp({ email, token, type: 'email' }) -- that call
// doesn't send any email itself, so it isn't affected by this change.
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = (body?.email as string | undefined)?.trim().toLowerCase();

    if (!email || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: 'A valid email is required' }, { status: 400 });
    }

    const admin = getSupabaseAdmin();

    // type: 'magiclink' auto-creates the user if they don't exist yet, matching
    // the previous shouldCreateUser: true behaviour of signInWithOtp.
    const { data, error } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });

    if (error) {
      console.error('[send-otp] generateLink failed:', error.message);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const code = data?.properties?.email_otp;
    if (!code) {
      return NextResponse.json({ error: 'Could not generate a login code' }, { status: 500 });
    }

    const { subject, html } = otpLoginEmail({ email, code });
    const result = await sendEmail({ to: email, subject, html });

    if (!result.success) {
      console.error('[send-otp] email failed:', result.error);
      return NextResponse.json(
        { error: 'Could not send the login code. Please try again shortly.' },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[send-otp] unexpected error:', err);
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 }
    );
  }
}
