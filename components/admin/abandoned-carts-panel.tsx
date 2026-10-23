'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { useAdminFocus } from './use-admin-focus';
import {
  Loader2,
  ShoppingCart,
  Mail,
  MessageCircle,
  CheckCircle2,
  Search,
  X,
  ChevronDown,
  ChevronRight,
  MailOpen,
  MousePointerClick,
  Settings2,
  Save,
} from 'lucide-react';
import { formatINR } from '@/lib/format';
import { toPublicMediaUrl } from '@/lib/media-url';
import { computeDiscountedPrice } from '@/lib/cart-recovery-settings';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

type AbandonedCart = {
  id: string;
  email: string | null;
  phone: string | null;
  items: any[];
  cart_value: number;
  last_activity_at: string;
  recovery_email_sent: boolean;
  recovery_email_sent_at?: string | null;
  recovery_stage?: number;
  recovered: boolean;
  // Set server-side (see the GET route) when an order already exists for
  // this cart's email or phone, even though `recovered` itself is still
  // false — catches cases the automatic matching misses, e.g. the order
  // was placed with a different email but the same phone number.
  existing_order?: { id: string; status: string; created_at: string } | null;
  // Set server-side when this person has one or more EARLIER orders that
  // clearly predate this cart (a repeat customer abandoning a cart for a
  // different item) — informational only, doesn't affect the buttons.
  prior_order_count?: number;
  prior_order_last_item?: string | null;
};

type CartEmailLogEntry = {
  id: string;
  sequence_number: number;
  subject: string;
  coupon_code: string | null;
  sent_at: string;
  opened_at: string | null;
  open_count: number;
  clicked_at: string | null;
  click_count: number;
  converted: boolean;
  converted_at: string | null;
};

type SequenceStep = {
  enabled: boolean;
  delay_hours: number;
  subject: string;
  html: string;
  coupon_code: string;
  // Optional — leave discount_value at 0 to just quote the coupon code
  // with generic wording (as before). Above 0, the email also shows the
  // exact rupee amount the customer will pay after the discount.
  discount_type: 'percentage' | 'flat';
  discount_value: number;
};

// Discount + timing for the later-stage "urgency" WhatsApp nudge (see
// buildUrgencyWhatsAppLink below). Saved/loaded together with the email
// sequence settings via /api/admin/cart-recovery-settings.
type UrgencyWhatsappSettings = {
  enabled: boolean;
  delay_hours: number;
  discount_type: 'percentage' | 'flat';
  discount_value: number;
  coupon_code: string;
};

type SequenceSettings = {
  enabled: boolean;
  steps: SequenceStep[];
  urgency_whatsapp: UrgencyWhatsappSettings;
};

const DEFAULT_URGENCY_WHATSAPP_SETTINGS: UrgencyWhatsappSettings = {
  enabled: true,
  delay_hours: 72,
  discount_type: 'percentage',
  discount_value: 5,
  coupon_code: '',
};

const DEFAULT_SEQUENCE_SETTINGS: SequenceSettings = {
  enabled: true,
  steps: [
    { enabled: true, delay_hours: 1, subject: '', html: '', coupon_code: '', discount_type: 'percentage', discount_value: 0 },
    { enabled: true, delay_hours: 24, subject: '', html: '', coupon_code: '', discount_type: 'percentage', discount_value: 0 },
    { enabled: true, delay_hours: 72, subject: '', html: '', coupon_code: '', discount_type: 'percentage', discount_value: 0 },
  ],
  urgency_whatsapp: DEFAULT_URGENCY_WHATSAPP_SETTINGS,
};

// How many hours have passed since the cart's last activity — used to
// decide whether the "urgency" WhatsApp button should appear yet.
function hoursSince(dateStr: string): number {
  return (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60);
}

const STEP_LABELS = ['1st email', '2nd email', '3rd email'];

// One line per cart item: name, size, colour, quantity — used both in the
// on-screen preview and in the WhatsApp message text below.
function describeItem(it: any): string {
  const name = it?.product_name || it?.name || 'Item';
  const size = it?.size ? `, Size: ${it.size}` : '';
  const color = it?.color ? `, Color: ${it.color}` : '';
  const qty = it?.quantity && it.quantity > 1 ? ` x${it.quantity}` : '';
  return `${name}${size}${color}${qty}`;
}

