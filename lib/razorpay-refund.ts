// Issues a full refund on Razorpay for an already-captured payment.
// Used by the customer self-cancellation flow (app/api/orders/[id]/cancel)
// so a cancelled online-paid order is refunded automatically instead of
// requiring the admin to do it by hand in the Razorpay dashboard.
export async function refundRazorpayPayment(
  paymentId: string,
  amountInRupees: number
): Promise<{ success: true; refundId: string } | { success: false; error: string }> {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    return { success: false, error: 'Razorpay keys not configured' };
  }

  try {
    const res = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}/refund`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
      },
      // Razorpay wants the amount in paise. Omitting `amount` entirely
      // would also trigger a full refund, but being explicit protects us
      // if `amountInRupees` is ever a partial figure down the line.
      body: JSON.stringify({ amount: Math.round(amountInRupees * 100) }),
    });

    const data = await res.json();

    if (!res.ok) {
      return { success: false, error: data?.error?.description || 'Razorpay refund request failed' };
    }

    return { success: true, refundId: data.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Razorpay refund request failed';
    return { success: false, error: message };
  }
}
