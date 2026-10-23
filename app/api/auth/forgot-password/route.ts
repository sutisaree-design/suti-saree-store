import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { sendEmail } from '@/lib/email';
import { passwordResetEmail } from '@/lib/email-templates';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Generates a password-reset link ourselves (via the admin API) and emails
// it with our own sender, instead of supabase.auth.resetPasswordForEmail(),
// which sends through Supabase's own built-in mailer and hits its very low
// rate limit unless Custom SMTP is set up in the dashboard.
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = (body?.email as string | undefined)?.trim().toLowerCase();
    const next = (body?.next as string | undefined) || '/reset-password';

    if (!email || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: 'A valid email is required' }, { status: 400 });
    }

    const { origin } = new URL(req.url);
    const admin = getSupabaseAdmin();

    const { data, error } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: {
        redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });

    if (error || !data?.properties?.hashed_token) {
      const notFound = /not found|no user|does not exist|unable to find/i.test(error?.message || '');
      if (notFound) {
        return NextResponse.json(
          { error: 'No account found with this email. Please create an account first.' },
          { status: 404 }
        );
      }
      console.error('[forgot-password] generateLink failed:', error?.message);
      return NextResponse.json(
        { error: 'Could not process this request. Please try again shortly.' },
        { status: 502 }
      );
    }

    const resetUrl = `${origin}/auth/confirm?token_hash=${encodeURIComponent(
      data.properties.hashed_token
    )}&type=recovery&next=${encodeURIComponent(next)}`;

    const fullName = (data.user?.user_metadata as any)?.full_name as string | undefined;
    const { subject, html } = passwordResetEmail({ full_name: fullName, reset_url: resetUrl });
    const result = await sendEmail({ to: email, subject, html });

    if (!result.success) {
      console.error('[forgot-password] email failed:', result.error);
      return NextResponse.json(
        { error: 'Could not send the reset email. Please try again shortly.' },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[forgot-password] unexpected error:', err);
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 }
    );
  }
}