// Builds a free wa.me click-to-chat link — no WhatsApp Business API / BSP
// involved, so no per-message Meta billing. Opening it starts a chat from
// whichever WhatsApp (Web or app) the admin is logged into, with the
// recovery message already typed in; the admin just taps Send. Returns
// null if the stored phone number doesn't look like a valid 10-digit
// Indian mobile number, so the button can hide itself instead of building
// a broken link.
//
// wa.me can't attach a photo by itself (no file upload in a URL), so two
// things stand in for "send the image too":
//   1. The admin panel shows the item's thumbnail right next to this
//      button (see CartItemsPreview) so the admin can see/forward it.
//   2. The message links to /cart-link/<cart id>, whose OG tags carry the
//      cart's first item photo (JPEG via /api/og/cart/<cart id>), so
//      WhatsApp's link-preview card shows the exact product the customer
//      left behind, then the page forwards them on to /cart.
// The message also proactively answers the three questions shoppers most
// often hesitate on: how to order, what happens after, and how safe it is.
// ?offer=CODE makes /cart-link/<id> -> /cart add the code as an extra discount on arrival.
function couponQuery(code?: string | null): string {
  const c = (code || '').trim();
  return c ? `?offer=${encodeURIComponent(c)}` : '';
}

function buildWhatsAppRecoveryLink(
  cartId: string,
  phone: string,
  cartValue: number,
  items: any[] = [],
  couponCode?: string | null
): string | null {
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('91') && digits.length === 12) digits = digits.slice(2);
  if (digits.startsWith('0') && digits.length === 11) digits = digits.slice(1);
  if (!/^[6-9][0-9]{9}$/.test(digits)) return null;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.aruhihandlooms.com';

  const itemLines = (items || []).slice(0, 5).map((it) => `• ${describeItem(it)}`).join('\n');

  const messageParts = [
    `Hello, this is AruhiHandlooms.`,
    `We noticed you left ${items?.length > 1 ? 'the following items' : 'the following item'} in your cart${
      cartValue ? ` (total value ${formatINR(cartValue)})` : ''
    }:`,
    itemLines || null,
    couponCode
      ? `As a small thank-you for your interest, we have kept a special offer for you: *${couponCode}*. It is added automatically when you open the link below, on top of any coupon already in your cart.`
      : null,
    `You can complete your order here: ${siteUrl}/cart-link/${cartId}${couponQuery(couponCode)}`,
    `A few quick details, in case they're useful:\n` +
      `*Placing the order:* Open the link above, confirm your address and payment method (Cash on Delivery is available), and you're done — it takes under two minutes.\n` +
      `*After you order:* We pack and dispatch within 2-3 business days, and share a live tracking link by WhatsApp, SMS, and email. Delivery typically takes 3-8 business days.\n` +
      `*Safety and returns:* Checkout is fully secure, we offer an easy 7-day return/exchange window, and a free replacement or full refund if anything arrives damaged, defective, or incorrect.`,
    `Please feel free to reply to this message if you have any questions — we're happy to help.`,
  ].filter(Boolean);

  const message = messageParts.join('\n\n');

  return `https://wa.me/91${digits}?text=${encodeURIComponent(message)}`;
}

