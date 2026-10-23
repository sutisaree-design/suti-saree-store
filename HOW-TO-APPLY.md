# Notification bell — poora update

⚠️ Ye zip **pichhle "review-notifications-changes.zip" ki jagah** hai — usme
jo review-notification wala change tha, wahi is zip ki files me already
shaamil hai, plus ab vendor/reseller/affiliate bhi add ho gaye hain. Agar
pichhla zip already apply kar chuke ho to bhi koi dikkat nahi, bas in
naye files se overwrite kar dena.

Files:
- `app/api/admin/notifications/route.ts`
- `components/admin/notification-bell.tsx`

## Ab notification bell me kya-kya aayega

| Event | Kab dikhega | Title |
|---|---|---|
| Naya review/rating | submit hote hi | "New review received" / "New rating received" |
| Naya vendor apply kare | jab tak Approve/Reject na ho (Pending Applications) | "New vendor application" |
| Naya reseller join kare | signup hote hi (auto-active) | "New reseller joined" |
| Naya affiliate join kare | signup hote hi (auto-approved) | "New affiliate joined" |

Har notification pe click karte hi seedha uska admin section khul jaata
hai (Reviews / Vendors / Resellers / Affiliates) — jaisa "Cart abandoned"
click par Abandoned Carts khulta hai, waisa hi.

### Zaroori farak: "pending action" vs "sirf info"
- **Vendor application** ek real pending queue hai (jab tak Approve/Reject
  na ho, wahi status rehta hai) — isliye ye tab tak notification me
  dikhta rahega jab tak admin usko Approve/Reject nahi karta (Vendors
  panel me).
- **Reseller** aur **Affiliate** dono currently **auto-approve** ho jaate
  hain signup karte hi (koi pending state hai hi nahi is code me) —
  isliye inke liye sirf "latest 5 naye signup" dikhaye jaate hain, taaki
  bell hamesha bhara na rahe. Agar future me inke liye bhi ek "pending —
  admin approval chahiye" wala step chahiye, wo alag se banana padega
  (abhi scope me nahi tha).

## Apply kaise karein
1. Dono files apne local repo me isi path par replace kar dein
   (`app/api/admin/notifications/route.ts` aur
   `components/admin/notification-bell.tsx`).
2. `git add -A && git commit -m "admin: notify on new reviews, vendor applications, resellers, affiliates" && git push`
3. Deploy karke bell check karein.

`CHANGES.diff` me original code se poora exact diff diya hai reference ke
liye.
