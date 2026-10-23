WhatsApp "Request Online Payment" button
=========================================
Changed file (replace karo, same path pe):
  components/admin/orders-panel.tsx

Kya add hua:
  - Admin > Orders me jin orders pe "Request Online Payment" ho chuka hai aur
    payment pending hai ("was COD" badge wale), unpe green "Send on WhatsApp"
    button aata hai (Payment column me + View kholne par yellow Payment
    breakdown box me).
  - Click karte hi WhatsApp customer ki chat me ready message ke saath khulta
    hai (amount, discount, /checkout/resume/<order id> payment link).
    Bas Send dabana hai.

Message ka wording badalna ho: orders-panel.tsx me buildPaymentWhatsAppUrl()
function ke andar `lines` array edit karo.

Koi DB migration / env change / naya package nahi chahiye.
(NEXT_PUBLIC_SITE_URL wahi use hota hai jo email me hota hai.)

Git push:
  git add components/admin/orders-panel.tsx
  git commit -m "Add WhatsApp button for online payment request"
  git push
