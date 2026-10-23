import Link from 'next/link';
import type { Metadata } from 'next';
import { Mail, Phone, MapPin, Clock } from 'lucide-react';
import { getServerSupabase } from '@/lib/supabase-server';
import ContactForm from '@/components/contact-form';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Contact Us',
  description: 'Get in touch with AruhiHandlooms — questions about orders, products, or anything else.',
  alternates: { canonical: '/contact' },
};

async function getStoreInfo() {
  const supabase = getServerSupabase();
  const { data } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'store_info')
    .maybeSingle();
  return (data?.value as any) || {};
}

export default async function ContactPage({
  searchParams,
}: {
  searchParams?: { subject?: string; message?: string };
}) {
  const store = await getStoreInfo();

  return (
    <div className="container-boutique max-w-5xl py-10 sm:py-14">
      <nav className="mb-6 text-xs text-muted-foreground">
        <Link href="/" className="hover:text-primary">Home</Link>
        <span className="mx-1">/</span>
        <span className="text-foreground">Contact Us</span>
      </nav>

      <div className="mb-10 text-center sm:mb-14">
        <h1 className="font-serif text-3xl font-bold text-primary sm:text-4xl">Get in Touch</h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground">
          Questions about an order, a product, or anything else? Send us a message and our
          team will get back to you soon.
        </p>
      </div>

      <div className="grid gap-10 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <div className="grid gap-6 rounded-lg border border-border/60 bg-card p-6">
            {store.support_email && (
              <div className="flex items-start gap-3">
                <span className="rounded-full bg-primary/10 p-2 text-primary">
                  <Mail className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-medium">Email</p>
                  <a href={`mailto:${store.support_email}`} className="text-sm text-muted-foreground hover:text-primary">
                    {store.support_email}
                  </a>
                </div>
              </div>
            )}
            {store.support_phone && (
              <div className="flex items-start gap-3">
                <span className="rounded-full bg-primary/10 p-2 text-primary">
                  <Phone className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-medium">Phone</p>
                  <a href={`tel:${store.support_phone}`} className="text-sm text-muted-foreground hover:text-primary">
                    {store.support_phone}
                  </a>
                </div>
              </div>
            )}
            {store.address && (
              <div className="flex items-start gap-3">
                <span className="rounded-full bg-primary/10 p-2 text-primary">
                  <MapPin className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-medium">Address</p>
                  <p className="text-sm text-muted-foreground">{store.address}</p>
                </div>
              </div>
            )}
            <div className="flex items-start gap-3">
              <span className="rounded-full bg-primary/10 p-2 text-primary">
                <Clock className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-medium">Hours</p>
                <p className="text-sm text-muted-foreground">Mon–Sat, 10am–7pm IST</p>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-3">
          <ContactForm initialSubject={searchParams?.subject} initialMessage={searchParams?.message} />
        </div>
      </div>
    </div>
  );
}
