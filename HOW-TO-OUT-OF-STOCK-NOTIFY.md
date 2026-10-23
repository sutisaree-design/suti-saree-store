# Out-of-stock badge + Notify me (Email + WhatsApp)

1. Replace files from the zip, git push.
2. Supabase -> SQL Editor -> run supabase/migrations/20261013000000_stock_notify_whatsapp.sql (REQUIRED, once).
3. Test: open an out-of-stock product -> Notify me with email and/or WhatsApp number.
4. Admin -> Restock Alerts: signups per product.
   - Email: sent automatically when stock goes 0 -> positive, or via "Notify now".
   - WhatsApp: tap the green WhatsApp button on a row (opens WhatsApp with the message ready; row is marked done).
