-- Blog posts, manageable from Admin > Blog. Mirrors the existing
-- `categories` table's RLS shape (anon/authenticated full access) since
-- this app's admin panel runs entirely on the browser Supabase client and
-- gates write access at the app/route level, not at the DB role level --
-- same model already used for products/categories/collections.
--
-- Public storefront pages only ever read rows where `published = true`
-- (enforced in the query, not RLS, again matching how `approval_status`
-- is filtered on `products` elsewhere in this schema).

CREATE TABLE IF NOT EXISTS blog_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  title text NOT NULL,
  excerpt text NOT NULL DEFAULT '',
  keywords text[] NOT NULL DEFAULT '{}',
  cover_image text NOT NULL DEFAULT '',
  body_paragraphs text[] NOT NULL DEFAULT '{}',
  read_minutes integer NOT NULL DEFAULT 5,
  related_category_name text,
  published boolean NOT NULL DEFAULT true,
  published_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS blog_posts_published_idx ON blog_posts (published, published_at DESC);

ALTER TABLE blog_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_blog_posts" ON blog_posts;
CREATE POLICY "anon_select_blog_posts" ON blog_posts FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_blog_posts" ON blog_posts;
CREATE POLICY "anon_insert_blog_posts" ON blog_posts FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_blog_posts" ON blog_posts;
CREATE POLICY "anon_update_blog_posts" ON blog_posts FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_blog_posts" ON blog_posts;
CREATE POLICY "anon_delete_blog_posts" ON blog_posts FOR DELETE
  TO anon, authenticated USING (true);

