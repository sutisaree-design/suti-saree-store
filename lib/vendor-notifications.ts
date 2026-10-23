// ---------------------------------------------------------------------
// Vendor notifications (Phase 1).
//
// Email is sent for real, reusing the site's existing multi-provider
// email sender (lib/email.ts) — no extra setup needed.
//
// WhatsApp is intentionally a placeholder: wire up your WhatsApp
// Business API (or a provider like Gupshup/Interakt) inside
// `sendVendorWhatsApp` below when you're ready. Every call site in this
// file already calls it, so integrating later is a one-file change.
// ---------------------------------------------------------------------

import { sendEmail } from './email';
import {
  vendorApplicationStatusEmail,
  vendorBankUpdateStatusEmail,
  vendorProductStatusEmail,
} from './email-templates';

interface VendorLike {
  business_name: string;
  email: string | null;
  whatsapp?: string | null;
}

/**
 * Placeholder — future: call WhatsApp Business API / Gupshup / Interakt here.
 * Left as a no-op stub on purpose (see file header).
 */
async function sendVendorWhatsApp(vendor: VendorLike, message: string): Promise<void> {
  // future: WhatsApp Business API call goes here, e.g.:
  // await fetch('https://graph.facebook.com/v19.0/<phone-number-id>/messages', { ... })
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[vendor-whatsapp placeholder] to ${vendor.whatsapp || 'N/A'}: ${message}`);
  }
}

export async function notifyVendorApplicationStatus(
  vendor: VendorLike & { status: 'approved' | 'rejected'; admin_note?: string | null }
): Promise<void> {
  const { subject, html } = vendorApplicationStatusEmail({
    business_name: vendor.business_name,
    status: vendor.status,
    admin_note: vendor.admin_note,
  });

  if (vendor.email) {
    await sendEmail({ to: vendor.email, subject, html });
  }

  await sendVendorWhatsApp(
    vendor,
    vendor.status === 'approved'
      ? `Aapka vendor application approve ho gaya hai. Ab aap vendor dashboard se product add kar sakte hain.`
      : `Aapka vendor application is baar approve nahi ho saka.${vendor.admin_note ? ` Reason: ${vendor.admin_note}` : ''}`
  );
}

export async function notifyVendorBankUpdateStatus(
  vendor: VendorLike & { approved: boolean }
): Promise<void> {
  const { subject, html } = vendorBankUpdateStatusEmail({
    business_name: vendor.business_name,
    approved: vendor.approved,
  });

  if (vendor.email) {
    await sendEmail({ to: vendor.email, subject, html });
  }

  await sendVendorWhatsApp(
    vendor,
    vendor.approved
      ? `Aapki bank detail update ho gayi hai.`
      : `Aapki bank detail change request reject ho gayi hai — kripya dobara try karein ya humse contact karein.`
  );
}

/** Sent from the admin "Vendor Submissions" panel (Phase 2, Part 5) on Approve/Reject. */
export async function notifyVendorProductStatus(
  vendor: VendorLike & {
    product_name: string;
    status: 'awaiting_stock' | 'rejected';
    final_price?: number | null;
    rejection_reason?: string | null;
  }
): Promise<void> {
  const { subject, html } = vendorProductStatusEmail({
    business_name: vendor.business_name,
    product_name: vendor.product_name,
    status: vendor.status,
    final_price: vendor.final_price,
    rejection_reason: vendor.rejection_reason,
  });

  if (vendor.email) {
    await sendEmail({ to: vendor.email, subject, html });
  }

  await sendVendorWhatsApp(
    vendor,
    vendor.status === 'awaiting_stock'
      ? `Aapka product "${vendor.product_name}" approve ho gaya hai. Stock confirm hote hi ye live ho jayega.`
      : `Aapka product "${vendor.product_name}" is baar approve nahi ho saka.${vendor.rejection_reason ? ` Reason: ${vendor.rejection_reason}` : ''}`
  );
}
