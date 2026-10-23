# ✅ Deployment Checklist

## Pre-Deployment

- [ ] Extracted ZIP file successfully
- [ ] All 5 files copied to correct locations:
  - [ ] `lib/popularity-rank-server.ts` exists
  - [ ] `app/shop/page.tsx` updated
  - [ ] `app/shop/shop-content.tsx` updated
  - [ ] `app/category/[slug]/page.tsx` updated
  - [ ] `components/category/category-toolbar-grid.tsx` updated

## Build & Local Testing

- [ ] `npm install` (if needed)
- [ ] `npm run build` succeeds with no errors
- [ ] `npm run dev` starts successfully
- [ ] No console errors on startup

## Functionality Testing

- [ ] Visit `/shop` page
  - [ ] Products appear in popularity order immediately
  - [ ] No visual shift after 1-2 seconds
  - [ ] Sort dropdown works correctly
  - [ ] Filters still work

- [ ] Visit `/category/sarees` (or any category)
  - [ ] Products in popularity order on initial load
  - [ ] No shifting or re-rendering
  - [ ] Mobile view looks good

- [ ] Test on different browsers
  - [ ] Chrome
  - [ ] Firefox
  - [ ] Safari
  - [ ] Mobile Safari

## Performance Check

- [ ] Page load time is same or better
- [ ] No unnecessary API calls
- [ ] Browser DevTools shows clean network tab
- [ ] Lighthouse score maintained or improved

## Git Deployment

- [ ] `git status` shows expected changes
- [ ] `git diff` looks correct
- [ ] `git commit -m "feat: show most-viewed products first on initial load"`
- [ ] `git push origin main` succeeds
- [ ] CI/CD pipeline passes (if applicable)

## Post-Deployment

- [ ] Verify changes live on production
- [ ] Monitor error logs for any issues
- [ ] Check if products rank correctly on live site
- [ ] Ask team for feedback

---

**Deployment by:** [Your Name]
**Date:** [Current Date]
**Status:** ☐ Not Started | ☐ In Progress | ☐ Complete
