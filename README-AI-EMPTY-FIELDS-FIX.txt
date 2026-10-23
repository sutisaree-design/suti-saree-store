BUG FIX: Vendor se naya product list karne par AI fields khaali reh jaate the
================================================================================

ROOT CAUSE
----------
File: app/vendor/dashboard/products/add-product/page.tsx

Jab vendor "Edit Product" se koi existing product edit karta hai, code
sahi se `triggerVendorAIProcess()` call karta hai jo background me AI
ko chalata hai aur description, origin, occasion tags, colors, Product
Highlights waghera fill karta hai (file: edit-product/[id]/page.tsx,
line 135).

Lekin jab vendor NAYA product add karta hai (add-product/page.tsx), yeh
call file me kahin thi hi nahi! Product `pending_review` status me
create hoke wahi phasa reh jaata tha — AI kabhi trigger hi nahi hota
tha.

10 minute baad, ek safety-net job (lib/cron-jobs.ts ->
runStuckVendorListingsJob, jo product list load hone par inline chalta
hai) kisi bhi product ko jo 10+ min se pending_review me phasa ho, use
force-publish kar deta hai taaki vendor ka product hamesha ke liye
atka na rahe — lekin AI kabhi chala hi nahi tha, isliye description,
colors, occasion, highlights sab khaali reh jaate the. Yehi wajah thi
"10 min me live ho jaata hai lekin sab box khaali" wale issue ki.

FIX
---
add-product/page.tsx me `triggerVendorAIProcess(created.id)` ka call
add kiya (submitVendorProduct() ke turant baad, fire-and-forget —
exactly jaisa edit-product page pehle se karta hai).

FILES IN THIS ZIP
-----------------
  app/vendor/dashboard/products/add-product/page.tsx   <- the actual fix

IMPORTANT — ISE BHI ZAROOR CHECK KARO
--------------------------------------
Yeh fix sirf tabhi kaam karega jab NVIDIA_API_KEY environment variable
Vercel Production me set ho (Project Settings > Environment Variables).
Agar wo key missing hai ya sirf Preview/Development me set hai, to
generateVendorListing() chup-chaap null return karta hai (koi error
nahi dikhta) aur product phir se sirf basic fields ke saath publish
ho jaayega. Please Vercel dashboard me confirm kar lo ki
NVIDIA_API_KEY Production env me hai.

HOW TO APPLY
------------
1. Is zip ka file apne local repo me isi path pe copy-overwrite karo:
   app/vendor/dashboard/products/add-product/page.tsx
2. git add -A
3. git commit -m "fix: trigger AI enrichment when vendor adds a new product"
4. git push
5. Vercel me NVIDIA_API_KEY (Production) check karo.

TESTING
-------
Fix ke baad ek naya test product vendor dashboard se add karo — ~30-50
seconds ke andar hi (10 min wait kiye bina) description, origin,
occasion tags, colors, Product Highlights sab admin panel me apne aap
bhar jaane chahiye, aur product turant 'live' status me chala jaayega
(AI ke saath), stuck-listing fallback trigger hone se pehle hi.

Purane products jo already khaali gaye hain (jaise "Handloom Saree"
jisme sab khaali hai) is fix se retroactively theek nahi honge — un
ko Edit Product khol ke chota sa change (jaise fabric field re-save)
karke save karo, wo AI ko dobara trigger kar dega.
