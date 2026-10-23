-- Adds a structured FAQ list to each blog post, so long-form posts can end
-- with a Q&A section (matches "People Also Ask" search intent) and emit a
-- real FAQPage JSON-LD block for rich-result eligibility in Google Search.
-- Stored as jsonb (array of {question, answer}) rather than two parallel
-- text[] columns, since it's read/written as a single unit by the admin
-- panel and the AI generator, never queried column-by-column.

ALTER TABLE blog_posts
  ADD COLUMN IF NOT EXISTS faqs jsonb NOT NULL DEFAULT '[]';
