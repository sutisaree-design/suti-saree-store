import { Metadata } from 'next';
import { ProductsProvider } from '@/lib/cart-context';

export const metadata: Metadata = {
  title: 'Admin Panel',
  description: 'Manage products, inventory, and orders.',
  robots: { index: false, follow: false },
};

// Several admin panels (products, categories, variants, blog) need the full
// catalog. Admin is low-traffic/internal, so wrapping the whole section here
// is simpler and safe compared to wrapping each panel individually — and it's
// the only place left that needs the heavy ProductsProvider mounted broadly,
// now that it's off the root layout.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <ProductsProvider>{children}</ProductsProvider>;
}
