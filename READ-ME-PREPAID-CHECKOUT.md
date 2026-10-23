# Prepaid-first Premium Checkout — kya badla

## Files (same path pe replace karo)
- `app/checkout/page.tsx`  (replace)
- `components/checkout/payment-method-selector.tsx`  (NAYI file)

> Pehle `git pull` kar lo. Agar local `checkout/page.tsx` me tumne GitHub ke baad aur changes kiye hain,
> to file replace mat karo — `git apply prepaid-checkout.patch` chalao (sirf 4 chhote hunks hain).

## Kya change hua
1. **Prepaid default selected + sabse upar.** Product page pe "Get this at ₹2,827 via online payment"
   dikhta hai, ab checkout me bhi wahi price khulta hai — price jump nahi hota.
2. **Premium selector**: selected card pe maroon border + glow + tick, "Recommended · Save ₹118" pill,
   dono options pe unka **exact final amount** (₹2,827 / ₹2,945) dikhta hai.
3. **Prepaid benefits (hamesha visible)**: Dispatched first · Reaches you sooner · Instant confirmation.
4. **COD select karne par** amber note aata hai (verification + prepaid ke baad dispatch) aur
   "Switch to online payment & save ₹118" button.
5. Button: "Pay securely — ₹X". COD button same rahega.
6. Reseller orders me saving UI hide hota hai (unka payable price fixed hota hai).

## Copy badalna ho
`components/checkout/payment-method-selector.tsx` ke top me `PAYMENT_COPY` object hai.

## Google (GMC / GSC / Ads) safety checklist
- **Feed/structured data me normal selling price hi rakho** (prepaid-discount wala price nahi). Tumhare code me ye already aisa hi hai.
- Discount checkout me alag line item ("Online payment discount") ke roop me dikhta rehta hai — chhupa nahi.
- COD hide/disable mat karo, dono options barabar clickable aur dono ka price visible.
- **Jo claim kar rahe ho wo sach hona chahiye**: "prepaid pehle dispatch" tabhi likho jab aap sach me prepaid orders ko pehle pack/ship karte ho.
  Fixed days ("2 din me delivery") promise mat karo.
- Same baat **Shipping Policy page** par bhi likho (neeche `SHIPPING-POLICY-SNIPPET.md`). Google policy page aur checkout ka mismatch pakadta hai.
- Deploy ke baad 1-2 hafte GMC → Products → Diagnostics me "Mismatched value (page crawl)" / price errors dekhte raho.
  Agar price mismatch aaye to bataiye, main solution dunga.
