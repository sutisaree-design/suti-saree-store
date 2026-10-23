import { Heart } from 'lucide-react';
import Link from 'next/link';
import { getSupabaseServer, getCurrentUser } from '@/lib/supabase-server-auth';
import ProductCard from '@/components/product-card';
import type { Product, ProductRow } from '@/lib/types';

function mapRow(row: ProductRow): Product {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    category: (row.category_name as Product['category']) ?? 'Silk Sarees',
    price: row.price,
    mrp: row.mrp,
    description: row.description ?? '',
    fabric: row.fabric ?? '',
    origin: row.origin ?? '',
    colors: row.colors ?? [],
    sizes: row.sizes ?? [],
    occasion: row.occasion ?? [],
    gender: row.gender || 'female',
    age_group: row.age_group || 'adult',
    material: row.material ?? null,
    pattern: row.pattern ?? null,
    images: row.images ?? [],
    rating: row.rating,
    reviews: row.reviews,
    featured: row.featured,
    stock_quantity: row.stock_quantity,
    inStock: row.in_stock,
    created_at: row.created_at,
  };
}

export default async function WishlistPage() {
  const user = await getCurrentUser();
  const supabase = await getSupabaseServer();

  const { data } = await supabase
    .from('wishlist')
    .select('id, products(*)')
    .eq('user_id', user!.id)
    .order('created_at', { ascending: false });

  const products = (data ?? [])
    .map((row: any) => row.products)
    .filter(Boolean)
    .map(mapRow);

  return (
    <div>
      <h1 className="font-serif text-2xl font-bold text-primary">My Wishlist</h1>

      {products.length === 0 ? (
        <div className="mt-8 flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-center text-muted-foreground">
          <Heart className="h-10 w-10" />
          <p>Nothing saved yet.</p>
          <Link href="/shop" className="text-sm font-medium text-primary hover:underline">
            Browse the collection
          </Link>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </div>
  );
}
