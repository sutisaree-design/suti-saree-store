'use client';

import { useEffect, useState } from 'react';
import { Wallet } from 'lucide-react';
import {
  HandlingFeeSettings,
  fetchHandlingFeeSettings,
  calculateHandlingFee,
} from '@/lib/settings-api';
import { formatINR } from '@/lib/format';

// Lets a vendor see, right on the listing form, roughly what they'll
// actually be paid after our commission -- before they've submitted
// anything. Reads `vendor_settlement_settings` from the public
// `settings` table (readable by anon/authenticated, see
// 20260828000000_lock_settings_secrets.sql), same values the admin
// "Vendor Commission & Settlement" screen edits.
//
// This is a preview only: the real fee is calculated once, and locked
// in, by the calculate_order_item_settlement_fee() DB trigger the
// moment an order item is actually marked "Delivered" -- if commission
// settings change between listing and a real sale, the number shown
// here won't retroactively match what already-delivered orders paid
// out, by design.
export default function VendorPayoutPreview({ price }: { price: number | null }) {
  const [fee, setFee] = useState<HandlingFeeSettings | null>(null);

  useEffect(() => {
    fetchHandlingFeeSettings()
      .then(setFee)
      .catch(() => setFee(null));
  }, []);

  if (!fee || price == null || !(price > 0)) return null;

  const feeAmount = calculateHandlingFee(price, fee);
  const payable = Math.max(0, price - feeAmount);

  return (
    <div className="mt-2 flex items-start gap-1.5 rounded-md border border-emerald-200/70 bg-emerald-50/60 px-3 py-2 text-xs leading-snug text-emerald-700">
      <Wallet className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>
        You&apos;ll get <span className="font-semibold">{formatINR(payable)}</span> per piece once
        this is sold and delivered ({fee.handling_fee_percent}% commission
        {fee.handling_fee_base > 0 ? ` + ${formatINR(fee.handling_fee_base)} handling fee` : ''}).
        This is only an estimate — the final amount is locked in when the order is delivered.
      </span>
    </div>
  );
}