// Later-stage nudge for carts that are still unrecovered after
// `settings.delay_hours` (3 days by default). Kept deliberately warmer and
// more apologetic in tone than the first message, and adds a genuine,
// admin-configured discount (percentage or flat rupees) plus a short
// validity window to create real urgency without sounding pushy.
function buildUrgencyWhatsAppLink(
  cartId: string,
  phone: string,
  cartValue: number,
  items: any[] = [],
  settings: UrgencyWhatsappSettings
): string | null {
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('91') && digits.length === 12) digits = digits.slice(2);
  if (digits.startsWith('0') && digits.length === 11) digits = digits.slice(1);
  if (!/^[6-9][0-9]{9}$/.test(digits)) return null;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.aruhihandlooms.com';
  const itemLines = (items || []).slice(0, 5).map((it) => `• ${describeItem(it)}`).join('\n');

  const finalPrice = computeDiscountedPrice(cartValue, settings.discount_type, settings.discount_value);
  const discountText =
    settings.discount_type === 'percentage'
      ? `an extra ${settings.discount_value}% off`
      : `an extra ${formatINR(settings.discount_value)} off`;
  // Showing the exact rupee amount (not just "5% off") is what actually
  // drives clicks — a customer can act on "pay ₹2,893" immediately,
  // without doing the maths themselves first.
  const priceLine =
    cartValue && settings.discount_value > 0
      ? ` That brings your total down to just *${formatINR(finalPrice)}* (instead of ${formatINR(cartValue)}).`
      : '';
  const couponLine = settings.coupon_code
    ? `Your special code *${settings.coupon_code}* is added automatically when you open the link below, on top of any coupon you have already applied.${priceLine}`
    : `Just reply to this message and we'll apply it for you.${priceLine}`;

  const messageParts = [
    `Hello again, this is AruhiHandlooms 🙏`,
    `We hope you're doing well! We noticed ${items?.length > 1 ? 'these items are' : 'this item is'} still waiting in your cart${
      cartValue ? ` (total value ${formatINR(cartValue)})` : ''
    }, so we wanted to check in gently:`,
    itemLines || null,
    `As a small thank-you for considering us, we'd love to offer you ${discountText} on this order. ${couponLine}`,
    `This little offer is valid for a short time only, so we didn't want you to miss it. You can complete your order here whenever it's convenient: ${siteUrl}/cart-link/${cartId}${couponQuery(settings.coupon_code)}`,
    `No pressure at all — we're just happy to help if you have any questions. Thank you for shopping with us! 🌸`,
  ].filter(Boolean);

  const message = messageParts.join('\n\n');
  return `https://wa.me/91${digits}?text=${encodeURIComponent(message)}`;
}

// Small thumbnail strip shown in the Items column so the admin can see at
// a glance what's sitting in each abandoned cart (and its colour) without
// opening anything.
function CartItemsPreview({ items }: { items: any[] }) {
  const list = items || [];
  if (list.length === 0) return <span>0 items</span>;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        {list.slice(0, 3).map((it, idx) => {
          const img = toPublicMediaUrl(it?.image_url || it?.image || it?.images?.[0] || null);
          return img ? (
            <img
              key={idx}
              src={img}
              alt={it?.product_name || it?.name || 'Item'}
              className="h-10 w-10 rounded-md border border-border/60 object-cover"
            />
          ) : (
            <div
              key={idx}
              className="flex h-10 w-10 items-center justify-center rounded-md border border-dashed border-border/60 text-[9px] text-muted-foreground"
            >
              No img
            </div>
          );
        })}
        {list.length > 3 && (
          <span className="text-xs text-muted-foreground">+{list.length - 3}</span>
        )}
      </div>
      <div className="text-xs text-muted-foreground">
        {list.length} item{list.length === 1 ? '' : 's'}
        {list[0]?.color ? ` · ${list[0].color}` : ''}
      </div>
    </div>
  );
}

function EmailStatusBadges({ e }: { e: CartEmailLogEntry }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge variant="outline" className="gap-1 text-emerald-700 border-emerald-200 bg-emerald-50">
        <Mail className="h-3 w-3" /> Sent
      </Badge>
      {e.opened_at ? (
        <Badge variant="outline" className="gap-1 text-blue-700 border-blue-200 bg-blue-50">
          <MailOpen className="h-3 w-3" /> Opened{e.open_count > 1 ? ` ×${e.open_count}` : ''}
        </Badge>
      ) : (
        <Badge variant="outline" className="text-muted-foreground">
          Not opened
        </Badge>
      )}
      {e.clicked_at && (
        <Badge variant="outline" className="gap-1 text-purple-700 border-purple-200 bg-purple-50">
          <MousePointerClick className="h-3 w-3" /> Clicked{e.click_count > 1 ? ` ×${e.click_count}` : ''}
        </Badge>
      )}
      {e.converted && (
        <Badge className="gap-1 bg-emerald-600 hover:bg-emerald-600">
          <CheckCircle2 className="h-3 w-3" /> Converted
        </Badge>
      )}
    </div>
  );
}

