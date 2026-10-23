import { Camera, CheckCircle2 } from 'lucide-react';

const CHECKLIST = [
  {
    title: 'White / plain background',
    detail: 'Lay flat or hang the item against a clean white or neutral surface — no clutter, no busy patterns behind it.',
  },
  {
    title: '3 full-product angles',
    detail: 'Front, back, and a 3/4 angle — so we can see the full drape, border, and pallu/hemline clearly.',
  },
  {
    title: '1 close-up of the fabric texture',
    detail: 'A tight shot of the weave, print, or embroidery — this is what customers zoom into most before buying.',
  },
] as const;

/** Static reference checklist shown alongside the vendor add-product
 *  form. Purely informational — no state, no props. */
export default function PhotographyGuidelines() {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 p-5">
      <div className="flex items-center gap-2">
        <Camera className="h-4 w-4 text-primary" />
        <p className="font-serif text-base font-semibold text-primary">Photo Guidelines</p>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Follow this before uploading — good photos get reviewed and approved faster.
      </p>
      <ul className="mt-4 space-y-3">
        {CHECKLIST.map((item) => (
          <li key={item.title} className="flex gap-2.5">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-secondary" />
            <div>
              <p className="text-sm font-medium text-foreground">{item.title}</p>
              <p className="text-xs text-muted-foreground">{item.detail}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
