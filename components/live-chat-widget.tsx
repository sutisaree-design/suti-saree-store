'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  X,
  ChevronRight,
  ArrowLeft,
  Send,
  Sparkles,
  PackageSearch,
  Mail,
  LifeBuoy,
  ClipboardCheck,
  Paperclip,
  Loader2,
} from 'lucide-react';
import WhatsAppIcon from '@/components/icons/whatsapp-icon';
import {
  fetchMarketingSettings,
  fetchLegalPagesResolved,
  fetchFulfillmentSettings,
  dispatchWindowText,
  returnWindowText,
  MarketingSettings,
  LegalPages,
  FulfillmentSettings,
  DEFAULT_FULFILLMENT_SETTINGS,
} from '@/lib/marketing-api';

// ---------------------------------------------------------------------
// On-site live chat widget.
//
// Purpose: answer the pre-purchase doubts that stop someone from buying
// a lehenga/saree (fit, fabric, delivery time, COD, returns) instantly,
// in-page, instead of making them leave to WhatsApp for every question.
//
// Layers:
// 1. Quick-topic buttons — instant, scripted answers, always available,
//    zero dependency on any external service.
// 2. "Track my order" — a real, deterministic lookup (app/api/chat/
//    order-lookup) that reads live order + Delhivery courier data.
//    Logged-in shoppers get their own orders automatically; guests are
//    asked for their Order ID + checkout email first. Once an order is
//    found, the shopper can email themselves the details or raise a
//    support ticket straight from the chat — both hit real backend
//    routes and show up in Admin > Support Tickets.
// 2b. "Check my ticket" — a matching lookup (app/api/chat/ticket-status)
//     for tickets already raised (via this widget or otherwise), so a
//     shopper can come back and read the admin's reply right here
//     instead of only getting it by email (see Admin > Support Tickets
//     > "Reply to customer").
// 3. Free-text box — routes to a live AI model (app/api/chat/ai/route.ts,
//    NVIDIA's free NIM API, model configurable from Admin > Settings >
//    AI Chat Assistant). For logged-in shoppers it's quietly primed with
//    their own order history. If the AI call fails or times out AND the
//    question looks order/tracking related, the widget automatically
//    falls back to the same real order-lookup as (2) instead of just
//    showing an error — so "where's my order" always gets a real
//    answer, AI or not. Otherwise it falls back to "Continue on
//    WhatsApp" so a real person can pick it up.
// ---------------------------------------------------------------------

type Sender = 'bot' | 'user';

// A product the admin suggested in a ticket reply, or that we're about to
// show back to the shopper — snapshot shape, mirrors
// support_tickets.suggested_product in the DB.
interface ProductCard {
  id: string;
  name: string;
  slug?: string | null;
  image?: string | null;
  price?: number | null;
}

interface ChatMessage {
  id: string;
  sender: Sender;
  text: string;
  isError?: boolean;
  // Attached to the "you also have N more orders" message so the shopper
  // can tap an order instead of having to type its ID.
  orderChips?: { id: string; shortId: string }[];
  // A photo the shopper attached (their own message) or the admin
  // attached to a reply (surfaced via "Check my ticket").
  imageUrl?: string | null;
  // A product the admin recommended in their reply.
  productCard?: ProductCard | null;
}

interface Topic {
  key: string;
  label: string;
  answer: (ctx: { legal: LegalPages | null; whatsappHref: string | null; fulfillment: FulfillmentSettings }) => string;
}

