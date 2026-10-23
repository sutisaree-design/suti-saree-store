import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// GET /api/unsubscribe/<campaign_send id> — the link embedded in every
// campaign email's footer (and the "Not Interested" button on the
// Welcome Introduction template). No auth, since the person clicking it
// is reading email, not logged into the admin — the uuid itself is the
// capability: it's the same unguessable per-recipient id already used for
// open tracking, so this can only ever opt out the one person it was sent
// to, never anyone else.
//
// This is enforced at the query level in send-campaign (customers with
// opted_out = true are excluded from the recipient list before sending),
// not just hidden in the admin UI — so there's no path that re-includes
// someone who opted out.

function page(message: string) {
  return new NextResponse(
    `<!DOCTYPE html>
<html>
  <head><meta charset="utf-8" /><title>Unsubscribed</title></head>
  <body style="font-family: Georgia, 'Times New Roman', serif; background:#f4efe9; color:#2b2320; margin:0; padding:0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4efe9;">
      <tr>
        <td align="center" style="padding: 60px 16px;">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:100%; background:#fffaf5; border-radius:6px;">
            <tr>
              <td style="padding: 40px 32px; text-align:center;">
                <p style="margin:0; font-size:16px; line-height:1.6;">${message}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`,
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

export async function GET(_req: NextRequest, { params }: { params: { sendId: string } }) {
  const sendId = params.sendId;

  if (!/^[0-9a-f-]{36}$/i.test(sendId)) {
    return page("That unsubscribe link doesn't look right, but if you'd like to stop receiving emails, just reply to any email from us and we'll remove you.");
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data: sendRow } = await supabase
      .from('woocommerce_campaign_sends')
      .select('customer_id')
      .eq('id', sendId)
      .maybeSingle();

    if (!sendRow?.customer_id) {
      return page("That unsubscribe link has already expired, but if you'd like to stop receiving emails, just reply to any email from us and we'll remove you.");
    }

    await supabase
      .from('woocommerce_customers')
      .update({ opted_out: true, opted_out_at: new Date().toISOString() })
      .eq('id', sendRow.customer_id);

    return page("You're unsubscribed. You won't receive any more marketing emails from us.");
  } catch (err) {
    console.error('[unsubscribe] failed:', err);
    return page('Something went wrong on our end. Please reply to any email from us and we will remove you manually.');
  }
}
