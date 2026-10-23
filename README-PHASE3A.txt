Phase 3A — sirf changed/naye files (existing kisi file ko touch nahi kiya)

1. NAYI FILE (copy karo, same path pe):
   supabase/migrations/20260805000000_phase3a_order_fulfillment_safety.sql

2. NAYI FILE (copy karo, same path pe):
   app/api/cron/vendor-order-timeout/route.ts

3. MODIFIED FILE (apni existing vercel.json me sirf ye naya cron entry
   add karna — poori file replace mat karna agar usme aur cheez bhi hain,
   sirf "crons" array me ye ek object add kar dena):
   {
     "path": "/api/cron/vendor-order-timeout",
     "schedule": "0 * * * *"
   }
   (poori reference vercel.json bhi is zip me di hai dekhne ke liye)

Migration apply karne ke baad Supabase SQL editor me ya
`supabase db push` se, aur push karne ke baad, Vercel env vars me
CRON_SECRET already set hai to naya cron automatically kaam karega.
