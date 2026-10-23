'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

declare global {
  interface Window {
    Razorpay: any;
  }
}

// Loads https://checkout.razorpay.com/v1/checkout.js on demand and
// resolves once window.Razorpay is actually available. The main
// /checkout page loads this script itself (via next/script), but this
// button also renders on /checkout/resume/[id] -- a separate route that
// never includes that script -- which is why "Complete Payment" here was
// throwing "window.Razorpay is not a constructor". Loading it here makes
// this button self-sufficient regardless of which page it's used on, and
// also avoids the race where next/script's "afterInteractive" hasn't
// finished loading yet by the time someone clicks Pay.
let razorpayScriptPromise: Promise<void> | null = null;
function loadRazorpayScript(): Promise<void> {
  if (typeof window !== 'undefined' && window.Razorpay) {
    return Promise.resolve();
  }
  if (razorpayScriptPromise) return razorpayScriptPromise;

  razorpayScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://checkout.razorpay.com/v1/checkout.js"]'
    );
    if (existing) {
      // Script tag already in the DOM (e.g. added by the main checkout
      // page) — just wait for window.Razorpay to show up rather than
      // adding a duplicate <script>.
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Failed to load Razorpay checkout script')));
      if (window.Razorpay) resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Razorpay checkout script'));
    document.body.appendChild(script);
  }).catch((err) => {
    // Don't cache a rejected promise — let the next click retry the load.
    razorpayScriptPromise = null;
    throw err;
  });

  return razorpayScriptPromise;
}

// Reopens Razorpay checkout for an order that was already created by
// place_order_with_items() (stock reserved, address saved) but never got
// paid — the customer closed the popup or the payment failed. This does
// NOT rebuild the cart or re-collect the address; it just re-runs the
// same create-order -> pay -> verify-payment sequence that
// app/checkout/page.tsx uses, scoped to this one existing order.
export default function ResumePaymentButton({
  orderId,
  customerName,
  customerEmail,
  customerPhone,
  payLabel,
}: {
  orderId: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  /** Overrides the button text (e.g. "Pay advance ₹500" for Partial Pay orders). */
  payLabel?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handlePay = async () => {
    setLoading(true);
    try {
      // Re-issues a fresh Razorpay order for the SAME internal order —
      // create-order looks up the authoritative amount server-side, so
      // this can't be tampered with, and it re-links razorpay_order_id
      // on the existing 'pending' row (see app/api/razorpay/create-order).
      const createOrderRes = await fetch('/api/razorpay/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ internalOrderId: orderId }),
      });
      const createOrderData = await createOrderRes.json();
      if (!createOrderRes.ok) {
        throw new Error(createOrderData.error || 'Failed to start payment');
      }

      // Make sure window.Razorpay actually exists before constructing it —
      // this page doesn't load the checkout.js script on its own.
      await loadRazorpayScript();

      await new Promise<void>((resolve, reject) => {
        const rzp = new window.Razorpay({
          key: createOrderData.keyId,
          order_id: createOrderData.order.id,
          name: 'AruhiHandlooms',
          description: 'Handwoven Ethnic Wear Purchase',
          image: 'https://images.pexels.com/photos/1191349/pexels-photo-1191349.jpeg?auto=compress&cs=tinysrgb&w=200',
          prefill: {
            name: customerName,
            email: customerEmail,
            contact: customerPhone,
          },
          theme: { color: '#7c3a1d' },
          handler: async (response: any) => {
            try {
              const verifyRes = await fetch('/api/razorpay/verify-payment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature,
                  internalOrderId: orderId,
                }),
              });
              const verifyData = await verifyRes.json();
              if (!verifyRes.ok || !verifyData.verified) {
                throw new Error(verifyData.error || 'Signature verification failed');
              }
              resolve();
            } catch (err) {
              reject(err);
            }
          },
          modal: {
            ondismiss: () => reject(new Error('Payment cancelled')),
          },
        });
        rzp.on('payment.failed', (resp: any) => {
          reject(new Error(resp.error?.description || 'Payment failed'));
        });
        rzp.open();
      });

      toast.success('Payment successful! Order confirmed.');
      router.push(`/order-confirmation/${orderId}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Payment failed';
      if (message.includes('cancelled')) {
        toast.error('Payment was cancelled. You can try again anytime from this page.');
      } else {
        toast.error(message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button onClick={handlePay} disabled={loading} size="lg" className="w-full gap-2">
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {loading ? 'Opening payment...' : payLabel || 'Complete Payment'}
    </Button>
  );
}
