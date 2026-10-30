'use client';

import { Check, CreditCard, Info, Lock, Truck, Wallet, Zap, BadgeCheck, Split } from 'lucide-react';
import { formatINR } from '@/lib/format';

/**
 * Premium payment-method picker for checkout.
 *
 * Design / compliance notes (please keep when editing):
 *  - Both options are always visible, equally selectable, and each one shows
 *    the EXACT amount the customer will pay. Nothing is hidden or disabled
 *    to push people toward prepaid.
 *  - The prepaid saving is a plain, disclosed discount (also shown as a line
 *    item in the Order Summary). Merchant Center feed / structured data
 *    should keep the normal selling price.
 *  - The benefit copy below (priority dispatch / faster delivery) must stay
 *    TRUE in your day-to-day operations and match your Shipping Policy page.
 *    If you ever stop prioritising prepaid orders, edit PAYMENT_COPY here.
 *    No fixed delivery-day numbers are promised on purpose.
 */
export const PAYMENT_COPY = {
  onlineTitle: 'Pay Online',
  onlineSub: 'UPI, cards, netbanking · Secure payment',
  onlineNote: 'Prepaid orders are confirmed instantly and packed ahead of COD orders.',
  benefits: [
    { icon: 'zap', title: 'Dispatched first', sub: 'Priority packing' },
    { icon: 'truck', title: 'Ships sooner', sub: 'Ships ahead of COD' },
    { icon: 'check', title: 'Instant confirmation', sub: 'No verification wait' },
  ],
  codTitle: 'Cash on Delivery',
  codSub: 'Pay in cash when your order arrives',
  partialBenefits: [
    { icon: 'check', title: 'Confirmed instantly', sub: 'On advance payment' },
    { icon: 'zap', title: 'Dispatched first', sub: 'Ships before COD' },
  ],
  codQueueNote: 'Dispatched after Online & Partial Pay orders',
  partialNote:
    'Confirmed as soon as the advance is paid and dispatched along with prepaid orders, ahead of COD. Pay the balance to the delivery partner in cash or UPI. The online-payment discount applies only to full online payment.',
  codNote:
    'We will send a one-tap confirmation link by email/WhatsApp. COD orders are dispatched after Online and Partial Pay orders, so delivery can take a little longer.',
} as const;

const BENEFIT_ICONS = {
  zap: Zap,
  truck: Truck,
  check: BadgeCheck,
} as const;

export type CheckoutPaymentMethod = 'online' | 'cod' | 'partial';

/** Shown only when Partial Pay is enabled (Admin > Settings) and this order is eligible. */
export interface PartialPayOption {
  title: string;
  percent: number;
  /** Paid online now. */
  advance: number;
  /** Paid to the courier on delivery. */
  balance: number;
}

interface PaymentMethodSelectorProps {
  value: CheckoutPaymentMethod;
  onChange: (method: CheckoutPaymentMethod) => void;
  partial?: PartialPayOption | null;
  /** false when the admin switched ALL online payment gateways off (Admin > Settings > Payment Gateways): only COD is shown. */
  onlineAvailable?: boolean;
  /** Rupees saved by paying online (0 / undefined hides all saving UI). */
  savings: number;
  /** Final amount if the customer pays online. */
  onlineTotal: number;
  /** Final amount if the customer chooses COD. */
  codTotal: number;
}

function RadioDot({ selected }: { selected: boolean }) {
  return (
    <span
      aria-hidden
      className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] transition-all duration-200 ${
        selected
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-muted-foreground/40 bg-background'
      }`}
    >
      <Check
        className={`h-2.5 w-2.5 transition-opacity duration-200 ${selected ? 'opacity-100' : 'opacity-0'}`}
        strokeWidth={3.5}
      />
    </span>
  );
}

/** Smooth open/close for the extra details of the selected option. */
function Expand({ open, children }: { open: boolean; children: React.ReactNode }) {
  return (
    <span
      className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none ${
        open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
      }`}
    >
      <span className="block min-h-0 overflow-hidden">{children}</span>
    </span>
  );
}

