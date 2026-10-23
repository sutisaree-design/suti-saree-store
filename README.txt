ISR WRITES FIX - sirf 6 files (har ek me sirf `export const revalidate` badla hai)

Apne project folder (C:\Users\bapan\E-Commerce-ethnic) me is zip ko extract karke
"Replace" kar do (folder structure same hai: app/...).
Phir:  git add . && git commit -m "reduce ISR writes" && git push

Agar aapke local me in files me apne alag changes hain to zip ki jagah patch use karo:
  git apply isr-fix.patch