function CartEmailHistory({ cartId }: { cartId: string }) {
  const [emails, setEmails] = useState<CartEmailLogEntry[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/abandoned-carts/${cartId}/emails`);
        const body = await res.json().catch(() => ({}));
        if (!cancelled) setEmails(res.ok ? body.emails || [] : []);
      } catch {
        if (!cancelled) setEmails([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cartId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading email history…
      </div>
    );
  }

  if (!emails || emails.length === 0) {
    return <p className="py-3 text-sm text-muted-foreground">No recovery emails sent for this cart yet.</p>;
  }

  return (
    <ul className="space-y-2 py-3">
      {emails.map((e) => (
        <li key={e.id} className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="font-medium">{STEP_LABELS[e.sequence_number - 1] || `Email ${e.sequence_number}`}</span>
              <span className="ml-2 text-xs text-muted-foreground">
                {new Date(e.sent_at).toLocaleString('en-IN')}
              </span>
            </div>
            <EmailStatusBadges e={e} />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{e.subject}</p>
          {e.coupon_code && (
            <p className="mt-1 text-xs">
              Coupon: <span className="font-mono font-medium">{e.coupon_code}</span>
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

function SendCustomEmailDialog({
  cart,
  open,
  onOpenChange,
  onSent,
}: {
  cart: AbandonedCart | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSent: () => void;
}) {
  const [subject, setSubject] = useState('');
  const [html, setHtml] = useState('');
  const [couponCode, setCouponCode] = useState('');
  const [discountType, setDiscountType] = useState<'percentage' | 'flat'>('percentage');
  const [discountValue, setDiscountValue] = useState(0);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (open) {
      setSubject('');
      setHtml('');
      setCouponCode('');
      setDiscountType('percentage');
      setDiscountValue(0);
    }
  }, [open, cart?.id]);

  if (!cart) return null;
  const nextStage = (cart.recovery_stage || 0) + 1;

  const send = async () => {
    setSending(true);
    try {
      const res = await fetch(`/api/admin/abandoned-carts/${cart.id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: subject.trim() || undefined,
          html: html.trim() || undefined,
          coupon_code: couponCode.trim() || undefined,
          discount_type: couponCode.trim() ? discountType : undefined,
          discount_value: couponCode.trim() ? discountValue : undefined,
        }),
      });
      if (res.ok) {
        toast.success('Recovery email sent');
        onOpenChange(false);
        onSent();
      } else {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error || 'Failed to send email');
      }
    } catch {
      toast.error('Failed to send email');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Send {STEP_LABELS[nextStage - 1] || `email ${nextStage}`} to {cart.email}</DialogTitle>
          <DialogDescription>
            Leave subject/message blank to use the default template for this step. This counts as this
            cart's next recovery email in the sequence.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Coupon code (optional)</Label>
            <Input
              value={couponCode}
              onChange={(e) => setCouponCode(e.target.value)}
              placeholder="e.g. SAVE10"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Create this code under Admin &gt; Coupons first so it actually works at checkout.
            </p>
          </div>
          {couponCode.trim() && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Discount type</Label>
                <Select value={discountType} onValueChange={(v) => setDiscountType(v as 'percentage' | 'flat')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Percentage (%)</SelectItem>
                    <SelectItem value="flat">Flat amount (₹)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{discountType === 'percentage' ? 'Discount (%)' : 'Discount (₹)'}</Label>
                <Input
                  type="number"
                  min={0}
                  value={discountValue}
                  onChange={(e) => setDiscountValue(Number(e.target.value))}
                  placeholder="0 = just quote the code"
                />
              </div>
            </div>
          )}
          <div>
            <Label>Custom subject (optional)</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Leave blank for the default subject"
            />
          </div>
          <div>
            <Label>Custom message HTML (optional)</Label>
            <Textarea
              value={html}
              onChange={(e) => setHtml(e.target.value)}
              rows={8}
              placeholder={`Leave blank for the default template. You can use:\n{{items_table}}  {{cart_total}}  {{cart_url}}  {{coupon_code}}  {{coupon_line}}`}
              className="font-mono text-xs"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Merge fields: <code>{'{{items_table}}'}</code> <code>{'{{cart_total}}'}</code>{' '}
              <code>{'{{cart_url}}'}</code> <code>{'{{coupon_code}}'}</code> <code>{'{{coupon_line}}'}</code>
            </p>
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button onClick={send} disabled={sending}>
            {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SequenceSettingsPanel() {
  const [settings, setSettings] = useState<SequenceSettings>(DEFAULT_SEQUENCE_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/cart-recovery-settings');
        if (res.ok) {
          const body = await res.json();
          setSettings(body.settings || DEFAULT_SEQUENCE_SETTINGS);
        }
      } catch {
        toast.error('Failed to load sequence settings');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const updateStep = (index: number, patch: Partial<SequenceStep>) => {
    setSettings((s) => ({
      ...s,
      steps: s.steps.map((step, i) => (i === index ? { ...step, ...patch } : step)) as SequenceStep[],
    }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/cart-recovery-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings }),
      });
      if (res.ok) {
        toast.success('Sequence settings saved');
      } else {
        toast.error('Failed to save settings');
      }
    } catch {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <Settings2 className="h-5 w-5" /> Cart Recovery Sequence
            </span>
            <Switch
              checked={settings.enabled}
              onCheckedChange={(v) => setSettings((s) => ({ ...s, enabled: v }))}
            />
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Runs once a day via the scheduled job. Turn this off to pause automatic sends entirely
            (manual "Send" from the Carts tab still works). Requires an email provider configured
            under Admin &gt; Settings &gt; Email Notifications.
          </p>
        </CardHeader>
      </Card>

      {settings.steps.map((step, i) => (
        <Card key={i}>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2 text-base">
              <span>{STEP_LABELS[i]}</span>
              <Switch checked={step.enabled} onCheckedChange={(v) => updateStep(i, { enabled: v })} />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>
                  Send {i === 0 ? 'after cart is abandoned for' : 'this many hours after the previous email'}
                </Label>
                <Input
                  type="number"
                  min={1}
                  value={step.delay_hours}
                  onChange={(e) => updateStep(i, { delay_hours: Number(e.target.value) })}
                />
                <p className="mt-1 text-xs text-muted-foreground">Hours</p>
              </div>
              <div>
                <Label>Coupon code (optional)</Label>
                <Input
                  value={step.coupon_code}
                  onChange={(e) => updateStep(i, { coupon_code: e.target.value })}
                  placeholder="e.g. COMEBACK10"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Create it under Admin &gt; Coupons too.
                </p>
              </div>
            </div>
            {step.coupon_code.trim() && (
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <Label>Discount type</Label>
                  <Select
                    value={step.discount_type}
                    onValueChange={(v) => updateStep(i, { discount_type: v as 'percentage' | 'flat' })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentage">Percentage (%)</SelectItem>
                      <SelectItem value="flat">Flat amount (₹)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{step.discount_type === 'percentage' ? 'Discount (%)' : 'Discount (₹)'}</Label>
                  <Input
                    type="number"
                    min={0}
                    value={step.discount_value}
                    onChange={(e) => updateStep(i, { discount_value: Number(e.target.value) })}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    0 = just quote the code, no price shown
                  </p>
                </div>
                {step.discount_value > 0 && (
                  <div className="flex items-end">
                    <p className="text-xs text-muted-foreground">
                      Email will show, e.g. cart {formatINR(2000)} → pay{' '}
                      <span className="font-medium text-foreground">
                        {formatINR(computeDiscountedPrice(2000, step.discount_type, step.discount_value))}
                      </span>
                    </p>
                  </div>
                )}
              </div>
            )}
            <div>
              <Label>Custom subject (optional)</Label>
              <Input
                value={step.subject}
                onChange={(e) => updateStep(i, { subject: e.target.value })}
                placeholder="Leave blank for the default subject"
              />
            </div>
            <div>
              <Label>Custom message HTML (optional)</Label>
              <Textarea
                value={step.html}
                onChange={(e) => updateStep(i, { html: e.target.value })}
                rows={6}
                placeholder={`Leave blank for the default template. You can use:\n{{items_table}}  {{cart_total}}  {{cart_url}}  {{coupon_code}}  {{coupon_line}}`}
                className="font-mono text-xs"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Merge fields: <code>{'{{items_table}}'}</code> <code>{'{{cart_total}}'}</code>{' '}
                <code>{'{{cart_url}}'}</code> <code>{'{{coupon_code}}'}</code> <code>{'{{coupon_line}}'}</code>
              </p>
            </div>
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2 text-base">
            <span className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5" /> 3-Day Urgency WhatsApp Reminder
            </span>
            <Switch
              checked={settings.urgency_whatsapp.enabled}
              onCheckedChange={(v) =>
                setSettings((s) => ({ ...s, urgency_whatsapp: { ...s.urgency_whatsapp, enabled: v } }))
              }
            />
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Once a cart has had no order for this many hours, an extra, more polite "Send WhatsApp"
            button appears in the Carts tab that mentions this discount and a short validity window
            to encourage a quick purchase. You still send it manually, one tap at a time — nothing is
            sent automatically.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label>Show button after (hours)</Label>
              <Input
                type="number"
                min={1}
                value={settings.urgency_whatsapp.delay_hours}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    urgency_whatsapp: { ...s.urgency_whatsapp, delay_hours: Number(e.target.value) },
                  }))
                }
              />
              <p className="mt-1 text-xs text-muted-foreground">72 = 3 days of no order</p>
            </div>
            <div>
              <Label>Discount type</Label>
              <Select
                value={settings.urgency_whatsapp.discount_type}
                onValueChange={(v) =>
                  setSettings((s) => ({
                    ...s,
                    urgency_whatsapp: { ...s.urgency_whatsapp, discount_type: v as 'percentage' | 'flat' },
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">Percentage (%)</SelectItem>
                  <SelectItem value="flat">Flat amount (₹)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{settings.urgency_whatsapp.discount_type === 'percentage' ? 'Discount (%)' : 'Discount (₹)'}</Label>
              <Input
                type="number"
                min={0}
                value={settings.urgency_whatsapp.discount_value}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    urgency_whatsapp: { ...s.urgency_whatsapp, discount_value: Number(e.target.value) },
                  }))
                }
              />
            </div>
          </div>
          <div>
            <Label>Coupon code (optional)</Label>
            <Input
              value={settings.urgency_whatsapp.coupon_code}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  urgency_whatsapp: { ...s.urgency_whatsapp, coupon_code: e.target.value },
                }))
              }
              placeholder="e.g. COMEBACK5"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Create this code under Admin &gt; Coupons too, matching this discount, so it actually
              applies at checkout. Leave blank to instead ask the customer to reply and have the
              discount applied manually.
            </p>
          </div>
        </CardContent>
      </Card>

      <Button onClick={save} disabled={saving}>
        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
        {saving ? 'Saving…' : 'Save sequence settings'}
      </Button>
    </div>
  );
}

