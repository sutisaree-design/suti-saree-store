import { getSupabaseAdmin } from './supabase-admin';
import { sendEmail } from './email';
import { orderConfirmationEmail, newOrderAdminNotification } from './email-templates';
import { codConfirmUrl, getOrCreateCodConfirmToken } from './cod-confirmation';
import { DEFAULT_LOYALTY_SETTINGS, type LoyaltySettings } from './loyalty-api';
import { DEFAULT_REFERRAL_SETTINGS, type ReferralSettings } from './referrals-api';

// Extracted out of app/api/order-confirm/route.ts so this exact logic can
// also be called server-side from app/api/razorpay/webhook/route.ts --
// see that file's header comment for why. Behaviour is unchanged: same
// five jobs, same idempotency guards (safe to call more than once for the
// same order), same best-effort error handling (nothing here should ever
// throw in a way that aborts the caller).
//
//   1. Customer "order confirmed" email + admin "new order" email.
//   2. Clear this customer's abandoned-cart row, if any.
//   3. Gift card redemption (guest-checkout safe -- not tied to a login).
//   4. Loyalty points (redeem + earn) -- logged-in customers only.
//   5. Referral reward, on the referred customer's first completed order.
export async function runOrderConfirmationSideEffects(orderId: string) {
  const supabase = getSupabaseAdmin();

  const { data: order, error } = await supabase.from('orders').select('*').eq('id', orderId).single();

  if (error || !order) {
    console.error('[order-confirmation] order not found:', orderId, error);
    return;
  }

  // 1a. Customer "order confirmed" email -- guarded by
  // confirmation_email_sent_at so this is safe to call more than once
  // (e.g. once from the client on the happy path, once more from the
  // webhook as a safety net) without double-sending.
  if (order.customer_email && !order.confirmation_email_sent_at) {
    // COD: add the one-tap confirmation link. Fails soft -- if anything goes
    // wrong (e.g. migration not run yet) the email is sent exactly as before.
    let confirmUrl: string | undefined;
    if (order.payment_method === 'cod') {
      const token = await getOrCreateCodConfirmToken(order.id);
      if (token) confirmUrl = codConfirmUrl(token);
    }
    const { subject, html } = orderConfirmationEmail({
      id: order.id,
      customer_name: order.customer_name,
      items: Array.isArray(order.items) ? order.items : [],
      total_amount: order.total_amount,
      payment_method: order.payment_method,
      cod_confirm_url: confirmUrl,
      advance_amount: order.advance_amount,
      balance_due: order.balance_due,
    });

    sendEmail({ to: order.customer_email, subject, html })
      .then(() =>
        supabase.from('orders').update({ confirmation_email_sent_at: new Date().toISOString() }).eq('id', order.id)
      )
      .catch((err) => {
        console.error('[order-confirmation] Customer email send failed:', err);
      });
  }

  // 1b. Clear this customer's abandoned cart, if any — matched by email OR
  // phone. Matching on email alone used to miss the case where the same
  // shopper placed the order using a different email login (or as a
  // guest) but the same phone number as the one captured earlier by the
  // cart-tracking widget, which left a stale "not recovered" row sitting
  // in the admin panel even though the order had already gone through.
  if (order.customer_email || order.customer_phone) {
    try {
      const phoneDigits = (order.customer_phone || '').replace(/\D/g, '').slice(-10);
      const orFilters: string[] = [];
      if (order.customer_email) orFilters.push(`email.eq.${order.customer_email}`);
      if (phoneDigits.length === 10) orFilters.push(`phone.ilike.%${phoneDigits}`);

      const { data: recoveredCarts } = await supabase
        .from('abandoned_carts')
        .update({ recovered: true })
        .or(orFilters.join(','))
        .eq('recovered', false)
        .select('id');

      const cartIds = (recoveredCarts || []).map((c: { id: string }) => c.id);
      if (cartIds.length > 0) {
        await supabase
          .from('abandoned_cart_emails')
          .update({ converted: true, converted_at: new Date().toISOString() })
          .in('cart_id', cartIds)
          .eq('converted', false);
      }
    } catch (err) {
      console.log('Abandoned cart update error (non-critical):', err);
    }
  }

  // 1c. Admin "you've got a new order" email.
  try {
    const { data: orderNotifRow } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'order_notifications')
      .maybeSingle();
    const orderNotif = orderNotifRow?.value as { enabled?: boolean; email?: string } | null;
    const notifEnabled = orderNotif?.enabled !== false;

    if (notifEnabled) {
      let adminEmail = orderNotif?.email?.trim();
      if (!adminEmail) {
        const { data: storeInfoRow } = await supabase
          .from('settings')
          .select('value')
          .eq('key', 'store_info')
          .maybeSingle();
        adminEmail = (storeInfoRow?.value as { support_email?: string } | null)?.support_email;
      }

      if (adminEmail) {
        const notice = newOrderAdminNotification({
          id: order.id,
          customer_name: order.customer_name,
          customer_email: order.customer_email,
          customer_phone: order.customer_phone,
          items: Array.isArray(order.items) ? order.items : [],
          total_amount: order.total_amount,
          payment_method: order.payment_method,
          advance_amount: order.advance_amount,
          balance_due: order.balance_due,
        });

        sendEmail({ to: adminEmail, subject: notice.subject, html: notice.html }).catch((err) => {
          console.error('[order-confirmation] Admin notification email failed:', err);
        });
      } else {
        console.warn(
          '[order-confirmation] No admin/support email configured (Admin -> Settings) -- skipping new-order notification.'
        );
      }
    }
  } catch (adminEmailErr) {
    console.error('[order-confirmation] Admin notification setup failed:', adminEmailErr);
  }

  // 2. Gift card redemption.
  if (order.gift_card_code && order.gift_card_discount > 0) {
    const { data: card } = await supabase
      .from('gift_cards')
      .select('id')
      .eq('code', order.gift_card_code)
      .maybeSingle();

    if (card) {
      const { data: existingRedeem } = await supabase
        .from('gift_card_transactions')
        .select('id')
        .eq('gift_card_id', card.id)
        .eq('order_id', order.id)
        .limit(1);

      if (!existingRedeem || existingRedeem.length === 0) {
        await supabase.from('gift_card_transactions').insert({
          gift_card_id: card.id,
          order_id: order.id,
          amount: -order.gift_card_discount,
          type: 'redeem',
          reason: `Redeemed on order #${order.id.slice(0, 8)}`,
        });
      }
    }
  }

  // 3. Loyalty points -- logged-in customers only.
  if (order.user_id) {
    // Redeemed points are already deducted at checkout (place_order_with_items
    // writes the -points ledger row). This is only a safety net for orders
    // created without that row.
    if (order.loyalty_points_redeemed > 0) {
      const { data: existingRedeem } = await supabase
        .from('loyalty_points_ledger')
        .select('id')
        .eq('order_id', order.id)
        .eq('type', 'redeem')
        .limit(1);

      if (!existingRedeem || existingRedeem.length === 0) {
        const { error: ledgerError } = await supabase.from('loyalty_points_ledger').insert({
          user_id: order.user_id,
          order_id: order.id,
          points: -order.loyalty_points_redeemed,
          type: 'redeem',
          reason: `Redeemed on order #${order.id.slice(0, 8)}`,
        });
        if (ledgerError) {
          console.error('[loyalty-redeem] Ledger insert failed:', ledgerError);
        }
      }
    }

    // EARNING points is NOT done here any more. Points for a purchase are
    // credited only after the order is delivered -- see
    // lib/loyalty-award.ts, called from updateOrderStatus() in lib/orders-api.ts.
    // (Crediting at placement let customers spend points from COD orders
    // that were never shipped, cancelled or returned.)

    // 4. Referral reward -- only fires on the referred customer's FIRST
    // completed order.
    const { data: referral } = await supabase
      .from('referrals')
      .select('*')
      .eq('referred_user_id', order.user_id)
      .eq('status', 'pending')
      .maybeSingle();

    if (referral) {
      const { count: priorOrderCount } = await supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', order.user_id)
        .neq('id', order.id);

      if (!priorOrderCount) {
        const { data: referralSettingsRow } = await supabase
          .from('settings')
          .select('value')
          .eq('key', 'referral_program')
          .maybeSingle();
        const referralSettings: ReferralSettings = {
          ...DEFAULT_REFERRAL_SETTINGS,
          ...((referralSettingsRow?.value as Partial<ReferralSettings>) ?? {}),
        };

        if (referralSettings.enabled) {
          if (referralSettings.referrer_reward_points > 0) {
            await supabase.from('loyalty_points_ledger').insert({
              user_id: referral.referrer_user_id,
              order_id: order.id,
              points: referralSettings.referrer_reward_points,
              type: 'earn',
              reason: `Referral bonus — friend's first order #${order.id.slice(0, 8)}`,
            });
          }

          if (referralSettings.referred_reward_points > 0) {
            await supabase.from('loyalty_points_ledger').insert({
              user_id: order.user_id,
              order_id: order.id,
              points: referralSettings.referred_reward_points,
              type: 'earn',
              reason: `Welcome bonus — signed up with a referral code`,
            });
          }

          await supabase
            .from('referrals')
            .update({
              status: 'completed',
              first_order_id: order.id,
              referrer_reward_points: referralSettings.referrer_reward_points,
              referred_reward_points: referralSettings.referred_reward_points,
              completed_at: new Date().toISOString(),
            })
            .eq('id', referral.id);
        }
      }
    }
  }
}
