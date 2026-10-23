import { Star } from 'lucide-react';

interface ReviewQuoteData {
  name: string;
  rating: number;
  comment: string;
  product: string;
}

/** Renders a real, approved customer review as a styled blockquote inside
 *  a blog post — the social-proof beat the AI generator embeds via a
 *  {{review:<base64 json>}} marker (see app/api/admin/generate-blog-post).
 *  Purely presentational: the data was already validated/base64-encoded
 *  server-side at generation time, so this just trusts and renders it. */
export default function BlogReviewQuote({ review }: { review: ReviewQuoteData }) {
  const rating = Math.max(1, Math.min(5, Math.round(review.rating || 5)));

  return (
    <blockquote className="not-prose my-6 rounded-2xl border border-border bg-muted/30 p-5 sm:p-6">
      <div className="flex items-center gap-0.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star
            key={i}
            className={`h-4 w-4 ${i < rating ? 'fill-secondary text-secondary' : 'text-muted-foreground/30'}`}
          />
        ))}
      </div>
      <p className="mt-3 font-serif text-base italic leading-relaxed text-foreground/90 sm:text-lg">
        &ldquo;{review.comment}&rdquo;
      </p>
      <footer className="mt-3 text-sm text-muted-foreground">
        — {review.name}, on {review.product}
      </footer>
    </blockquote>
  );
}
