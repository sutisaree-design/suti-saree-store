# Cashfree + Payment Gateway On/Off Toggle

## 1. Supabase (pehle ye run karo)
SQL editor me `supabase/migrations/20261030000000_cashfree_and_payment_gateway_toggle.sql` run karo.
(orders me `payment_gateway`, `cashfree_order_id` columns + `payment_gateways` setting.)

## 2. Environment variables (Netlify / .env)
```
CASHFREE_APP_ID=xxxxxxxx          # Cashfree dashboard > Developers > API Keys > App ID
CASHFREE_SECRET_KEY=xxxxxxxx      # same page > Secret Key
CASHFREE_ENV=sandbox              # TEST ke liye "sandbox", LIVE ke liye "production"
NEXT_PUBLIC_SITE_URL=https://www.sutisaree.com   # (already hai to rehne do)
```
Live keys alag hoti hain (dashboard me "Switch to Test" / Live toggle). Production me `CASHFREE_ENV=production` zaroor karo.

## 3. Cashfree webhook
Cashfree dashboard > Developers > Webhooks > Add Webhook Endpoint
- URL: `https://www.sutisaree.com/api/cashfree/webhook`
- Event: **Payment Success**
(Signature `CASHFREE_SECRET_KEY` se verify hota hai, alag secret nahi chahiye.)
Cashfree me aapka domain whitelist hona chahiye (Developers > Whitelisted Domains) agar live me maange.

## 4. Admin toggle
Admin > Settings > **Payment Gateways**
- "Accept online payments" = master switch (OFF => sab gateway band, checkout me sirf COD)
- Razorpay on/off, Cashfree on/off
- Dono on ho to "If both are on, use" wala gateway chalega
Default: Razorpay ON, Cashfree OFF (yani push ke baad kuch change nahi hoga jab tak aap Cashfree on na karo).

## 5. Test
1. `CASHFREE_ENV=sandbox` + test keys, Admin me Cashfree ON, Razorpay OFF.
2. Checkout > Pay Online > Cashfree test UPI/card se pay karo > order "paid" hona chahiye.
3. Order cancel karke refund check karo (Cashfree dashboard > Refunds).