const SCRIPTED_TOPICS: Topic[] = [
  {
    key: 'sizing',
    label: 'Sizing & fit help',
    answer: () =>
      "Most of our lehengas and sarees come with adjustable blouses/drawstrings, so a little give either way is fine. Check the size chart on the product page against a similar outfit you already own for the best match. If you're between two sizes or want a custom fit, tell us your bust/waist/hip measurements on WhatsApp and we'll confirm before you order.",
  },
  {
    key: 'fabric',
    label: 'Fabric & care',
    answer: () =>
      'Each product page lists the exact fabric (silk, georgette, banarasi, cotton, etc.) under the description. As a rule of thumb: dry-clean silks and heavily embroidered pieces, hand-wash cottons in cold water, and always store folded in a breathable cloth away from direct sunlight to protect embroidery and zari work.',
  },
  {
    key: 'delivery',
    label: 'Delivery time & COD',
    answer: ({ legal, fulfillment }) => {
      const fallback = `Orders typically leave our warehouse within ${dispatchWindowText(fulfillment)}, then take a few more days to arrive depending on your pincode.`;
      return legal?.['shipping-policy']?.trim()
        ? summarize(legal['shipping-policy'], fallback)
        : `${fallback} Cash on Delivery availability is shown at checkout once you enter your pincode.`;
    },
  },
  {
    key: 'returns',
    label: 'Returns & exchange',
    answer: ({ legal, fulfillment }) => {
      const fallback = `We accept returns and exchanges within ${returnWindowText(fulfillment)} of delivery on unworn items with original tags and packaging intact.`;
      return legal?.['refund-policy']?.trim()
        ? summarize(legal['refund-policy'], fallback)
        : `${fallback} Customized or stitched pieces are usually final sale — check the product page for specifics.`;
    },
  },
  {
    key: 'human',
    label: 'Talk to a real person',
    answer: () => '__whatsapp__',
  },
];

// Questions that should get a real, data-backed order lookup even when
// they come through the free-text AI box and the AI call fails.
const ORDER_INTENT_RE =
  /\b(order|track|tracking|delivery|deliver|shipment|shipped|parcel|courier|waybill|kaha|kaha hai|kab|kab tak|mera order|status)\b/i;

