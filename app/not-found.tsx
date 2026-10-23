import Link from 'next/link';
import { Compass, Home, ShoppingBag } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="container-boutique flex min-h-[60vh] flex-col items-center justify-center py-16 text-center">
      <Compass className="h-14 w-14 text-secondary" strokeWidth={1.5} />
      <p className="mt-4 font-serif text-6xl font-bold text-primary">404</p>
      <h1 className="mt-2 font-serif text-2xl font-bold text-primary sm:text-3xl">
        This page has wandered off
      </h1>
      <p className="mt-3 max-w-md text-sm text-muted-foreground">
        The page you&apos;re looking for doesn&apos;t exist or may have been moved. Let&apos;s
        get you back to browsing our collection.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Button asChild className="gap-2 bg-primary">
          <Link href="/">
            <Home className="h-4 w-4" />
            Back to Home
          </Link>
        </Button>
        <Button asChild variant="outline" className="gap-2">
          <Link href="/shop">
            <ShoppingBag className="h-4 w-4" />
            Continue Shopping
          </Link>
        </Button>
      </div>
    </div>
  );
}
