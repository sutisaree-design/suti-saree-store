# Part 3b1 — Homepage Tiles admin panel (UI only)

Scope: admin screen only. No storefront grid yet (that's 3b2).

## Files in this zip

1. **components/admin/homepage-tiles-panel.tsx** — NEW FILE
   Copy this in as-is (new file, nothing to merge).
   - Table + modal-form, same layout style as `promotions-panel.tsx`.
   - Fields: title, subtitle, badge text, price label, image URL (with
     live preview), CTA label, Link type (Collection / Promotion / Custom
     URL) with a dependent dropdown, Active toggle.
   - Image is a plain URL field (not the crop-on-import pattern from
     `products-panel.tsx`, since that crop is product-photo specific).
   - Reorder: new up/down arrow buttons per row that swap position with
     the neighboring row and call `reorderHomepageTiles()` — optimistic
     UI update, falls back to a reload on failure.

2. **components/admin/admin-shell.tsx** — REPLACE (full file)
   Changes vs current repo version:
   - Added `LayoutGrid` to the lucide-react import.
   - Added `'homepage-tiles'` to the `AdminSection` union type.
   - Added a `{ value: 'homepage-tiles', label: 'Homepage Tiles', icon: LayoutGrid }`
     nav item under the "Marketing" group, right after Promotions.

3. **app/admin/page.tsx** — REPLACE (full file)
   Changes vs current repo version:
   - Added `import HomepageTilesPanel from '@/components/admin/homepage-tiles-panel';`
   - Added `'homepage-tiles': HomepageTilesPanel,` to the `PANELS` map.

## How to apply

Since these are full-file replacements (except the new file), just drop
all three into the matching paths in your repo, overwriting the two
existing ones.

```
components/admin/homepage-tiles-panel.tsx   (new)
components/admin/admin-shell.tsx            (replace)
app/admin/page.tsx                          (replace)
```

## Verify

1. `npm run dev`
2. Log into `/admin`, open the new **Homepage Tiles** item under the
   Marketing group in the sidebar.
3. Add a tile (try each link type — Collection, Promotion, Custom URL —
   and confirm the dependent dropdown/field switches correctly).
4. Edit it, toggle Active off/on, use the up/down arrows to reorder a
   few tiles, then delete one.
5. Confirm none of this touched `lib/home-data-server.ts`,
   `components/home/*`, or the storefront — that's Part 3b2.

## Commit

```
git add -A && git commit -m "Part 3b1: Homepage Tiles admin panel UI"
git push
```

Then move to Part 3b2 (storefront grid component + wiring into
`home-data-server.ts` / `home-client.tsx`).