function CartsList() {
  const [carts, setCarts] = useState<AbandonedCart[]>([]);
  const [loading, setLoading] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'recovered' | 'sent' | 'not_contacted'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Bell deep link: clear filters so the clicked cart is visible, highlight it.
  const focusId = useAdminFocus(!loading && carts.length > 0);
  useEffect(() => {
    if (!focusId) return;
    setStatusFilter('all');
    setSearchQuery('');
  }, [focusId]);
  const [customizeCart, setCustomizeCart] = useState<AbandonedCart | null>(null);
  // Carts where the admin has explicitly chosen to contact anyway, even
  // though we detected they already have an order — see existing_order.
  const [forceContactIds, setForceContactIds] = useState<Set<string>>(new Set());
  // Delay/discount for the 3-day urgency WhatsApp button — loaded once so
  // the button can appear/disappear and word itself per the admin's saved
  // settings (see the "3-Day Urgency WhatsApp Reminder" card above).
  const [urgencySettings, setUrgencySettings] = useState<UrgencyWhatsappSettings>(
    DEFAULT_URGENCY_WHATSAPP_SETTINGS
  );

  // Coupon code (first step of the email sequence that has one) that the plain
  // "Send WhatsApp" message carries in its link so it auto-applies on click.
  const [whatsappCoupon, setWhatsappCoupon] = useState<string>('');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/cart-recovery-settings');
        if (res.ok) {
          const body = await res.json();
          if (body.settings?.urgency_whatsapp) setUrgencySettings(body.settings.urgency_whatsapp);
          const firstCoupon = (body.settings?.steps || []).find((st: any) => st?.coupon_code?.trim())?.coupon_code;
          if (firstCoupon) setWhatsappCoupon(String(firstCoupon).trim());
        }
      } catch {
        // Non-fatal — the extra button just won't appear until this loads.
      }
    })();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/abandoned-carts');
      if (res.ok) {
        const body = await res.json();
        setCarts(body.carts || []);
      } else {
        toast.error('Failed to load abandoned carts');
      }
    } catch {
      toast.error('Failed to load abandoned carts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const sendNow = async (id: string) => {
    setSendingId(id);
    try {
      const res = await fetch(`/api/admin/abandoned-carts/${id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        toast.success('Recovery email sent');
        await load();
      } else {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error || 'Failed to send email');
      }
    } catch {
      toast.error('Failed to send email');
    } finally {
      setSendingId(null);
    }
  };

  const activeCount = carts.filter((c) => !c.recovered).length;
  const recoveredCount = carts.filter((c) => c.recovered).length;
  const potentialValue = carts.filter((c) => !c.recovered).reduce((s, c) => s + (c.cart_value || 0), 0);

  const filteredCarts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return carts.filter((c) => {
      const matchesQuery = !q || (c.email ?? '').toLowerCase().includes(q);
      const matchesStatus =
        statusFilter === 'all'
          ? true
          : statusFilter === 'recovered'
          ? c.recovered
          : statusFilter === 'sent'
          ? !c.recovered && c.recovery_email_sent
          : !c.recovered && !c.recovery_email_sent;
      return matchesQuery && matchesStatus;
    });
  }, [carts, searchQuery, statusFilter]);

  return (
    <div className="grid gap-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-border/60 bg-card p-4">
          <p className="text-xs text-muted-foreground">Active Abandoned Carts</p>
          <p className="mt-2 text-2xl font-semibold">{activeCount}</p>
        </div>
        <div className="rounded-lg border border-border/60 bg-card p-4">
          <p className="text-xs text-muted-foreground">Recovered</p>
          <p className="mt-2 text-2xl font-semibold">{recoveredCount}</p>
        </div>
        <div className="rounded-lg border border-border/60 bg-card p-4">
          <p className="text-xs text-muted-foreground">Potential Value</p>
          <p className="mt-2 text-2xl font-semibold">{formatINR(potentialValue)}</p>
        </div>
      </div>

      {!loading && carts.length > 0 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by email…"
              className="pl-9 pr-8"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
              <SelectTrigger className="w-[170px]">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="recovered">Recovered</SelectItem>
                <SelectItem value="sent">Email Sent</SelectItem>
                <SelectItem value="not_contacted">Not Contacted</SelectItem>
              </SelectContent>
            </Select>
            {(searchQuery || statusFilter !== 'all') && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('all');
                }}
              >
                Reset
              </Button>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading...
        </div>
      ) : carts.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-center text-muted-foreground">
          <ShoppingCart className="h-10 w-10" />
          <p>No abandoned carts yet.</p>
          <p className="text-sm">
            Carts show up here once a shopper enters their email at checkout but doesn't complete the order.
          </p>
        </div>
      ) : filteredCarts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/60 bg-card px-4 py-12 text-center text-sm text-muted-foreground">
          No abandoned carts match your search or filter.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border/60 bg-card">
          <table className="w-full table-auto">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3"></th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Items</th>
                <th className="px-4 py-3">Value</th>
                <th className="px-4 py-3">Last Activity</th>
                <th className="px-4 py-3">Recovery</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredCarts.map((c) => {
                const stage = c.recovery_stage || 0;
                const isExpanded = expandedId === c.id;
                return (
                  <Fragment key={c.id}>
                    <tr data-focus-id={c.id} className="border-t">
                      <td className="px-2 py-3 align-top">
                        {stage > 0 && (
                          <button
                            type="button"
                            onClick={() => setExpandedId(isExpanded ? null : c.id)}
                            className="text-muted-foreground hover:text-foreground"
                            aria-label="Toggle email history"
                          >
                            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top text-sm">
                        <div>{c.email || '—'}</div>
                        {c.phone && <div className="text-xs text-muted-foreground">{c.phone}</div>}
                        {!!c.prior_order_count && (
                          <span
                            className="mt-1 inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700 ring-1 ring-violet-200"
                            title={
                              c.prior_order_last_item
                                ? `Most recent earlier order: ${c.prior_order_last_item}`
                                : undefined
                            }
                          >
                            Repeat customer · {c.prior_order_count + 1}
                            {c.prior_order_count + 1 === 2 ? 'nd' : c.prior_order_count + 1 === 3 ? 'rd' : 'th'} order
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top text-sm text-muted-foreground">
                        <CartItemsPreview items={c.items} />
                      </td>
                      <td className="px-4 py-3 align-top text-sm font-medium">{formatINR(c.cart_value || 0)}</td>
                      <td className="px-4 py-3 align-top text-sm">
                        {new Date(c.last_activity_at).toLocaleString('en-IN')}
                      </td>
                      <td className="px-4 py-3 align-top text-sm">
                        <div className="flex flex-col items-start gap-1.5">
                          {c.recovered ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                              <CheckCircle2 className="h-3 w-3" /> Recovered
                            </span>
                          ) : stage > 0 ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                              <Mail className="h-3 w-3" /> {stage}/3 emails sent
                            </span>
                          ) : (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                              Not contacted
                            </span>
                          )}
                          {!c.recovered && c.existing_order && (
                            <span
                              className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200"
                              title={`Order ${c.existing_order.id.slice(0, 8)} · ${c.existing_order.status} · ${new Date(
                                c.existing_order.created_at
                              ).toLocaleString('en-IN')}`}
                            >
                              <CheckCircle2 className="h-3 w-3" /> Already ordered
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top text-sm">
                        {!c.recovered && c.existing_order && !forceContactIds.has(c.id) ? (
                          <div className="max-w-[220px] text-xs text-muted-foreground">
                            <p>
                              Looks like they already placed order{' '}
                              <span className="font-mono">#{c.existing_order.id.slice(0, 8)}</span> on{' '}
                              {new Date(c.existing_order.created_at).toLocaleDateString('en-IN')}. Recovery outreach is
                              probably not needed.
                            </p>
                            <button
                              type="button"
                              className="mt-1 underline hover:text-foreground"
                              onClick={() =>
                                setForceContactIds((prev) => {
                                  const next = new Set(prev);
                                  next.add(c.id);
                                  return next;
                                })
                              }
                            >
                              Contact anyway
                            </button>
                          </div>
                        ) : (
                        <div className="flex flex-wrap gap-2">
                          {!c.recovered && c.email && stage < 3 && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={sendingId === c.id}
                                onClick={() => sendNow(c.id)}
                              >
                                {sendingId === c.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : stage === 0 ? (
                                  'Send recovery email'
                                ) : (
                                  `Send email ${stage + 1}`
                                )}
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setCustomizeCart(c)}>
                                Customize &amp; send
                              </Button>
                            </>
                          )}
                          {!c.recovered &&
                            c.phone &&
                            (() => {
                              const link = buildWhatsAppRecoveryLink(c.id, c.phone, c.cart_value, c.items, whatsappCoupon);
                              if (!link) return null;
                              return (
                                <Button size="sm" variant="outline" asChild>
                                  <a href={link} target="_blank" rel="noopener noreferrer">
                                    <MessageCircle className="mr-1.5 h-3.5 w-3.5" />
                                    Send WhatsApp
                                  </a>
                                </Button>
                              );
                            })()}
                          {!c.recovered &&
                            c.phone &&
                            urgencySettings.enabled &&
                            hoursSince(c.last_activity_at) >= urgencySettings.delay_hours &&
                            (() => {
                              const link = buildUrgencyWhatsAppLink(c.id, c.phone, c.cart_value, c.items, urgencySettings);
                              if (!link) return null;
                              const discountLabel =
                                urgencySettings.discount_type === 'percentage'
                                  ? `${urgencySettings.discount_value}% off`
                                  : `${formatINR(urgencySettings.discount_value)} off`;
                              return (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="border-amber-300 text-amber-800 hover:bg-amber-50"
                                  asChild
                                >
                                  <a href={link} target="_blank" rel="noopener noreferrer">
                                    <MessageCircle className="mr-1.5 h-3.5 w-3.5" />
                                    Send WhatsApp ({discountLabel})
                                  </a>
                                </Button>
                              );
                            })()}
                        </div>
                        )}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="border-t bg-muted/10">
                        <td></td>
                        <td colSpan={6} className="px-4">
                          <CartEmailHistory cartId={c.id} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <SendCustomEmailDialog
        cart={customizeCart}
        open={!!customizeCart}
        onOpenChange={(v) => !v && setCustomizeCart(null)}
        onSent={load}
      />
    </div>
  );
}

export default function AbandonedCartsPanel() {
  return (
    <Tabs defaultValue="carts" className="w-full">
      <TabsList>
        <TabsTrigger value="carts">Carts</TabsTrigger>
        <TabsTrigger value="settings">Sequence Settings</TabsTrigger>
      </TabsList>
      <TabsContent value="carts" className="mt-4">
        <CartsList />
      </TabsContent>
      <TabsContent value="settings" className="mt-4">
        <SequenceSettingsPanel />
      </TabsContent>
    </Tabs>
  );
}
