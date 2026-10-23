-- Add Razorpay payment fields to orders table
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS razorpay_order_id text,
  ADD COLUMN IF NOT EXISTS razorpay_payment_id text,
  ADD COLUMN IF NOT EXISTS razorpay_signature text;

-- Add 'paid' as a valid status value (existing status column is text, no constraint)
-- No constraint change needed since status is free text

-- Allow anon/authenticated to update these columns (already have update policy with USING(true))
-- No additional RLS needed since existing policies cover all columns