# Partial / Split Shipment — kaise apply karein

1. Zip ke files apne repo me same path par REPLACE karo (naye files add honge).
2. **Supabase SQL Editor me run karo:** `supabase/migrations/20261013000000_partial_shipments.sql`
   (naya table `order_shipments` banata hai aur purane shipped orders ko Parcel 1 bana deta hai).
3. `git add . && git commit && git push` — Vercel deploy ho jayega.

## Use kaise karein
- Admin > Orders > order me **Create Shipment** dabao. Popup me ab "Items in this parcel" list dikhegi.
- Jo items abhi bhejne hain unhe tick rakho, baaki untick karo. "Next lot in 4 to 7 days" apne hisaab se badal sakte ho.
- COD order me har parcel ka cash apne aap item value ke hisaab se split hota hai (edit bhi kar sakte ho). Aakhri parcel me bacha hua balance aata hai.
- **Ship selected items** dabao. Customer ko turant email jaata hai (is parcel ke items + baaki items + "4-7 din me next lot"). Toast me **Send on WhatsApp** button aata hai, uspe click karke WhatsApp message bhej do.
- Baad me wahi order me **Ship remaining items** button se doosra parcel banao (alag AWB). Customer ko phir email + WhatsApp jaayega.
- Customer `/track/<orderid>` aur Account > Orders me har parcel ka alag live tracking dekhta hai, aur "baaki items kab tak aayenge" ka notice.
- Cron har parcel ko alag track karta hai. Order "delivered" tab hota hai jab saare items ship ho jayein aur saare parcels deliver ho jayein. Beech me har parcel ka out-for-delivery / delivered email jaata hai.

## Notes
- Normal (single parcel) orders ka flow bilkul pehle jaisa hai.
- `orders.tracking_number` pehle parcel ka AWB rehta hai, isliye vendor dashboard / returns / invoice nahi tootte.
- Ek item line (jaise qty 2) ko ek hi parcel me bheja jaata hai; line ko beech se todna abhi supported nahi.
