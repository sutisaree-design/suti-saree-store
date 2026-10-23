-- Tracks the outcome of automatic Razorpay refunds triggered by customer
-- self-cancellation (see app/api/orders/[id]/cancel/route.ts).
-- refund_status is null for orders that never needed a refund (COD, or
-- cancelled before payment was captured).
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS refund_status text,
  ADD COLUMN IF NOT EXISTS razorpay_refund_id text;

-- No RLS change needed: this is only ever written by the service-role
-- (admin) client from the server-side cancel route, same as other
-- Razorpay columns.
