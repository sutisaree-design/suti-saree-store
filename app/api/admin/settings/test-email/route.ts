import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { sendEmail } from '@/lib/email';

export async function POST(req: Request) {
  try {
    const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
    const verified = await verifyAdminToken(cookie);
    if (!verified.valid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const to = (body?.to as string | undefined)?.trim();
    if (!to) {
      return NextResponse.json({ error: 'Missing recipient email' }, { status: 400 });
    }

    const result = await sendEmail({
      to,
      subject: 'Test email from your store',
      html: `<div style="font-family: sans-serif; padding: 24px;">
        <h2>It works!</h2>
        <p>This is a test email from your store's admin panel. If you received this, your email provider is configured correctly.</p>
      </div>`,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.skipped ? result.error : 'Provider rejected the email — check the API key and sender email.', details: (result as any).error },
        { status: 502 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[test-email] unexpected error:', err);
    const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
