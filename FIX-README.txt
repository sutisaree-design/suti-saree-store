FIX — Mobile back-button popup checkout pe nahi dikh raha tha
=================================================================

Sirf 1 file: components/growth/exit-intent-modal.tsx

KYA GALAT THA
==============
Pehle wale code mein back-button "listener" sirf tab attach hota tha
jab dummy history entry pehli baar push ki jaati thi (TRAP_KEY se
gated). Ye dummy entry sirf ek baar poori session/tab mein banti thi —
matlab agar visitor home ya product page se browsing shuru karta,
listener sirf wahin attach hota. Jab wo checkout tak pahunchta
(product -> cart -> checkout, kai page navigations ke baad), naya
listener attach hi nahi hota tha, isliye back button kaam nahi kar
raha tha checkout pe.

FIX
====
Ab back-button listener HAR page pe (checkout samet) dobara attach
hota hai. Dummy history entry ab bhi sirf ek baar per tab banti hai
(sirf pehle back-press ke liye jab tak koi real internal navigation na
ho), lekin listener khud har page pe fresh lagta hai — jaise hi
visitor checkout se back dabata hai (jo real navigation hai, cart ki
taraf), listener use turant catch kar leta hai.

APPLY KAISE KAREIN
===================
1. File ko apne repo mein SAME PATH pe replace karo:
     components/growth/exit-intent-modal.tsx

2. Terminal:
     git add components/growth/exit-intent-modal.tsx
     git commit -m "fix: re-attach mobile back-button exit-intent listener on every page (was breaking on checkout)"
     git push

TEST KAISE KAREIN
==================
Real phone (ya Chrome DevTools mobile emulation) se:
  1. Home ya kisi product page se shuru karo
  2. Cart mein jao, phir Checkout pe jao (real navigation hona zaroori hai)
  3. 4+ second wait karo
  4. Phone ka back button/gesture dabao
  5. Popup dikhna chahiye

Verified: npx tsc --noEmit clean pass hua.
