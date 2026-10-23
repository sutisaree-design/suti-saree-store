'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Instagram, Facebook, Youtube, Twitter, Linkedin, MessageCircle, Mail, Phone } from 'lucide-react';
import NewsletterSignup from './newsletter-signup';
import { useCart } from '@/lib/cart-context';
import { markCheckoutEntry } from '@/lib/checkout-return';
import { fetchSocialLinks, fetchStoreInfo, SocialLinks, StoreInfo } from '@/lib/settings-api';

export default function Footer() {
  const { clearBuyNow } = useCart();
  const [social, setSocial] = useState<SocialLinks | null>(null);
  const [store, setStore] = useState<StoreInfo | null>(null);

  useEffect(() => {
    fetchSocialLinks().then(setSocial).catch(() => {});
    fetchStoreInfo().then(setStore).catch(() => {});
  }, []);

  // Admin > Settings > Social Media Links controls which icons show up —
  // any platform left blank there is simply skipped here.
  const socialIcons = social
    ? [
        { key: 'instagram', href: social.instagram, label: 'Instagram', Icon: Instagram },
        { key: 'facebook', href: social.facebook, label: 'Facebook', Icon: Facebook },
        { key: 'youtube', href: social.youtube, label: 'YouTube', Icon: Youtube },
        { key: 'twitter', href: social.twitter, label: 'Twitter / X', Icon: Twitter },
        { key: 'linkedin', href: social.linkedin, label: 'LinkedIn', Icon: Linkedin },
        { key: 'whatsapp', href: social.whatsapp, label: 'WhatsApp', Icon: MessageCircle },
      ].filter((s) => s.href && s.href.trim())
    : [];

  return (
    <footer className="mt-16 border-t border-border/60 bg-primary text-primary-foreground">
      <div className="container-boutique grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <h3 className="font-serif text-2xl font-bold text-secondary">AruhiHandlooms</h3>
          <p className="mt-3 text-sm text-primary-foreground/80">
            Handwoven ethnic wear from master artisans across India. Crafted with
            love, delivered with care.
          </p>
          {store?.address && (
            <p className="mt-3 text-xs text-primary-foreground/70">
              {store.address}
            </p>
          )}
          {store?.gstin && (
            <p className="mt-1 text-xs text-primary-foreground/70">
              GSTIN: {store.gstin}
            </p>
          )}
        </div>
        <div>
          <h4 className="text-sm font-semibold uppercase tracking-wider text-secondary">
            Shop
          </h4>
          <ul className="mt-3 space-y-2 text-sm text-primary-foreground/80">
            <li><Link href="/shop" className="hover:text-secondary">All Products</Link></li>
            <li><Link href="/category/silk-sarees" className="hover:text-secondary">Silk Sarees</Link></li>
            <li><Link href="/shop?category=Lehenga" className="hover:text-secondary">Lehenga</Link></li>
            <li><Link href="/shop?category=Bridal" className="hover:text-secondary">Bridal</Link></li>
            <li><Link href="/gift-cards" className="hover:text-secondary">Gift Cards</Link></li>
            <li><Link href="/refer-earn" className="hover:text-secondary">Refer & Earn</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="text-sm font-semibold uppercase tracking-wider text-secondary">
            Help
          </h4>
          <ul className="mt-3 space-y-2 text-sm text-primary-foreground/80">
            <li><Link href="/track" className="hover:text-secondary">Track Order</Link></li>
            <li><Link href="/cart" className="hover:text-secondary">Cart</Link></li>
            <li><Link href="/checkout" onClick={() => { clearBuyNow(); markCheckoutEntry(); }} className="hover:text-secondary">Checkout</Link></li>
            <li><Link href="/about" className="hover:text-secondary">About Us</Link></li>
            <li><Link href="/contact" className="hover:text-secondary">Contact Us</Link></li>
            {/* Admin link intentionally omitted for security */}
            <li><Link href="/legal/shipping-policy" className="hover:text-secondary">Shipping & Returns</Link></li>
            <li><Link href="/legal/refund-policy" className="hover:text-secondary">Refund & Cancellation</Link></li>
            <li><Link href="/legal/privacy-policy" className="hover:text-secondary">Privacy Policy</Link></li>
            <li><Link href="/legal/terms-conditions" className="hover:text-secondary">Terms & Conditions</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="text-sm font-semibold uppercase tracking-wider text-secondary">
            Partner With Us
          </h4>
          <ul className="mt-3 space-y-2 text-sm text-primary-foreground/80">
            <li><Link href="/vendor-registration" className="hover:text-secondary">Vendor Registration</Link></li>
            <li><Link href="/vendor-login" className="hover:text-secondary">Vendor Login</Link></li>
            <li><Link href="/reseller-registration" className="hover:text-secondary">Reseller Registration</Link></li>
            <li><Link href="/reseller-login" className="hover:text-secondary">Reseller Login</Link></li>
            <li><Link href="/affiliate-program" className="hover:text-secondary">Affiliate Program</Link></li>
            <li><Link href="/loyalty" className="hover:text-secondary">Loyalty Rewards</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="text-sm font-semibold uppercase tracking-wider text-secondary">
            Connect
          </h4>
          <div className="mt-3 flex flex-wrap gap-3">
            {socialIcons.map(({ key, href, label, Icon }) => (
              <a
                key={key}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={label}
                className="rounded-full bg-primary-foreground/10 p-2 transition-colors hover:bg-secondary hover:text-secondary-foreground"
              >
                <Icon className="h-4 w-4" />
              </a>
            ))}
            {store?.support_email && (
              <a
                href={`mailto:${store.support_email}`}
                aria-label="Email"
                className="rounded-full bg-primary-foreground/10 p-2 transition-colors hover:bg-secondary hover:text-secondary-foreground"
              >
                <Mail className="h-4 w-4" />
              </a>
            )}
            {store?.support_phone && (
              <a
                href={`tel:${store.support_phone.replace(/\s+/g, '')}`}
                aria-label="Phone"
                className="rounded-full bg-primary-foreground/10 p-2 transition-colors hover:bg-secondary hover:text-secondary-foreground"
              >
                <Phone className="h-4 w-4" />
              </a>
            )}
          </div>
          {store?.support_phone && (
            <p className="mt-4 text-xs text-primary-foreground/70">
              {store.support_phone}
              <br />
              Mon–Sat, 10am–7pm IST
            </p>
          )}
          <h4 className="mt-5 text-sm font-semibold uppercase tracking-wider text-secondary">
            Newsletter
          </h4>
          <p className="mt-2 text-xs text-primary-foreground/70">
            Get first access to new arrivals and offers.
          </p>
          <NewsletterSignup />
        </div>
      </div>
      <div className="border-t border-primary-foreground/10 py-4">
        <div className="container-boutique flex flex-col items-center justify-between gap-2 text-xs text-primary-foreground/60 sm:flex-row">
          <p>© {new Date().getFullYear()} AruhiHandlooms. All rights reserved.</p>
          <p>Crafted in India · Handloom certified</p>
        </div>
      </div>
    </footer>
  );
}
