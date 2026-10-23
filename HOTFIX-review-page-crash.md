# Hotfix — /review/[token] "Application error" crash

## Bug
`app/review/[token]/page.tsx` React's `use()` hook laga kar `params` ko
unwrap kar raha tha, jaise Next.js 15 me karte hain (jahan route params
ek Promise hote hain). Lekin yeh repo **Next.js 13.5.1** use karta hai,
jaha route params seedha ek plain object hota hai, Promise nahi. `use()`
ko kisi non-Promise value par call karne se React turant client-side
exception throw karta hai -- yahi wo crash tha jo aapke screenshot me
dikha ("Application error: a client-side exception has occurred").

## Fix
- `import { use, useEffect, useState } from 'react';` → `import { useEffect, useState } from 'react';`
- `export default function ReviewLinkPage({ params }: { params: Promise<{ token: string }> }) { const { token } = use(params); }`
  → `export default function ReviewLinkPage({ params }: { params: { token: string } }) { const { token } = params; }`

Baaki poora page (star picker, photo upload, reward banner, error state)
bilkul waisa hi hai — sirf yeh params-unwrapping wala bug fix hua hai.

## Apply karne ka tareeka
1. `app/review/[token]/page.tsx` ko is zip wali file se REPLACE karo.
2. `git add -A && git commit -m "fix: review page crash (Next 13 params, not a Promise)" && git push`
3. Deploy hone do.

## Verify kiya
- `npx tsc --noEmit` — 0 errors (fresh clone + fresh `npm install` par
  chala kar confirm kiya).
- Repo me kahi aur `use(params)` ya Next-15-style async-params pattern
  nahi mila — yeh crash sirf isi ek file me tha.
