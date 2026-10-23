/**
 * Safely serialize a JSON-LD object for embedding inside a
 * <script type="application/ld+json"> tag via dangerouslySetInnerHTML.
 *
 * Why this exists: JSON.stringify() does NOT escape "<", so if any
 * dynamic field (product description, blog title/excerpt, category
 * name, etc.) ever contains the literal string "</script>", it closes
 * the JSON-LD <script> tag early and lets whatever follows run as real
 * HTML/JS on the page -- a stored XSS vector. Escaping "<" to its
 * unicode escape neutralizes that while staying valid inside a JSON
 * string (unicode escapes are decoded identically by JSON.parse and by
 * any structured-data parser Google/crawlers use).
 */
export function safeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
