MOBILE EXIT-INTENT — same popup, mobile-friendly triggers
============================================================

Sirf 1 file change hui hai:
  components/growth/exit-intent-modal.tsx

Koi naya admin toggle NAHI chahiye — same "Exit-intent discount popup"
switch (Admin > Marketing > Growth Tools) ab desktop AUR mobile dono pe
kaam karega.

KYA ADD HUA
============
Mobile pe mouse cursor nahi hota, isliye 2 naye signals add kiye:

1. BACK-BUTTON INTERCEPT (primary signal)
   Page load ke 4 second baad, ek "dummy" history entry push ki jaati hai.
   Jab visitor pehli baar back button/gesture dabata hai, browser use
   dummy entry pe le jaata hai (page nahi chhodta) — usi waqt popup dikha
   dete hain. Agle back press se wo normally page se bahar chala jayega.
   Ye sirf ek baar per tab-session hota hai, taaki har page pe back button
   ajeeb na lage.

2. FAST UPWARD SCROLL (backup signal)
   Agar visitor page ke top ke paas (top se 250px ke andar) tezi se upar
   scroll/swipe karta hai (200ms ke andar 120px se zyada upar), ye wahi
   "chhod ke jaane wala" gesture hai jo desktop pe mouse upar jaane se
   detect hota tha — mobile pe swipe se detect karte hain.

Dono signals sirf tab active hote hain jab settings.exit_intent_enabled
ON ho aur visitor cooldown (24 hours) mein na ho — bilkul wahi rule jo
desktop wale trigger pe pehle se hai.


APPLY KAISE KAREIN
===================
1. Is file ko apne repo mein SAME PATH pe copy-paste karke replace karo:
     components/growth/exit-intent-modal.tsx

2. Terminal mein:
     git add components/growth/exit-intent-modal.tsx
     git commit -m "feat: mobile triggers for exit-intent popup (back-button + fast scroll-up)"
     git push

3. Deploy hone ke baad, Admin > Marketing > Growth Tools mein
   "Exit-intent discount popup" switch already ON hai to kuch aur nahi
   karna. Agar OFF hai to ON karke Save karo.


MOBILE PE TEST KAISE KAREIN
=============================
Chrome DevTools se: F12 > Toggle device toolbar (Ctrl+Shift+M) > koi
mobile device chuno (jaise iPhone 14) > product page kholo > 4+ second
wait karo > phone ke "back" (browser back button / Alt+Left) dabao —
popup khulna chahiye.

Real phone pe: product page kholo, 4+ second ruko, phir back gesture/
button dabao (ya top ki taraf tezi se swipe/scroll karo) — popup dikhna
chahiye.

Verified: npx tsc --noEmit clean pass hua is change ke saath.
