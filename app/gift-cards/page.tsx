'use client';

import { useState, useEffect, FormEvent } from 'react';
import { Gift, Loader2, CreditCard, CheckCircle2, Copy } from 'lucide-react';
import { formatINR } from '@/lib/format';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import {
  fetchGiftCardSettings,
  createPendingGiftCard,
  confirmGiftCardPurchase,
  DEFAULT_GIFT_CARD_SETTINGS,
  GiftCardSettings,
} from '@/lib/giftcards-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

declare global {
  interface Window {
    Razorpay: any;
  }
}

export default function GiftCardsPage() {
  const [settings, setSettings] = useState<GiftCardSettings>(DEFAULT_GIFT_CARD_SETTINGS);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState('');
  const [purchaserName, setPurchaserName] = useState('');
  const [purchaserEmail, setPurchaserEmail] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [message, setMessage] = useState('');
  const [selfGift, setSelfGift] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [issuedCode, setIssuedCode] = useState<string | null>(null);
  const [issuedAmount, setIssuedAmount] = useState(0);

  useEffect(() => {
    fetchGiftCardSettings().then(setSettings).finally(() => setLoadingSettings(false));
  }, []);

  useEffect(() => {
    const client = getSupabaseBrowser();
    client.auth.getUser().then(({ data }) => {
      if (data.user?.email) {
        setPurchaserEmail((prev) => prev || data.user!.email!);
      }
      const name = (data.user?.user_metadata as any)?.full_name;
      if (name) setPurchaserName((prev) => prev || name);
    });
  }, []);

  const amount = selectedAmount ?? (Number(customAmount) || 0);

  const openRazorpayCheckout = (
    razorpayOrderId: string,
    keyId: string,
    giftCardId: string
  ) => {
    return new Promise<void>((resolve, reject) => {
      const options = {
        key: keyId,
        order_id: razorpayOrderId,
        name: 'AruhiHandlooms',
        description: 'Gift Card Purchase',
        image: 'https://images.pexels.com/photos/1191349/pexels-photo-1191349.jpeg?auto=compress&cs=tinysrgb&w=200',
        prefill: {
          name: purchaserName,
          email: purchaserEmail,
        },
        theme: { color: '#7c3a1d' },
        handler: async (response: any) => {
          try {
            const result = await confirmGiftCardPurchase({
              giftCardId,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });
            setIssuedCode(result.code);
            setIssuedAmount(result.balance);
            resolve();
          } catch (err) {
            reject(err);
          }
        },
        modal: {
          ondismiss: () => reject(new Error('Payment cancelled')),
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', (resp: any) => {
        reject(new Error(resp.error?.description || 'Payment failed'));
      });
      rzp.open();
    });
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (amount < 1) {
      toast.error('Choose or enter a gift card amount');
      return;
    }
    if (!purchaserEmail) {
      toast.error('Enter your email address');
      return;
    }
    if (!selfGift && !recipientEmail) {
      toast.error("Enter the recipient's email address");
      return;
    }

    setPlacing(true);
    try {
      const { giftCardId } = await createPendingGiftCard({
        amount,
        purchaserName,
        purchaserEmail,
        recipientName: selfGift ? purchaserName : recipientName,
        recipientEmail: selfGift ? purchaserEmail : recipientEmail,
        message,
      });

      const createOrderRes = await fetch('/api/razorpay/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: amount * 100, internalOrderId: giftCardId }),
      });
      const createOrderData = await createOrderRes.json();
      if (!createOrderRes.ok) {
        throw new Error(createOrderData.error || 'Failed to create payment order');
      }

      await openRazorpayCheckout(createOrderData.order.id, createOrderData.keyId, giftCardId);

      toast.success('Gift card issued! Check your email for the code.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to purchase gift card';
      if (msg.includes('cancelled')) {
        toast.error('Payment was cancelled — no charge was made.');
      } else {
        toast.error(msg);
      }
    } finally {
      setPlacing(false);
    }
  };

  const copyCode = () => {
    if (!issuedCode) return;
    navigator.clipboard.writeText(issuedCode);
    toast.success('Code copied');
  };

  if (issuedCode) {
    return (
      <div className="container-boutique flex flex-col items-center gap-4 py-20 text-center">
        <CheckCircle2 className="h-12 w-12 text-secondary" />
        <h1 className="font-serif text-3xl font-bold text-primary">Gift card issued!</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          A gift card worth {formatINR(issuedAmount)} has been emailed to{' '}
          {selfGift ? 'you' : recipientEmail || 'the recipient'}. You can also use the code below directly at checkout.
        </p>
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-dashed border-primary/50 bg-muted/40 px-6 py-4">
          <span className="font-mono text-xl font-bold tracking-wider text-primary">{issuedCode}</span>
          <button
            type="button"
            onClick={copyCode}
            aria-label="Copy code"
            className="text-muted-foreground hover:text-primary"
          >
            <Copy className="h-4 w-4" />
          </button>
        </div>
        <Button
          className="mt-4 bg-primary"
          onClick={() => {
            setIssuedCode(null);
            setSelectedAmount(null);
            setCustomAmount('');
            setRecipientName('');
            setRecipientEmail('');
            setMessage('');
          }}
        >
          Buy another gift card
        </Button>
      </div>
    );
  }

  if (!loadingSettings && !settings.enabled) {
    return (
      <div className="container-boutique flex flex-col items-center gap-3 py-24 text-center">
        <Gift className="h-10 w-10 text-muted-foreground" />
        <h1 className="font-serif text-2xl font-bold text-primary">Gift cards aren&apos;t available right now</h1>
        <p className="text-sm text-muted-foreground">Please check back soon.</p>
      </div>
    );
  }

  return (
    <div className="container-boutique py-10">
      <div className="mx-auto max-w-xl text-center">
        <Gift className="mx-auto h-10 w-10 text-secondary" />
        <h1 className="mt-3 font-serif text-3xl font-bold text-primary sm:text-4xl">Gift Cards</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Send the gift of handwoven ethnic wear. Delivered instantly by email, redeemable at checkout.
        </p>
      </div>

      <form onSubmit={onSubmit} className="mx-auto mt-8 max-w-xl rounded-lg border border-border/60 bg-card p-6">
        <Label className="mb-2 block text-sm font-medium">Choose an amount</Label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {settings.denominations.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => {
                setSelectedAmount(d);
                setCustomAmount('');
              }}
              className={`rounded-md border px-3 py-3 text-sm font-semibold transition-colors ${
                selectedAmount === d
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border/60 hover:border-primary'
              }`}
            >
              {formatINR(d)}
            </button>
          ))}
        </div>
        <div className="mt-3">
          <Label htmlFor="custom-amount" className="text-xs text-muted-foreground">
            Or enter a custom amount
          </Label>
          <Input
            id="custom-amount"
            type="number"
            min={1}
            placeholder="e.g. 1500"
            value={customAmount}
            onChange={(e) => {
              setCustomAmount(e.target.value);
              setSelectedAmount(null);
            }}
            className="mt-1"
          />
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="purchaser-name">Your name</Label>
            <Input id="purchaser-name" value={purchaserName} onChange={(e) => setPurchaserName(e.target.value)} required />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="purchaser-email">Your email</Label>
            <Input
              id="purchaser-email"
              type="email"
              value={purchaserEmail}
              onChange={(e) => setPurchaserEmail(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <input
            id="self-gift"
            type="checkbox"
            checked={selfGift}
            onChange={(e) => setSelfGift(e.target.checked)}
            className="h-4 w-4"
          />
          <Label htmlFor="self-gift" className="cursor-pointer text-sm">
            This is for me
          </Label>
        </div>

        {!selfGift && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="recipient-name">Recipient&apos;s name</Label>
              <Input id="recipient-name" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="recipient-email">Recipient&apos;s email</Label>
              <Input
                id="recipient-email"
                type="email"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                required={!selfGift}
              />
            </div>
          </div>
        )}

        <div className="mt-4 grid gap-1.5">
          <Label htmlFor="gift-message">Personal message (optional)</Label>
          <Textarea
            id="gift-message"
            rows={3}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Happy Birthday! Enjoy something beautiful."
          />
        </div>

        <Button type="submit" size="lg" disabled={placing || amount < 1} className="mt-6 w-full bg-primary">
          {placing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <CreditCard className="mr-2 h-4 w-4" />
              Pay {amount > 0 ? formatINR(amount) : ''}
            </>
          )}
        </Button>
        <p className="mt-3 text-center text-[11px] text-muted-foreground">
          {settings.expiry_months
            ? `Valid for ${settings.expiry_months} months from the date of purchase.`
            : 'Delivered by email within minutes of payment.'}
        </p>
      </form>
    </div>
  );
}