function summarize(policyText: string, fallback: string): string {
  const plain = policyText.replace(/\s+/g, ' ').trim();
  if (!plain) return fallback;
  return plain.length > 320 ? `${plain.slice(0, 317)}...` : plain;
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function formatExpectedDate(iso?: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

interface LookedUpOrder {
  id: string;
  shortId: string;
  status: string;
  liveStatus?: string | null;
  createdAt: string;
  totalAmount: number;
  items: Array<{ name?: string; quantity?: number }>;
  courierName?: string | null;
  trackingNumber?: string | null;
  currentLocation?: string | null;
  expectedDeliveryDate?: string | null;
}

function orderToChatText(order: LookedUpOrder): string {
  const lines: string[] = [];
  lines.push(`Order ${order.shortId} — status: ${order.liveStatus || order.status}`);
  lines.push(`Placed on ${new Date(order.createdAt).toLocaleDateString('en-IN')}`);
  if (order.trackingNumber) {
    lines.push(`Courier: ${order.courierName || 'Assigned courier'} · Tracking #: ${order.trackingNumber}`);
    if (order.currentLocation) lines.push(`Last known location: ${order.currentLocation}`);
  } else {
    lines.push('A tracking number will appear here as soon as the order ships.');
  }
  const expected = formatExpectedDate(order.expectedDeliveryDate);
  if (expected) lines.push(`Expected delivery: ${expected}`);
  const itemNames = order.items.map((i) => `${i.name || 'Item'}${i.quantity ? ` x${i.quantity}` : ''}`).join(', ');
  if (itemNames) lines.push(`Items: ${itemNames}`);
  return lines.join('\n');
}

// What the widget needs to know to email/raise-a-ticket for the order
// that's currently on screen — set right after a successful lookup.
interface ActiveOrderContext {
  orderId: string;
  shortId: string;
  guestEmail?: string; // only set for guests who verified via order-lookup
}

interface LookedUpTicket {
  id: string;
  shortId: string;
  subject: string;
  message: string;
  status: string;
  replyMessage?: string | null;
  repliedAt?: string | null;
  createdAt: string;
  attachmentUrl?: string | null;
  replyAttachmentUrl?: string | null;
  suggestedProduct?: ProductCard | null;
}

const TICKET_STATUS_LABEL: Record<string, string> = {
  open: 'Open — waiting on our team',
  in_progress: "In progress — we're on it",
  resolved: 'Resolved',
  closed: 'Closed',
};

function ticketToChatText(ticket: LookedUpTicket): string {
  const lines: string[] = [];
  lines.push(`Ticket ${ticket.shortId} — ${TICKET_STATUS_LABEL[ticket.status] || ticket.status}`);
  lines.push(`"${ticket.subject}"`);
  lines.push(`Raised on ${new Date(ticket.createdAt).toLocaleDateString('en-IN')}`);
  if (ticket.attachmentUrl) {
    lines.push('📎 You attached a photo with this ticket.');
  }
  if (ticket.replyMessage) {
    lines.push('');
    lines.push(`Our reply${ticket.repliedAt ? ` (${new Date(ticket.repliedAt).toLocaleDateString('en-IN')})` : ''}:`);
    lines.push(ticket.replyMessage);
  } else {
    lines.push('');
    lines.push('No reply yet — our team will follow up on the email you raised this with.');
  }
  return lines.join('\n');
}

type GuestStep = null | 'orderId' | 'email';
type TicketStep = null | 'message' | 'email';
type TicketLookupStep = null | 'email';

export default function LiveChatWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [hasOpenedOnce, setHasOpenedOnce] = useState(false);
  const [marketing, setMarketing] = useState<MarketingSettings | null>(null);
  const [legal, setLegal] = useState<LegalPages | null>(null);
  const [fulfillment, setFulfillment] = useState<FulfillmentSettings>(DEFAULT_FULFILLMENT_SETTINGS);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: uid(),
      sender: 'bot',
      text: "Hi! I'm here to help with quick questions before you order — sizing, fabric, delivery, returns, or tracking an existing order. Pick a topic below, or type your own question and I'll answer directly.",
    },
  ]);
  const [input, setInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Guest order-lookup mini flow ("Track my order" when not logged in).
  const [guestStep, setGuestStep] = useState<GuestStep>(null);
  const [guestOrderId, setGuestOrderId] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [orderLookupLoading, setOrderLookupLoading] = useState(false);
  // Full details for this shopper's other (non-primary) orders from the
  // last lookup, keyed by order id — lets "view this order" chips show
  // details instantly without another API call.
  const otherOrdersRef = useRef<Record<string, LookedUpOrder>>({});

  // Whatever order is currently on screen — powers "Email me this" /
  // "Raise a support ticket" action chips.
  const [activeOrder, setActiveOrder] = useState<ActiveOrderContext | null>(null);
  const [emailSending, setEmailSending] = useState(false);

  // Raise-a-ticket mini flow.
  const [ticketStep, setTicketStep] = useState<TicketStep>(null);
  const [ticketMessage, setTicketMessage] = useState('');
  const [ticketEmail, setTicketEmail] = useState('');
  const [ticketSending, setTicketSending] = useState(false);
  // Optional photo attached to the ticket being raised — uploaded as soon
  // as it's picked (via /api/chat/upload-attachment) so submitting the
  // ticket itself stays a single fast round-trip.
  const [ticketAttachment, setTicketAttachment] = useState<{ url: string; name: string } | null>(null);
  const [ticketAttaching, setTicketAttaching] = useState(false);
  const ticketFileInputRef = useRef<HTMLInputElement>(null);

  // "Check my ticket" mini flow — separate from the raise-a-ticket flow
  // above (that one creates a new ticket; this one looks up existing
  // ones and shows the admin's reply, if any).
  const [ticketLookupStep, setTicketLookupStep] = useState<TicketLookupStep>(null);
  const [ticketLookupEmail, setTicketLookupEmail] = useState('');
  const [ticketLookupLoading, setTicketLookupLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchMarketingSettings(), fetchLegalPagesResolved(), fetchFulfillmentSettings()])
      .then(([m, l, f]) => {
        if (!cancelled) {
          setMarketing(m);
          setLegal(l);
          setFulfillment(f);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMarketing(null);
          setLegal(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open, guestStep, ticketStep, ticketLookupStep]);

  if (pathname?.startsWith('/admin')) return null;

  const whatsappHref =
    marketing?.whatsapp_number
      ? `https://wa.me/${marketing.whatsapp_number.replace(/\D/g, '')}?text=${encodeURIComponent(
          marketing.whatsapp_message || 'Hi! I have a question about your products.'
        )}`
      : null;

  const showWhatsappBar = Boolean(marketing?.whatsapp_chat_widget_enabled && whatsappHref);

  function handleToggle() {
    setOpen((v) => !v);
    setHasOpenedOnce(true);
  }

  function addBot(
    text: string,
    isError = false,
    orderChips?: { id: string; shortId: string }[],
    extra?: { imageUrl?: string | null; productCard?: ProductCard | null }
  ) {
    setMessages((prev) => [
      ...prev,
      { id: uid(), sender: 'bot', text, isError, orderChips, imageUrl: extra?.imageUrl, productCard: extra?.productCard },
    ]);
  }

  function addUser(text: string, imageUrl?: string | null) {
    setMessages((prev) => [...prev, { id: uid(), sender: 'user', text, imageUrl }]);
  }

  // Tapping one of the "you also have N more orders" chips — shows that
  // order's details right away using the data we already fetched in the
  // same lookup (no extra API round-trip needed).
  function handleViewOtherOrder(orderId: string) {
    const order = otherOrdersRef.current[orderId];
    if (!order) return;
    addUser(`Order ${order.shortId}`);
    addBot(orderToChatText(order));
    setActiveOrder({ orderId: order.id, shortId: order.shortId });
  }

  // -------------------------------------------------------------------
  // Order tracking — logged-in shoppers resolve instantly; guests are
  // asked for Order ID + checkout email first.
  // -------------------------------------------------------------------

  async function runOrderLookup(params: { orderId?: string; email?: string }) {
    setOrderLookupLoading(true);
    try {
      const res = await fetch('/api/chat/order-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      const data = await res.json().catch(() => ({ ok: false }));

      if (!data?.ok) {
        addBot(data?.error || "Couldn't fetch your order right now — please try again shortly, or use WhatsApp above.", true);
        return;
      }

      if (data.loggedIn) {
        if (!data.orders || data.orders.length === 0) {
          addBot("I don't see any orders on your account yet — once you place one, I can track it right here!");
          setActiveOrder(null);
          return;
        }
        const [top, ...rest] = data.orders as LookedUpOrder[];
        let text = orderToChatText(top);
        let orderChips: { id: string; shortId: string }[] | undefined;
        if (rest.length > 0) {
          text += `\n\nYou also have ${rest.length} more order${rest.length > 1 ? 's' : ''} — tap one below for details.`;
          otherOrdersRef.current = Object.fromEntries(rest.map((o) => [o.id, o]));
          orderChips = rest.map((o) => ({ id: o.id, shortId: o.shortId }));
        }
        addBot(text, false, orderChips);
        setActiveOrder({ orderId: top.id, shortId: top.shortId });
        return;
      }

      // Guest path
      if (data.needsDetails) {
        addBot(data.message || 'Please share your Order ID and the email used at checkout.');
        setGuestStep('orderId');
        return;
      }

      if (!data.orders || data.orders.length === 0) {
        addBot(data.message || "I couldn't find a matching order. Double-check the Order ID and email, or continue on WhatsApp.", true);
        setGuestStep(null);
        return;
      }

      const order = data.orders[0] as LookedUpOrder;
      addBot(orderToChatText(order));
      setActiveOrder({ orderId: order.id, shortId: order.shortId, guestEmail: params.email });
      setGuestStep(null);
    } catch {
      addBot("Couldn't reach our order system right now — please try again shortly, or use WhatsApp above.", true);
    } finally {
      setOrderLookupLoading(false);
    }
  }

  function handleTrackOrder() {
    addUser('Track my order');
    setActiveOrder(null);
    runOrderLookup({});
  }

  function submitGuestOrderId() {
    const val = guestOrderId.trim();
    if (!val) return;
    addUser(val);
    setGuestStep('email');
  }

  function submitGuestEmail() {
    const val = guestEmail.trim();
    if (!val) return;
    addUser(val);
    runOrderLookup({ orderId: guestOrderId.trim(), email: val });
  }

  // -------------------------------------------------------------------
  // Email me this order / raise a support ticket — act on whatever
  // order is currently on screen.
  // -------------------------------------------------------------------

  async function handleEmailOrder() {
    if (!activeOrder) return;
    setEmailSending(true);
    try {
      const res = await fetch('/api/chat/email-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: activeOrder.orderId, email: activeOrder.guestEmail }),
      });
      const data = await res.json().catch(() => ({ ok: false }));
      if (data?.ok) {
        addBot(`Sent! Check ${data.sentTo} for the full order and tracking details.`);
      } else {
        addBot(data?.error || "Couldn't send that email right now — please try again shortly.", true);
      }
    } catch {
      addBot("Couldn't send that email right now — please try again shortly.", true);
    } finally {
      setEmailSending(false);
    }
  }

  function handleStartTicket() {
    addUser('Raise a support ticket');
    addBot("Sure — in a line or two, what's the issue?");
    setTicketAttachment(null);
    setTicketStep('message');
  }

  function submitTicketMessage() {
    const val = ticketMessage.trim();
    if (!val) return;
    addUser(val, ticketAttachment?.url);
    if (activeOrder?.guestEmail) {
      raiseTicket(val, activeOrder.guestEmail);
    } else {
      addBot("What's the best email to follow up on this?");
      setTicketStep('email');
    }
  }

  function submitTicketEmail() {
    const val = ticketEmail.trim();
    if (!val) return;
    addUser(val);
    raiseTicket(ticketMessage.trim(), val);
  }

  // Picks + immediately uploads a photo for the ticket currently being
  // raised. Uploading right away (instead of waiting for ticket submit)
  // keeps the final "raise ticket" round-trip fast and lets the shopper
  // see the file attached before they hit send.
  async function handleTicketAttachmentPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setTicketAttaching(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/chat/upload-attachment', { method: 'POST', body: form });
      const data = await res.json().catch(() => ({ ok: false }));
      if (data?.ok && data.url) {
        setTicketAttachment({ url: data.url, name: data.name || file.name });
      } else {
        addBot(data?.error || "Couldn't attach that photo — please try again.", true);
      }
    } catch {
      addBot("Couldn't attach that photo — please try again.", true);
    } finally {
      setTicketAttaching(false);
    }
  }

  async function raiseTicket(message: string, email: string) {
    setTicketSending(true);
    try {
      const res = await fetch('/api/chat/raise-ticket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: activeOrder?.orderId,
          email,
          subject: activeOrder ? `Order ${activeOrder.shortId} — support request` : 'Support request from chat',
          message,
          attachmentUrl: ticketAttachment?.url || null,
        }),
      });
      const data = await res.json().catch(() => ({ ok: false }));
      if (data?.ok) {
        addBot(`Done — ticket ${data.shortId} raised. Our team will follow up on ${email} shortly.`);
      } else if (data?.needsEmail) {
        addBot('What email should we follow up on?');
        setTicketStep('email');
        setTicketSending(false);
        return;
      } else {
        addBot(data?.error || "Couldn't raise a ticket right now — please try WhatsApp instead.", true);
      }
    } catch {
      addBot("Couldn't raise a ticket right now — please try WhatsApp instead.", true);
    } finally {
      setTicketStep(null);
      setTicketMessage('');
      setTicketEmail('');
      setTicketSending(false);
      setTicketAttachment(null);
    }
  }

  // -------------------------------------------------------------------
  // Check my ticket — looks up existing ticket(s) and shows the reply,
  // if the admin has sent one, instead of only relying on email.
  // -------------------------------------------------------------------

  async function runTicketLookup(params: { email?: string; ticketId?: string }) {
    setTicketLookupLoading(true);
    try {
      const res = await fetch('/api/chat/ticket-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      const data = await res.json().catch(() => ({ ok: false }));

      if (!data?.ok) {
        addBot(data?.error || "Couldn't fetch your ticket right now — please try again shortly, or use WhatsApp above.", true);
        return;
      }

      if (data.needsDetails) {
        addBot(data.message || 'Please share the email you used when raising the ticket.');
        setTicketLookupStep('email');
        return;
      }

      const tickets = (data.tickets || []) as LookedUpTicket[];
      if (tickets.length === 0) {
        addBot(data.message || "I don't see any support tickets on that email yet.");
        setTicketLookupStep(null);
        return;
      }

      const [top, ...rest] = tickets;
      let text = ticketToChatText(top);
      if (rest.length > 0) {
        text += `\n\nYou also have ${rest.length} more ticket${rest.length > 1 ? 's' : ''} — the most recent one is shown above.`;
      }
      addBot(text, false, undefined, {
        imageUrl: top.replyAttachmentUrl || top.attachmentUrl,
        productCard: top.suggestedProduct,
      });
      setTicketLookupStep(null);
    } catch {
      addBot("Couldn't reach our support system right now — please try again shortly, or use WhatsApp above.", true);
    } finally {
      setTicketLookupLoading(false);
    }
  }

  function handleCheckTicket() {
    addUser('Check my ticket status');
    runTicketLookup({});
  }

  function submitTicketLookupEmail() {
    const val = ticketLookupEmail.trim();
    if (!val) return;
    addUser(val);
    runTicketLookup({ email: val });
    setTicketLookupEmail('');
  }

  // -------------------------------------------------------------------
  // Free-text AI box
  // -------------------------------------------------------------------

  async function handleAskAi() {
    const question = input.trim();
    if (!question || aiLoading) return;

    setInput('');
    const history = [...messages, { id: uid(), sender: 'user' as Sender, text: question }];
    setMessages(history);
    setAiLoading(true);

    try {
      const res = await fetch('/api/chat/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: history
            .slice(-8)
            .map((m) => ({ role: m.sender === 'user' ? 'user' : 'assistant', content: m.text })),
          page: pathname || '',
        }),
      });
      const data = await res.json().catch(() => ({ ok: false }));

      if (data?.ok && data.reply) {
        setMessages((prev) => [...prev, { id: uid(), sender: 'bot', text: data.reply }]);
        setAiLoading(false);
        return;
      }

      // AI didn't answer — if this looks like an order/tracking
      // question, fall back to the real, deterministic order lookup
      // instead of just showing an error. This is what makes "where's
      // my order" always resolve, AI outage or not.
      if (ORDER_INTENT_RE.test(question)) {
        setAiLoading(false);
        await runOrderLookup({});
        return;
      }

      const reason: string = data?.error || '';
      let text: string;
      if (reason.includes('not configured')) {
        text = "AI chat isn't set up yet on this site (missing API key) — tap the WhatsApp bar above and our team can help you directly.";
      } else if (reason.includes('turned off')) {
        text = "Free-text AI chat is switched off right now — tap the WhatsApp bar above and our team can help you directly.";
      } else if (reason.includes('rate-limited')) {
        text = "Our AI is getting a lot of questions right now (free-tier limit) — please try again in a minute, or tap WhatsApp above.";
      } else if (reason.includes('key was rejected')) {
        text = 'The AI assistant is misconfigured on our end — tap the WhatsApp bar above and our team can help you directly.';
      } else {
        text = "Our AI assistant is having trouble right now — tap the WhatsApp bar above and our team will take it from here.";
      }
      addBot(text, true);
    } catch {
      if (ORDER_INTENT_RE.test(question)) {
        await runOrderLookup({});
      } else {
        addBot(
          whatsappHref
            ? "Couldn't reach our AI assistant. Tap the WhatsApp bar above and our team will help directly."
            : "Couldn't reach our AI assistant right now — please try again shortly.",
          true
        );
      }
    } finally {
      setAiLoading(false);
    }
  }

  function handleTopic(topic: Topic) {
    const answer = topic.answer({ legal, whatsappHref, fulfillment });
    addUser(topic.label);
    addBot(
      answer === '__whatsapp__'
        ? whatsappHref
          ? "Sure — tap the WhatsApp bar at the top of this chat and our team will pick it up from here."
          : "Our team isn't set up on WhatsApp chat right now, but you can reach us from the Contact page and we'll get back to you."
        : answer
    );
  }

  const inGuestFlow = guestStep !== null;
  const inTicketFlow = ticketStep !== null;
  const inTicketLookupFlow = ticketLookupStep !== null;
  const busy = aiLoading || orderLookupLoading || emailSending || ticketSending || ticketLookupLoading || ticketAttaching;

  return (
    <>
      {open && (
        <div
          role="dialog"
          aria-label="Live chat"
          className="fixed inset-x-3 bottom-[9.5rem] z-50 flex max-h-[70vh] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl sm:inset-x-auto sm:bottom-24 sm:left-4 sm:w-[23rem]"
        >
          <div className="flex items-center justify-between bg-primary px-4 py-3 text-primary-foreground">
            <div>
              <p className="font-serif text-sm font-semibold leading-tight">AruhiHandlooms</p>
              <p className="text-xs opacity-80">Usually replies in a few minutes</p>
            </div>
            <button
              onClick={handleToggle}
              aria-label="Close chat"
              className="rounded-full p-1.5 transition-colors hover:bg-white/15"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {showWhatsappBar && whatsappHref && (
            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-[#25D366]/10 px-4 py-2 text-xs font-medium text-[#128C4A] transition-colors hover:bg-[#25D366]/20"
            >
              <span className="flex items-center gap-1.5">
                <WhatsAppIcon className="h-3.5 w-3.5 text-[#25D366]" />
                Prefer WhatsApp? Chat with our team directly
              </span>
              <ChevronRight className="h-3.5 w-3.5 shrink-0" />
            </a>
          )}

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto bg-muted/40 px-3 py-4">
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className="flex max-w-[85%] flex-col items-start gap-1.5">
                  <div
                    className={`whitespace-pre-line rounded-2xl px-3 py-2 text-sm leading-relaxed shadow-sm ${
                      m.sender === 'user'
                        ? 'rounded-br-sm bg-primary text-primary-foreground'
                        : m.isError
                          ? 'rounded-bl-sm border border-destructive/30 bg-destructive/10 text-foreground'
                          : 'rounded-bl-sm border border-border bg-card text-card-foreground'
                    }`}
                  >
                    {m.text}
                    {m.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={m.imageUrl}
                        alt="Attachment"
                        className="mt-2 max-h-40 w-full rounded-lg border border-border/40 object-cover"
                      />
                    )}
                  </div>
                  {m.productCard && (
                    <a
                      href={m.productCard.slug ? `/product/${m.productCard.slug}` : '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex w-full items-center gap-2.5 rounded-xl border border-border bg-card p-2 shadow-sm transition-colors hover:border-primary"
                    >
                      {m.productCard.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={m.productCard.image}
                          alt=""
                          className="h-12 w-12 shrink-0 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-muted">
                          <PackageSearch className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-foreground">{m.productCard.name}</p>
                        {typeof m.productCard.price === 'number' && (
                          <p className="text-xs font-semibold text-primary">₹{m.productCard.price.toLocaleString('en-IN')}</p>
                        )}
                        <p className="text-[10px] text-muted-foreground">We recommend this — tap to view</p>
                      </div>
                    </a>
                  )}
                  {m.orderChips && m.orderChips.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pl-1">
                      {m.orderChips.map((chip) => (
                        <button
                          key={chip.id}
                          onClick={() => handleViewOtherOrder(chip.id)}
                          disabled={busy}
                          className="flex items-center gap-1 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
                        >
                          <PackageSearch className="h-3 w-3" /> Order {chip.shortId}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Action chips for the order currently on screen. */}
            {activeOrder && !inGuestFlow && !inTicketFlow && !inTicketLookupFlow && (
              <div className="flex flex-wrap justify-start gap-1.5 pl-1">
                <button
                  onClick={handleEmailOrder}
                  disabled={busy}
                  className="flex items-center gap-1 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
                >
                  <Mail className="h-3 w-3" /> Email me these details
                </button>
                <button
                  onClick={handleStartTicket}
                  disabled={busy}
                  className="flex items-center gap-1 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
                >
                  <LifeBuoy className="h-3 w-3" /> Raise a support ticket
                </button>
              </div>
            )}

            {busy && (
              <div className="flex justify-start">
                <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm border border-border bg-card px-3 py-2.5 shadow-sm">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" />
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-border bg-card p-3">
            {inGuestFlow ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (guestStep === 'orderId') submitGuestOrderId();
                  else submitGuestEmail();
                }}
                className="mb-3 flex items-center gap-2"
              >
                <PackageSearch className="h-4 w-4 shrink-0 text-muted-foreground" />
                <input
                  autoFocus
                  value={guestStep === 'orderId' ? guestOrderId : guestEmail}
                  onChange={(e) =>
                    guestStep === 'orderId' ? setGuestOrderId(e.target.value) : setGuestEmail(e.target.value)
                  }
                  placeholder={guestStep === 'orderId' ? 'Order ID, e.g. A1B2C3D4' : 'Email used at checkout'}
                  type={guestStep === 'email' ? 'email' : 'text'}
                  disabled={busy}
                  className="w-full rounded-full border border-border bg-background py-2 px-3 text-base outline-none transition-colors focus:border-primary disabled:opacity-60 sm:text-sm"
                />
                <button
                  type="submit"
                  disabled={busy}
                  aria-label="Submit"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity disabled:opacity-40"
                >
                  <Send className="h-4 w-4" />
                </button>
              </form>
            ) : inTicketFlow ? (
              <div className="mb-3">
                {ticketStep === 'message' && (ticketAttachment || ticketAttaching) && (
                  <div className="mb-2 flex items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs">
                    {ticketAttaching ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
                        <span className="text-muted-foreground">Uploading photo...</span>
                      </>
                    ) : (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={ticketAttachment!.url} alt="" className="h-8 w-8 shrink-0 rounded object-cover" />
                        <span className="flex-1 truncate text-foreground">{ticketAttachment!.name}</span>
                        <button
                          type="button"
                          onClick={() => setTicketAttachment(null)}
                          aria-label="Remove attachment"
                          className="shrink-0 text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                )}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (ticketStep === 'message') submitTicketMessage();
                    else submitTicketEmail();
                  }}
                  className="flex items-center gap-2"
                >
                  <LifeBuoy className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <input
                    autoFocus
                    value={ticketStep === 'message' ? ticketMessage : ticketEmail}
                    onChange={(e) =>
                      ticketStep === 'message' ? setTicketMessage(e.target.value) : setTicketEmail(e.target.value)
                    }
                    placeholder={ticketStep === 'message' ? 'Describe the issue briefly' : 'Email for follow-up'}
                    type={ticketStep === 'email' ? 'email' : 'text'}
                    maxLength={ticketStep === 'message' ? 300 : undefined}
                    disabled={busy}
                    className="w-full rounded-full border border-border bg-background py-2 px-3 text-base outline-none transition-colors focus:border-primary disabled:opacity-60 sm:text-sm"
                  />
                  {ticketStep === 'message' && (
                    <>
                      <input
                        ref={ticketFileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleTicketAttachmentPick}
                      />
                      <button
                        type="button"
                        onClick={() => ticketFileInputRef.current?.click()}
                        disabled={busy || ticketAttaching}
                        aria-label="Attach a photo"
                        title="Attach a photo"
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-40"
                      >
                        <Paperclip className="h-4 w-4" />
                      </button>
                    </>
                  )}
                  <button
                    type="submit"
                    disabled={busy}
                    aria-label="Submit"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity disabled:opacity-40"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </form>
              </div>
            ) : inTicketLookupFlow ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  submitTicketLookupEmail();
                }}
                className="mb-3 flex items-center gap-2"
              >
                <ClipboardCheck className="h-4 w-4 shrink-0 text-muted-foreground" />
                <input
                  autoFocus
                  value={ticketLookupEmail}
                  onChange={(e) => setTicketLookupEmail(e.target.value)}
                  placeholder="Email used when raising the ticket"
                  type="email"
                  disabled={busy}
                  className="w-full rounded-full border border-border bg-background py-2 px-3 text-base outline-none transition-colors focus:border-primary disabled:opacity-60 sm:text-sm"
                />
                <button
                  type="submit"
                  disabled={busy}
                  aria-label="Submit"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity disabled:opacity-40"
                >
                  <Send className="h-4 w-4" />
                </button>
              </form>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleAskAi();
                }}
                className="mb-3 flex items-center gap-2"
              >
                <div className="relative flex-1">
                  <Sparkles className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Ask me anything..."
                    disabled={busy}
                    maxLength={600}
                    className="w-full rounded-full border border-border bg-background py-2 pl-8 pr-3 text-base outline-none transition-colors focus:border-primary disabled:opacity-60 sm:text-sm"
                  />
                </div>
                <button
                  type="submit"
                  disabled={busy || !input.trim()}
                  aria-label="Send"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity disabled:opacity-40"
                >
                  <Send className="h-4 w-4" />
                </button>
              </form>
            )}

            {!inGuestFlow && !inTicketFlow && !inTicketLookupFlow && (
              <>
                <p className="mb-2 flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  <ArrowLeft className="h-3 w-3" /> Or pick a quick question
                </p>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={handleTrackOrder}
                    disabled={busy}
                    className="flex items-center gap-1 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
                  >
                    <PackageSearch className="h-3 w-3" /> Track my order
                  </button>
                  <button
                    onClick={handleCheckTicket}
                    disabled={busy}
                    className="flex items-center gap-1 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
                  >
                    <ClipboardCheck className="h-3 w-3" /> Check my ticket
                  </button>
                  {SCRIPTED_TOPICS.map((topic) => (
                    <button
                      key={topic.key}
                      onClick={() => handleTopic(topic)}
                      disabled={busy}
                      className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
                    >
                      {topic.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <button
        onClick={handleToggle}
        aria-label={open ? 'Close chat' : 'Chat with us'}
        aria-expanded={open}
        className="fixed bottom-24 left-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg transition-transform hover:scale-105 hover:bg-[#20bd5a]"
      >
        {open ? <X className="h-6 w-6" /> : <WhatsAppIcon className="h-7 w-7" />}
        {!hasOpenedOnce && (
          <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-secondary opacity-75" />
            <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-secondary" />
          </span>
        )}
      </button>
    </>
  );
}
