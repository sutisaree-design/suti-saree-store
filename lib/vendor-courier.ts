// ---------------------------------------------------------------------
// Phase 3B — vendor pickup-leg courier trigger.
//
// INTENTIONALLY MANUAL FOR NOW: when a vendor taps "Request Pickup" on
// their dashboard, the app only (a) timestamps the request on the order
// item and (b) surfaces it as an admin task (see /api/admin/notifications).
// You then book the actual pickup yourself via WhatsApp / the courier's
// own app/website.
//
// This function is the placeholder for wiring that up later — every
// call site (app/api/vendor/orders/[id]/route.ts, action:
// "request_pickup") already calls it, so switching to a live courier
// API is a one-file change: fill in the body below and nothing else in
// the app needs to change.
//
// future: Shiprocket/Delhivery pickup-booking API call goes here, e.g.
//   await fetch('https://track.delhivery.com/api/cmu/create.json', { ... })
// (This codebase already has a working Delhivery integration for the
// *customer-facing* shipping leg — see lib/delhivery-api.ts and
// app/api/admin/delhivery/create-shipment/route.ts. That one is for the
// second leg, warehouse -> customer, booked by the admin in Phase 3C.
// This placeholder is for the *first* leg, vendor -> warehouse, which
// you said you want to keep manual for now.)
// ---------------------------------------------------------------------

export interface CourierPickupRequest {
  order_item_id: string;
  vendor_business_name: string;
  pickup_address: string;
  product_name: string;
  quantity: number;
}

/**
 * Placeholder — future: call Shiprocket/Delhivery's pickup-booking API
 * here. Left as a no-op stub on purpose (see file header). Never called
 * from a client component — only from the vendor orders API route.
 */
export async function triggerCourierPickup(request: CourierPickupRequest): Promise<void> {
  if (process.env.NODE_ENV !== 'production') {
    console.log(
      `[courier-pickup placeholder] Would book pickup for "${request.product_name}" (qty ${request.quantity}) ` +
        `from ${request.vendor_business_name} at ${request.pickup_address} — wire a real courier API in ` +
        `lib/vendor-courier.ts:triggerCourierPickup() when ready.`
    );
  }
}
