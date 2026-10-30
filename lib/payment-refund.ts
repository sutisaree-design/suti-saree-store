// One refund entry point for every gateway. Orders store WHICH gateway took the money in
// orders.payment_gateway (null/'razorpay' = Razorpay, the original behaviour).
//   Razorpay: refunds by payment id            (orders.razorpay_payment_id)
//   Cashfree: refunds by Cashfree ORDER id     (orders.cashfree_order_id)
import { refundRazorpayPayment } from './razorpay-refund';
import { refundCashfreePayment } from './cashfree';

export interface RefundableOrder {
  id: string;
  payment_gateway?: string | null;
  razorpay_payment_id?: string | null; // holds the Cashfree payment id for Cashfree orders
  cashfree_order_id?: string | null;
}

export async function refundOrderPayment(
  order: RefundableOrder,
  amountInRupees: number
): Promise<{ success: true; refundId: string } | { success: false; error: string }> {
  if (order.payment_gateway === 'cashfree') {
    if (!order.cashfree_order_id) return { success: false, error: 'Cashfree order id missing on this order' };
    // Deterministic id (<= 40 chars) => retrying the same refund can never double-refund.
    const refundId = `rf_${order.id.replace(/-/g, '')}`.slice(0, 40);
    return refundCashfreePayment(order.cashfree_order_id, amountInRupees, refundId);
  }
  if (!order.razorpay_payment_id) return { success: false, error: 'No payment id on this order' };
  return refundRazorpayPayment(order.razorpay_payment_id, amountInRupees);
}