-- Seed the 3 articles that were previously hardcoded in lib/blog-data.ts,
-- so nothing on the live /blog pages disappears when this migration runs.
INSERT INTO blog_posts (slug, title, excerpt, keywords, cover_image, body_paragraphs, read_minutes, related_category_name, published, published_at)
VALUES
(
  'how-to-wear-a-banarasi-saree',
  'How to Wear a Banarasi Saree: A Step-by-Step Guide',
  'From pleating to pallu, here is a simple, no-fuss guide to draping a Banarasi saree so it looks effortless for weddings, festivals, or any special occasion.',
  ARRAY['banarasi saree kaise pehnein', 'how to wear banarasi saree', 'saree draping guide'],
  'https://images.pexels.com/photos/1191349/pexels-photo-1191349.jpeg?auto=compress&cs=tinysrgb&w=1200&h=630&fit=crop',
  ARRAY[
    'A Banarasi saree is one of the most richly woven textiles in India, known for its gold and silver zari work, intricate brocade patterns, and heavy silk base. Because the fabric carries so much detail on its own, the way you drape it matters just as much as the saree itself — a clean, well-pleated drape lets the weave shine, while a rushed one can hide it under folds.',
    'Start with the right blouse and petticoat. Banarasi silk is heavier than cotton or georgette, so a well-fitted, slightly structured blouse and a firm petticoat tied snugly at the natural waist will hold the pleats in place through a long wedding day or festival evening.',
    'Tuck the plain end of the saree into the petticoat at your right hip and wrap it once around your waist, keeping the lower edge parallel to the floor. This first wrap sets the base — take a moment here, since an uneven base throws off every pleat that follows.',
    'Make 5 to 7 pleats of equal width, about 5 inches each, holding them together and tucking them in at the center, just left of the navel, so they fall in a neat vertical line down the front. For a Banarasi, slightly wider pleats than usual work better since they show off the border and buttis rather than crushing them.',
    'Bring the remaining fabric around your back and over the left shoulder to form the pallu. Banarasi pallus are often the most heavily worked part of the saree, so let it fall naturally rather than pleating it tightly — a single soft pleat pinned at the shoulder is usually enough to show the full pattern.',
    'Finish with a safety pin at the shoulder and one at the waist pleats to keep everything in place for the day. Pair with statement jhumkas or a simple gold necklace — Banarasi weaves are detailed enough that they rarely need heavy layering elsewhere.',
    'If you are draping one for the first time, practice a day or two before the event. Once you have the pleats down, a Banarasi saree drapes beautifully and holds its shape for hours, which is exactly why it remains a go-to choice for weddings and festive occasions across India.'
  ],
  6,
  'Silk Sarees',
  true,
  '2026-07-01'
),
(
  'lehenga-vs-saree-for-wedding',
  'Lehenga vs Saree for a Wedding: Which Should You Choose?',
  'Both are timeless, but they suit different moments, body types, and comfort levels. Here is how to decide between a lehenga and a saree for your next wedding function.',
  ARRAY['lehenga vs saree for wedding', 'what to wear to indian wedding', 'wedding outfit guide'],
  'https://images.pexels.com/photos/2058197/pexels-photo-2058197.jpeg?auto=compress&cs=tinysrgb&w=1200&h=630&fit=crop',
  ARRAY[
    'Choosing between a lehenga and a saree for a wedding usually comes down to three things: the specific function you are attending, how much movement you need through the evening, and how comfortable you are with draping versus a stitched outfit.',
    'A lehenga is generally the easier choice for high-energy functions like sangeet or a dance-heavy reception. It is stitched and pre-fitted, so there is no drape to manage while dancing, and the flared silhouette photographs beautifully in motion. It also tends to be more forgiving if you are still building confidence with saree draping.',
    'A saree, on the other hand, is often the stronger choice for the wedding ceremony itself or more traditional functions — it carries a certain gravitas that a lehenga does not always have, especially in silk weaves like Banarasi or Kanjivaram which are closely tied to ceremonial dressing across Indian culture.',
    'Body type and comfort matter too. A well-draped saree can flatter almost any body type since the drape itself is adjustable in real time, while a lehenga fit is fixed once stitched, so getting accurate measurements matters more.',
    'Budget and reuse are worth factoring in as well. A good silk saree tends to be more versatile after the wedding — the same piece works for other festive occasions with a change of blouse — while an ornate bridal lehenga is usually a one-occasion piece.',
    'If you are still unsure, a simple rule of thumb: choose a lehenga for functions where you will be dancing or standing for long stretches, and a saree for the more formal, ceremonial parts of the wedding. Many people end up owning both for exactly this reason.'
  ],
  5,
  'Lehenga',
  true,
  '2026-07-08'
),
(
  'silk-saree-care-tips',
  'Silk Saree Care Tips: How to Store, Wash and Preserve Your Sarees',
  'Silk sarees are an investment piece. A few simple care habits — from storage to stain handling — will keep the fabric and zari work looking new for decades.',
  ARRAY['silk saree care tips', 'how to store silk saree', 'saree maintenance guide'],
  'https://images.pexels.com/photos/8839887/pexels-photo-8839887.jpeg?auto=compress&cs=tinysrgb&w=1200&h=630&fit=crop',
  ARRAY[
    'A good silk saree, especially one with real zari work, is meant to last generations if it is cared for properly. Most damage to silk sarees happens not from wear but from poor storage and washing — both of which are easy to get right once you know the basics.',
    'Always dry clean silk sarees rather than washing them at home, particularly ones with zari, embroidery, or heavy borders. Home washing can cause the silk fibers to weaken and the zari to tarnish or bleed color into the fabric. If a saree is plain silk with no metallic thread, a gentle hand wash in cold water with a mild, silk-safe detergent is usually safe — but always check first.',
    'Never store silk in plastic bags. Plastic traps moisture and does not let the fabric breathe, which over time causes yellowing and a musty smell. Instead, wrap each saree in a soft, breathable cotton or muslin cloth before placing it in your cupboard.',
    'Refold your sarees every few months along different lines. Keeping a saree folded in the exact same place for years causes permanent creases and can eventually weaken the fabric at the fold lines — silk especially tends to develop visible wear where it is folded repeatedly.',
    'Keep silk away from direct sunlight and humidity. Store sarees in a cool, dry, dark part of the wardrobe, and if you live somewhere humid, add a few silica gel packets or neem leaves to the storage area — neem is a traditional, natural way to keep silverfish and moths away from silk and zari.',
    'Handle stains immediately but carefully. Blot rather than rub, and avoid using water directly on zari or embroidered areas. For anything beyond a light surface mark, it is safer to take the saree to a professional who specifically handles zari and silk rather than risk it at home.',
    'With the right storage and the occasional professional clean, a well-made silk saree — Banarasi, Kanjivaram, or otherwise — genuinely can be worn and handed down for decades, which is part of what makes it worth the investment in the first place.'
  ],
  5,
  'Silk Sarees',
  true,
  '2026-07-15'
)
ON CONFLICT (slug) DO NOTHING;