const cardBase =
  'relative block w-full rounded-xl border bg-card px-3.5 py-3 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40';
const cardOn =
  'border-primary bg-primary/[0.035] shadow-[0_8px_24px_-14px_hsl(var(--primary)/0.55)]';
const cardOff = 'border-border/70 hover:border-primary/40';

export default function PaymentMethodSelector({
  value,
  onChange,
  partial,
  onlineAvailable = true,
  savings,
  onlineTotal,
  codTotal,
}: PaymentMethodSelectorProps) {
  const online = value === 'online';
  const cod = value === 'cod';
  const part = value === 'partial';
  const hasSavings = savings > 0;

  return (
    <div role="radiogroup" aria-label="Payment method" className="flex flex-col gap-2.5">
      {/* ───────── Pay Online (recommended) ───────── */}
      {onlineAvailable && (
      <button
        type="button"
        role="radio"
        aria-checked={online}
        onClick={() => onChange('online')}
        className={`${cardBase} ${online ? cardOn : 'border-primary/40 hover:border-primary'}`}
      >
        <span className="flex items-center gap-3">
          <RadioDot selected={online} />
          <CreditCard className="hidden h-4 w-4 shrink-0 text-secondary sm:block" />
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="font-serif text-[15px] font-bold leading-tight text-primary">
                {PAYMENT_COPY.onlineTitle}
              </span>
              <span className="rounded-full bg-secondary px-1.5 py-px text-[9px] font-semibold leading-4 text-secondary-foreground">
                Recommended
              </span>
            </span>
            <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
              {PAYMENT_COPY.onlineSub}
            </span>
          </span>
          <span className="shrink-0 text-right">
            <span className="block font-serif text-base font-bold leading-tight text-primary">
              {formatINR(onlineTotal)}
            </span>
            {hasSavings && (
              <span className="mt-0.5 inline-block rounded-full bg-green-100 px-1.5 py-px text-[9px] font-semibold text-green-800">
                Save {formatINR(savings)}
              </span>
            )}
          </span>
        </span>

        {/* Benefits: always visible, one compact line */}
        <span className="mt-2.5 flex flex-wrap gap-1.5 pl-[30px]">
          {PAYMENT_COPY.benefits.map((b) => {
            const Icon = BENEFIT_ICONS[b.icon];
            return (
              <span
                key={b.title}
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium leading-4 text-foreground transition-colors ${
                  online ? 'border-secondary/50 bg-secondary/10' : 'border-border/60 bg-muted/40'
                }`}
              >
                <Icon className="h-3 w-3 text-secondary" />
                {b.title}
              </span>
            );
          })}
        </span>

        <Expand open={online}>
          <span className="flex items-start gap-1.5 pl-[30px] pt-2 text-[11px] leading-snug text-muted-foreground">
            <Lock className="mt-px h-3 w-3 shrink-0 text-secondary" />
            {PAYMENT_COPY.onlineNote}
          </span>
        </Expand>
      </button>
      )}

      {/* ───────── Partial Pay (advance online, rest on delivery) ───────── */}
      {onlineAvailable && partial && (
        <button
          type="button"
          role="radio"
          aria-checked={part}
          onClick={() => onChange('partial')}
          className={`${cardBase} ${part ? cardOn : cardOff}`}
        >
          <span className="flex items-center gap-3">
            <RadioDot selected={part} />
            <Split className="hidden h-4 w-4 shrink-0 text-secondary sm:block" />
            <span className="min-w-0 flex-1">
              <span className="block font-serif text-[15px] font-bold leading-tight text-foreground">
                {partial.title}
              </span>
              <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                Pay {partial.percent}% now, rest on delivery
              </span>
            </span>
            <span className="shrink-0 text-right">
              <span
                className={`block font-serif text-base font-bold leading-tight ${
                  part ? 'text-primary' : 'text-foreground/80'
                }`}
              >
                {formatINR(partial.advance)}
              </span>
              <span className="block text-[9px] text-muted-foreground">now</span>
            </span>
          </span>

          {/* Split bar: online now vs on delivery */}
          <span className="mt-2.5 block pl-[30px]">
            <span className="flex h-1.5 overflow-hidden rounded-full bg-muted">
              <span
                className="block bg-primary/80 transition-all duration-300"
                style={{ width: `${Math.min(Math.max(partial.percent, 5), 95)}%` }}
              />
              <span className="block flex-1 bg-secondary/60" />
            </span>
            <span className="mt-1 flex justify-between text-[10px] text-muted-foreground">
              <span>
                Online now <b className="font-semibold text-foreground">{formatINR(partial.advance)}</b>
              </span>
              <span>
                On delivery <b className="font-semibold text-foreground">{formatINR(partial.balance)}</b>
              </span>
            </span>
          </span>

          <span className="mt-2 flex flex-wrap gap-1.5 pl-[30px]">
            {PAYMENT_COPY.partialBenefits.map((b) => {
              const Icon = BENEFIT_ICONS[b.icon];
              return (
                <span
                  key={b.title}
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium leading-4 text-foreground transition-colors ${
                    part ? 'border-secondary/50 bg-secondary/10' : 'border-border/60 bg-muted/40'
                  }`}
                >
                  <Icon className="h-3 w-3 text-secondary" />
                  {b.title}
                </span>
              );
            })}
          </span>

          <Expand open={part}>
            <span className="mt-2 flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] leading-snug text-amber-900">
              <Info className="mt-px h-3.5 w-3.5 shrink-0" />
              {PAYMENT_COPY.partialNote}
            </span>
          </Expand>
        </button>
      )}

      {/* ───────── Cash on Delivery ───────── */}
      <div>
        <button
          type="button"
          role="radio"
          aria-checked={cod}
          onClick={() => onChange('cod')}
          className={`${cardBase} ${cod ? cardOn : cardOff}`}
        >
          <span className="flex items-center gap-3">
            <RadioDot selected={cod} />
            <Wallet className="hidden h-4 w-4 shrink-0 text-secondary sm:block" />
            <span className="min-w-0 flex-1">
              <span className="block font-serif text-[15px] font-bold leading-tight text-foreground">
                {PAYMENT_COPY.codTitle}
              </span>
              <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                {PAYMENT_COPY.codSub}
              </span>
            </span>
            <span
              className={`shrink-0 font-serif text-base font-bold leading-tight ${
                cod ? 'text-foreground' : 'text-foreground/70'
              }`}
            >
              {formatINR(codTotal)}
            </span>
          </span>

          <span className="mt-2 flex items-center gap-1 pl-[30px] text-[10px] font-medium text-muted-foreground">
            <Truck className="h-3 w-3" />
            {PAYMENT_COPY.codQueueNote}
          </span>

          <Expand open={cod}>
            <span className="mt-2 flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] leading-snug text-amber-900">
              <Info className="mt-px h-3.5 w-3.5 shrink-0" />
              {PAYMENT_COPY.codNote}
            </span>
          </Expand>
        </button>

        {/* Separate button (not nested inside the card button) */}
        {cod && hasSavings && onlineAvailable && (
          <button
            type="button"
            onClick={() => onChange('online')}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-secondary/60 bg-secondary/10 px-3 py-2 text-xs font-semibold text-primary transition-colors hover:bg-secondary/20"
          >
            <Zap className="h-3.5 w-3.5 text-secondary" />
            Switch to online payment &amp; save {formatINR(savings)}
          </button>
        )}
      </div>

      <p className="text-center text-[10px] leading-snug text-muted-foreground">
        {!onlineAvailable
          ? 'Online payment is temporarily unavailable — please choose Cash on Delivery.'
          : partial
          ? 'Same product price on every option — the online-payment discount applies to full online payment only.'
          : 'Same price either way — the only difference is the online-payment discount shown above.'}
      </p>
    </div>
  );
}
