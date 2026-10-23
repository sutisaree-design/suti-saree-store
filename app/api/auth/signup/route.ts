import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { sendEmail } from '@/lib/email';
import { signupVerificationEmail } from '@/lib/email-templates';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const fullName = (body?.fullName as string | undefined)?.trim();
    const email = (body?.email as string | undefined)?.trim().toLowerCase();
    const password = body?.password as string | undefined;
    const next = (body?.next as string | undefined) || '/account';
    const referredByCode = (body?.referredByCode as string | undefined)?.trim().toUpperCase() || undefined;

    if (!fullName) {
      return NextResponse.json({ error: 'Full name is required' }, { status: 400 });
    }
    if (!email || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: 'A valid email is required' }, { status: 400 });
    }
    if (!password || password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
    }

    const { origin } = new URL(req.url);
    const admin = getSupabaseAdmin();

    // Creates the (unconfirmed) user and returns a one-time verification link,
    // without Supabase sending any email of its own -- we send it ourselves below.
    const { data, error } = await admin.auth.admin.generateLink({
      type: 'signup',
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          ...(referredByCode ? { referred_by_code: referredByCode } : {}),
        },
        redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });

    if (error) {
      // Supabase returns this specific message when the email is already registered.
      const alreadyRegistered = /already registered|already exists/i.test(error.message);
      return NextResponse.json(
        { error: alreadyRegistered ? 'An account with this email already exists.' : error.message },
        { status: alreadyRegistered ? 409 : 400 }
      );
    }

    const verifyUrl = data?.properties?.hashed_token
      ? `${origin}/auth/confirm?token_hash=${encodeURIComponent(
          data.properties.hashed_token
        )}&type=signup&next=${encodeURIComponent(next)}`
      : undefined;
    if (!verifyUrl) {
      return NextResponse.json({ error: 'Could not generate a verification link' }, { status: 500 });
    }

    const { subject, html } = signupVerificationEmail({ full_name: fullName, verify_url: verifyUrl });
    const result = await sendEmail({ to: email, subject, html });

    if (!result.success) {
      console.error('[signup] verification email failed:', result.error);
      return NextResponse.json(
        {
          error:
            'Account created, but the confirmation email could not be sent. Please contact support or try again later.',
        },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    // Catches things like getSupabaseAdmin() throwing when
    // SUPABASE_SERVICE_ROLE_KEY is missing/misconfigured. Without this,
    // Next.js returns an HTML 500 page instead of JSON, which breaks
    // res.json() on the client and shows a generic "Something went wrong"
    // toast that hides the real cause. Now the real reason gets logged
    // server-side and a clear message goes to the user.
    console.error('[signup] unexpected error:', err);
    const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
